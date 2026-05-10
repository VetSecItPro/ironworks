/**
 * SSRF guard — proper IP-after-DNS validation.
 *
 * Replaces the prior regex-only hostname check (server/src/adapters/http/execute.ts:9-18)
 * which had bypasses including decimal/hex/octal IPv4, IPv6-mapped IPv4 ([::ffff:127.0.0.1]),
 * IPv6 unique-local (fc00::/7), IPv6 link-local (fe80::/10), and internal hostnames
 * (metadata.google.internal, *.svc.cluster.local). DNS rebinding was also possible.
 *
 * Found by /sec-ship audit on 2026-05-09 as SEC-SSRF-HIGH-003.
 *
 * Strategy:
 *  1. Reject hostnames that match known internal/cloud-metadata patterns BEFORE DNS.
 *     This catches metadata.google.internal etc. without trusting DNS to be honest.
 *  2. Resolve the hostname via dns.lookup(all: true) to get every address the OS
 *     would route to. (Important for hostnames that resolve to multiple IPs.)
 *  3. For each address, verify it is NOT in any private/reserved/loopback range,
 *     including IPv6-mapped-IPv4 forms.
 *  4. If the hostname IS already a literal IP, parse it (`net.isIP` understands
 *     decimal, hex, octal, IPv6-mapped). Reject without DNS if it resolves to
 *     a forbidden range.
 *
 * Limitations:
 *  - DNS rebinding: between this check and the actual fetch, DNS could re-resolve
 *    to a different IP. Fully mitigating that requires custom socket wiring (pin
 *    the resolved IP and connect to that exact address). Out of scope for this
 *    fix; documented as future hardening.
 *  - This guard does NOT block legitimately-public IPs that happen to host malicious
 *    services. SSRF mitigates "agent talks to your internal infrastructure"; broader
 *    egress filtering is the operator's job (firewall / VPC).
 */
import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * Hostname patterns that should never be reachable from an HTTP adapter.
 * Cloud metadata + internal-cluster suffixes that DNS may legitimately resolve
 * but no agent should ever target.
 */
const FORBIDDEN_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata",
  "metadata.azure.com",
  "metadata.aws.amazon.com",
  "instance-data",
  "instance-data.amazonaws.com",
]);

const FORBIDDEN_HOSTNAME_SUFFIXES: readonly string[] = [".svc.cluster.local", ".internal", ".local", ".consul"];

/**
 * IPv4 ranges (CIDR) that are forbidden as SSRF destinations.
 * Source: RFC 1918, RFC 6890, plus cloud-metadata special addresses.
 */
const PRIVATE_IPV4_RANGES: ReadonlyArray<{ network: number; prefix: number; reason: string }> = [
  { network: ipv4ToInt("0.0.0.0"), prefix: 8, reason: "this-network (RFC 6890)" },
  { network: ipv4ToInt("10.0.0.0"), prefix: 8, reason: "RFC 1918 private" },
  { network: ipv4ToInt("100.64.0.0"), prefix: 10, reason: "RFC 6598 carrier-grade NAT" },
  { network: ipv4ToInt("127.0.0.0"), prefix: 8, reason: "loopback" },
  { network: ipv4ToInt("169.254.0.0"), prefix: 16, reason: "link-local + cloud metadata (169.254.169.254)" },
  { network: ipv4ToInt("172.16.0.0"), prefix: 12, reason: "RFC 1918 private" },
  { network: ipv4ToInt("192.0.0.0"), prefix: 24, reason: "IETF protocol assignments" },
  { network: ipv4ToInt("192.0.2.0"), prefix: 24, reason: "TEST-NET-1" },
  { network: ipv4ToInt("192.168.0.0"), prefix: 16, reason: "RFC 1918 private" },
  { network: ipv4ToInt("198.18.0.0"), prefix: 15, reason: "benchmark testing" },
  { network: ipv4ToInt("198.51.100.0"), prefix: 24, reason: "TEST-NET-2" },
  { network: ipv4ToInt("203.0.113.0"), prefix: 24, reason: "TEST-NET-3" },
  { network: ipv4ToInt("224.0.0.0"), prefix: 4, reason: "multicast" },
  { network: ipv4ToInt("240.0.0.0"), prefix: 4, reason: "reserved future use" },
];

function ipv4ToInt(addr: string): number {
  const parts = addr.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    throw new Error(`bad IPv4 in PRIVATE_IPV4_RANGES table: ${addr}`);
  }
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function isIpv4Forbidden(addr: string): { forbidden: boolean; reason?: string } {
  const ip = ipv4ToInt(addr);
  for (const range of PRIVATE_IPV4_RANGES) {
    const mask = range.prefix === 0 ? 0 : (~0 << (32 - range.prefix)) >>> 0;
    if ((ip & mask) === (range.network & mask)) {
      return { forbidden: true, reason: range.reason };
    }
  }
  return { forbidden: false };
}

/**
 * Check an IPv6 address for forbidden ranges.
 *
 * Forbidden:
 *  - ::1 (loopback)
 *  - ::ffff:0:0/96 (IPv4-mapped — must check the embedded v4)
 *  - fc00::/7 (unique local)
 *  - fe80::/10 (link-local)
 *  - ff00::/8 (multicast)
 *  - 2001:db8::/32 (documentation)
 *  - :: (unspecified)
 *
 * Implementation note: Node's net.isIPv6 does NOT parse the address into structured
 * form. We do a simple prefix check after normalizing to lowercase + expanding "::".
 */
function isIpv6Forbidden(addr: string): { forbidden: boolean; reason?: string } {
  const lower = addr.toLowerCase();

  // Unspecified / loopback - exact strings.
  if (lower === "::" || lower === "::0") return { forbidden: true, reason: "unspecified" };
  if (lower === "::1") return { forbidden: true, reason: "loopback" };

  // IPv4-mapped IPv6: ::ffff:a.b.c.d or ::ffff:0:a.b.c.d - extract the v4 portion and re-check.
  const v4MappedMatch = lower.match(/^::ffff(?::0)?:([0-9.]+)$/);
  if (v4MappedMatch?.[1] && net.isIPv4(v4MappedMatch[1])) {
    const v4 = isIpv4Forbidden(v4MappedMatch[1]);
    if (v4.forbidden) return { forbidden: true, reason: `IPv4-mapped: ${v4.reason}` };
  }

  // Hex-form IPv4-mapped: ::ffff:7f00:1 (= 127.0.0.1) - extract last 32 bits.
  const v4MappedHexMatch = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (v4MappedHexMatch?.[1] && v4MappedHexMatch[2]) {
    const high = Number.parseInt(v4MappedHexMatch[1], 16);
    const low = Number.parseInt(v4MappedHexMatch[2], 16);
    if (Number.isFinite(high) && Number.isFinite(low)) {
      const a = (high >> 8) & 0xff;
      const b = high & 0xff;
      const c = (low >> 8) & 0xff;
      const d = low & 0xff;
      const v4 = isIpv4Forbidden(`${a}.${b}.${c}.${d}`);
      if (v4.forbidden) return { forbidden: true, reason: `IPv4-mapped (hex): ${v4.reason}` };
    }
  }

  // Prefix checks. We don't fully parse - just prefix-match the canonical form's
  // first segments. Acceptable because lookup() returns a normalized address.
  if (/^f[c-d][0-9a-f]{2}:/.test(lower)) return { forbidden: true, reason: "unique local (fc00::/7)" };
  if (/^fe[8-9a-b][0-9a-f]:/.test(lower)) return { forbidden: true, reason: "link-local (fe80::/10)" };
  if (/^ff[0-9a-f]{2}:/.test(lower)) return { forbidden: true, reason: "multicast (ff00::/8)" };
  if (/^2001:db8:/.test(lower)) return { forbidden: true, reason: "documentation (2001:db8::/32)" };

  return { forbidden: false };
}

/**
 * Result of an SSRF check.
 *
 * `ok=true` means the URL passed all checks and is safe to fetch.
 * `ok=false` returns an operator-readable reason and the URL/IP that was rejected.
 */
export interface SsrfCheckResult {
  ok: boolean;
  reason?: string;
  rejectedHost?: string;
  rejectedIp?: string;
}

/**
 * Validate that a URL is safe from SSRF (does not resolve to private/internal).
 *
 * The function is async because DNS lookup may be required when the hostname
 * isn't already a literal IP. Callers should await before fetching.
 *
 * @param urlString - the URL string to validate
 * @param opts.dnsLookup - optional override for testing (defaults to dns.promises.lookup)
 */
export async function checkUrlForSsrf(
  urlString: string,
  opts?: { dnsLookup?: typeof lookup },
): Promise<SsrfCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }

  const protocol = parsed.protocol.replace(/:$/, "").toLowerCase();
  if (protocol !== "http" && protocol !== "https") {
    return { ok: false, reason: `disallowed protocol "${protocol}"` };
  }

  // URL parsing leaves brackets on IPv6 hostnames ("[::1]"); strip them.
  // A percent zone-id ("%eth0") may also be present in IPv6; strip too.
  const hostnameRaw = parsed.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  const hostname = hostnameRaw.split("%")[0] ?? "";
  if (!hostname) return { ok: false, reason: "empty hostname" };

  // Fast-path: hostname allowlist of forbidden patterns BEFORE DNS.
  if (FORBIDDEN_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: `hostname matches cloud/metadata block: ${hostname}`, rejectedHost: hostname };
  }
  for (const suffix of FORBIDDEN_HOSTNAME_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      return { ok: false, reason: `hostname suffix is internal: ${suffix}`, rejectedHost: hostname };
    }
  }
  // The bare "localhost" - reject before DNS even though dns.lookup would resolve it.
  if (hostname === "localhost") {
    return { ok: false, reason: "hostname is localhost", rejectedHost: hostname };
  }

  // If hostname is already an IP literal, check it directly without DNS.
  // net.isIP returns 4 for IPv4, 6 for IPv6, 0 for non-IP. It accepts
  // dotted-decimal but NOT decimal/hex/octal forms - those need expansion.
  const ipKind = net.isIP(hostname);
  if (ipKind === 4) {
    const v4 = isIpv4Forbidden(hostname);
    if (v4.forbidden) return { ok: false, reason: `forbidden IPv4: ${v4.reason}`, rejectedIp: hostname };
    return { ok: true };
  }
  if (ipKind === 6) {
    const v6 = isIpv6Forbidden(hostname);
    if (v6.forbidden) return { ok: false, reason: `forbidden IPv6: ${v6.reason}`, rejectedIp: hostname };
    return { ok: true };
  }

  // Hostname is non-literal (or numeric-but-not-dotted). DNS-resolve all addresses.
  const lookupFn = opts?.dnsLookup ?? lookup;
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookupFn(hostname, { all: true });
  } catch (err) {
    return { ok: false, reason: `DNS lookup failed: ${(err as Error).message}`, rejectedHost: hostname };
  }
  if (addresses.length === 0) {
    return { ok: false, reason: "DNS returned no addresses", rejectedHost: hostname };
  }

  for (const { address, family } of addresses) {
    if (family === 4) {
      const v4 = isIpv4Forbidden(address);
      if (v4.forbidden) {
        return { ok: false, reason: `${hostname} resolves to forbidden IPv4: ${v4.reason}`, rejectedIp: address };
      }
    } else if (family === 6) {
      const v6 = isIpv6Forbidden(address);
      if (v6.forbidden) {
        return { ok: false, reason: `${hostname} resolves to forbidden IPv6: ${v6.reason}`, rejectedIp: address };
      }
    }
  }

  return { ok: true };
}

/**
 * Convenience helper: throw if SSRF check fails. Used by the HTTP adapter
 * so the caller can use a single try/catch.
 */
export async function assertNoSsrf(urlString: string, opts?: { dnsLookup?: typeof lookup }): Promise<void> {
  const result = await checkUrlForSsrf(urlString, opts);
  if (!result.ok) {
    const detail = result.rejectedIp ? ` (resolved to ${result.rejectedIp})` : "";
    throw new Error(`HTTP adapter URL blocked: ${result.reason}${detail}`);
  }
}

// Test-only re-exports.
export const __testInternals = { isIpv4Forbidden, isIpv6Forbidden, ipv4ToInt };

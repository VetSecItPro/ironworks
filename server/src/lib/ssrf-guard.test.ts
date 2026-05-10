import { describe, expect, it } from "vitest";
import { assertNoSsrf, checkUrlForSsrf } from "./ssrf-guard.js";

/**
 * SSRF guard regression tests.
 *
 * Tests pass `dnsLookup` overrides where a deterministic answer is needed -
 * tests must never depend on real DNS resolution (slow + flaky).
 */
describe("SSRF guard - hostname blocklists", () => {
  it("rejects bare 'localhost' before DNS", async () => {
    const r = await checkUrlForSsrf("http://localhost/");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("localhost");
  });

  it("rejects cloud-metadata hostnames", async () => {
    const r = await checkUrlForSsrf("http://metadata.google.internal/computeMetadata/v1/");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("cloud/metadata");
  });

  it("rejects k8s internal suffix", async () => {
    const r = await checkUrlForSsrf("http://my-service.svc.cluster.local/");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("internal");
  });

  it("rejects mDNS-style .local suffix", async () => {
    const r = await checkUrlForSsrf("http://printer.local/status");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("internal");
  });

  it("rejects .consul hostnames", async () => {
    const r = await checkUrlForSsrf("http://my-svc.consul/");
    expect(r.ok).toBe(false);
  });
});

describe("SSRF guard - protocol", () => {
  it("rejects file://", async () => {
    const r = await checkUrlForSsrf("file:///etc/passwd");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("disallowed protocol");
  });

  it("rejects gopher://", async () => {
    const r = await checkUrlForSsrf("gopher://localhost:11211/");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("disallowed protocol");
  });

  it("accepts http:// and https://", async () => {
    const fakeLookup = async () => [{ address: "8.8.8.8", family: 4 }];
    const http = await checkUrlForSsrf("http://example.com/", { dnsLookup: fakeLookup as never });
    const https = await checkUrlForSsrf("https://example.com/", { dnsLookup: fakeLookup as never });
    expect(http.ok).toBe(true);
    expect(https.ok).toBe(true);
  });
});

describe("SSRF guard - IPv4 literal forms", () => {
  it("rejects 127.0.0.1 (loopback)", async () => {
    const r = await checkUrlForSsrf("http://127.0.0.1/");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("loopback");
  });

  it("rejects 10.0.0.1 (RFC 1918)", async () => {
    const r = await checkUrlForSsrf("http://10.0.0.1/");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("RFC 1918");
  });

  it("rejects 172.16.0.1 and 172.31.255.255 (RFC 1918 boundaries)", async () => {
    expect((await checkUrlForSsrf("http://172.16.0.1/")).ok).toBe(false);
    expect((await checkUrlForSsrf("http://172.31.255.255/")).ok).toBe(false);
  });

  it("rejects 192.168.1.1", async () => {
    const r = await checkUrlForSsrf("http://192.168.1.1/");
    expect(r.ok).toBe(false);
  });

  it("rejects 169.254.169.254 (cloud metadata)", async () => {
    const r = await checkUrlForSsrf("http://169.254.169.254/latest/meta-data/");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("link-local");
  });

  it("rejects 0.0.0.0", async () => {
    const r = await checkUrlForSsrf("http://0.0.0.0/");
    expect(r.ok).toBe(false);
  });

  it("rejects 100.64.0.1 (carrier-grade NAT)", async () => {
    const r = await checkUrlForSsrf("http://100.64.0.1/");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("carrier-grade NAT");
  });

  it("accepts public IPv4 8.8.8.8", async () => {
    const r = await checkUrlForSsrf("http://8.8.8.8/");
    expect(r.ok).toBe(true);
  });

  it("rejects 172.15.0.1 (just-below RFC1918)", async () => {
    // Belongs to 172.0.0.0/8 public space - should pass.
    const r = await checkUrlForSsrf("http://172.15.0.1/");
    expect(r.ok).toBe(true);
  });
});

describe("SSRF guard - IPv6 literal forms", () => {
  it("rejects ::1 (loopback)", async () => {
    const r = await checkUrlForSsrf("http://[::1]/");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("loopback");
  });

  it("rejects fc00::1 (unique local)", async () => {
    const r = await checkUrlForSsrf("http://[fc00::1]/");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("unique local");
  });

  it("rejects fe80::1 (link-local)", async () => {
    const r = await checkUrlForSsrf("http://[fe80::1]/");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("link-local");
  });

  it("rejects ff02::1 (multicast)", async () => {
    const r = await checkUrlForSsrf("http://[ff02::1]/");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("multicast");
  });

  it("rejects IPv4-mapped IPv6 ::ffff:127.0.0.1", async () => {
    const r = await checkUrlForSsrf("http://[::ffff:127.0.0.1]/");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("IPv4-mapped");
  });

  it("rejects IPv4-mapped IPv6 hex form ::ffff:7f00:1", async () => {
    const r = await checkUrlForSsrf("http://[::ffff:7f00:1]/");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("IPv4-mapped");
  });

  it("accepts public IPv6 2001:4860:4860::8888 (Google DNS)", async () => {
    const r = await checkUrlForSsrf("http://[2001:4860:4860::8888]/");
    expect(r.ok).toBe(true);
  });
});

describe("SSRF guard - DNS resolution path", () => {
  it("rejects hostname that resolves to a private IP", async () => {
    const fakeLookup = async () => [{ address: "192.168.1.1", family: 4 }];
    const r = await checkUrlForSsrf("http://attacker-controlled.example.com/", {
      dnsLookup: fakeLookup as never,
    });
    expect(r.ok).toBe(false);
    expect(r.rejectedIp).toBe("192.168.1.1");
  });

  it("rejects hostname where ANY resolved IP is private (multi-AAAA attack)", async () => {
    const fakeLookup = async () => [
      { address: "8.8.8.8", family: 4 }, // public
      { address: "10.0.0.1", family: 4 }, // private!
    ];
    const r = await checkUrlForSsrf("http://multi-record.example.com/", {
      dnsLookup: fakeLookup as never,
    });
    expect(r.ok).toBe(false);
    expect(r.rejectedIp).toBe("10.0.0.1");
  });

  it("rejects hostname that resolves to IPv6 link-local", async () => {
    const fakeLookup = async () => [{ address: "fe80::1", family: 6 }];
    const r = await checkUrlForSsrf("http://example.com/", { dnsLookup: fakeLookup as never });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("link-local");
  });

  it("accepts hostname that resolves only to public IPs", async () => {
    const fakeLookup = async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "2001:4860:4860::8888", family: 6 },
    ];
    const r = await checkUrlForSsrf("http://example.com/", { dnsLookup: fakeLookup as never });
    expect(r.ok).toBe(true);
  });

  it("rejects on DNS lookup failure", async () => {
    const fakeLookup = async () => {
      throw new Error("ENOTFOUND example.invalid");
    };
    const r = await checkUrlForSsrf("http://example.invalid/", { dnsLookup: fakeLookup as never });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("DNS lookup failed");
  });

  it("rejects when DNS returns no addresses", async () => {
    const fakeLookup = async () => [];
    const r = await checkUrlForSsrf("http://no-records.example/", { dnsLookup: fakeLookup as never });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("no addresses");
  });
});

describe("SSRF guard - assertNoSsrf throws helper", () => {
  it("throws on private IP literal", async () => {
    await expect(assertNoSsrf("http://127.0.0.1/")).rejects.toThrow(/blocked/);
  });

  it("includes resolved IP in the error when DNS yields a private address", async () => {
    const fakeLookup = async () => [{ address: "10.0.0.1", family: 4 }];
    await expect(assertNoSsrf("http://attacker.example/", { dnsLookup: fakeLookup as never })).rejects.toThrow(
      /10\.0\.0\.1/,
    );
  });

  it("does not throw on public IP", async () => {
    const fakeLookup = async () => [{ address: "8.8.8.8", family: 4 }];
    await expect(assertNoSsrf("http://example.com/", { dnsLookup: fakeLookup as never })).resolves.toBeUndefined();
  });
});

describe("SSRF guard - malformed URL handling", () => {
  it("rejects empty URL", async () => {
    const r = await checkUrlForSsrf("");
    expect(r.ok).toBe(false);
  });

  it("rejects garbage URL", async () => {
    const r = await checkUrlForSsrf("not a url");
    expect(r.ok).toBe(false);
  });

  it("rejects URL with empty hostname", async () => {
    const r = await checkUrlForSsrf("http:///path");
    expect(r.ok).toBe(false);
  });
});

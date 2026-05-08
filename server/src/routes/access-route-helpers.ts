import { createHash, generateKeyPairSync, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "@ironworksai/db";
import { authUsers, invites, joinRequests } from "@ironworksai/db";
import { type DeploymentExposure, type DeploymentMode, PERMISSION_KEYS } from "@ironworksai/shared";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { forbidden, unauthorized } from "../errors.js";
import { accessService, agentService, boardAuthService, budgetService } from "../services/index.js";
import { userInviteService } from "../services/user-invites.js";
import { assertCompanyAccess } from "./authz.js";

export interface AccessRoutesOpts {
  deploymentMode: DeploymentMode;
  deploymentExposure: DeploymentExposure;
  bindHost: string;
  allowedHostnames: string[];
}

export type JoinDiagnostic = {
  code: string;
  level: "info" | "warn";
  message: string;
  hint?: string;
};

export interface AvailableSkill {
  name: string;
  description: string;
  isIronworksManaged: boolean;
}

// ── Module-level pure helpers (used by ≥2 sub-routers) ──

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const INVITE_TOKEN_PREFIX = "pcp_invite_";
const INVITE_TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const INVITE_TOKEN_SUFFIX_LENGTH = 8;
export const INVITE_TOKEN_MAX_RETRIES = 5;
const COMPANY_INVITE_TTL_MS = 10 * 60 * 1000;

export function createInviteToken() {
  const bytes = randomBytes(INVITE_TOKEN_SUFFIX_LENGTH);
  let suffix = "";
  for (let idx = 0; idx < INVITE_TOKEN_SUFFIX_LENGTH; idx += 1) {
    suffix += INVITE_TOKEN_ALPHABET[bytes[idx]! % INVITE_TOKEN_ALPHABET.length];
  }
  return `${INVITE_TOKEN_PREFIX}${suffix}`;
}

export function createClaimSecret() {
  return `pcp_claim_${randomBytes(24).toString("hex")}`;
}

export function companyInviteExpiresAt(nowMs: number = Date.now()) {
  return new Date(nowMs + COMPANY_INVITE_TTL_MS);
}

export function tokenHashesMatch(left: string, right: string) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function requestBaseUrl(req: Request) {
  const forwardedProto = req.header("x-forwarded-proto");
  const proto = forwardedProto?.split(",")[0]?.trim() || req.protocol || "http";
  const host = req.header("x-forwarded-host")?.split(",")[0]?.trim() || req.header("host");
  if (!host) return "";
  return `${proto}://${host}`;
}

export function buildCliAuthApprovalPath(challengeId: string, token: string) {
  return `/cli-auth/${challengeId}?token=${encodeURIComponent(token)}`;
}

export function readSkillMarkdown(skillName: string): string | null {
  const normalized = skillName.trim().toLowerCase();
  if (
    normalized !== "ironworks" &&
    normalized !== "ironworks-create-agent" &&
    normalized !== "ironworks-create-plugin" &&
    normalized !== "para-memory-files"
  )
    return null;
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "../../skills", normalized, "SKILL.md"), // published: dist/routes/ -> <pkg>/skills/
    path.resolve(process.cwd(), "skills", normalized, "SKILL.md"), // cwd (e.g. monorepo root)
    path.resolve(moduleDir, "../../../skills", normalized, "SKILL.md"), // dev: src/routes/ -> repo root/skills/
  ];
  for (const skillPath of candidates) {
    try {
      return fs.readFileSync(skillPath, "utf8");
    } catch {
      // Continue to next candidate.
    }
  }
  return null;
}

/** Resolve the Ironworks repo skills directory (built-in / managed skills). */
export function resolveIronworksSkillsDir(): string | null {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "../../skills"), // published
    path.resolve(process.cwd(), "skills"), // cwd (monorepo root)
    path.resolve(moduleDir, "../../../skills"), // dev
  ];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      /* skip */
    }
  }
  return null;
}

/** Parse YAML frontmatter from a SKILL.md file to extract the description. */
export function parseSkillFrontmatter(markdown: string): { description: string } {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { description: "" };
  const yaml = match[1];
  // Extract description — handles both single-line and multi-line YAML values
  const descMatch = yaml.match(
    /^description:\s*(?:>\s*\n((?:\s{2,}[^\n]*\n?)+)|[|]\s*\n((?:\s{2,}[^\n]*\n?)+)|["']?(.*?)["']?\s*$)/m,
  );
  if (!descMatch) return { description: "" };
  const raw = descMatch[1] ?? descMatch[2] ?? descMatch[3] ?? "";
  return {
    description: raw
      .split("\n")
      .map((l: string) => l.trim())
      .filter(Boolean)
      .join(" ")
      .trim(),
  };
}

/** Discover all available Claude Code skills from ~/.claude/skills/. */
export function listAvailableSkills(): AvailableSkill[] {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const claudeSkillsDir = path.join(homeDir, ".claude", "skills");
  const ironworksSkillsDir = resolveIronworksSkillsDir();

  // Build set of Ironworks-managed skill names
  const ironworksSkillNames = new Set<string>();
  if (ironworksSkillsDir) {
    try {
      for (const entry of fs.readdirSync(ironworksSkillsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) ironworksSkillNames.add(entry.name);
      }
    } catch {
      /* skip */
    }
  }

  const skills: AvailableSkill[] = [];

  try {
    const entries = fs.readdirSync(claudeSkillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(".")) continue;
      const skillMdPath = path.join(claudeSkillsDir, entry.name, "SKILL.md");
      let description = "";
      try {
        const md = fs.readFileSync(skillMdPath, "utf8");
        description = parseSkillFrontmatter(md).description;
      } catch {
        /* no SKILL.md or unreadable */
      }
      skills.push({
        name: entry.name,
        description,
        isIronworksManaged: ironworksSkillNames.has(entry.name),
      });
    }
  } catch {
    /* ~/.claude/skills/ doesn't exist */
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

export function toJoinRequestResponse(row: typeof joinRequests.$inferSelect) {
  const { claimSecretHash: _claimSecretHash, ...safe } = row;
  return safe;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isLoopbackHost(hostname: string): boolean {
  const value = hostname.trim().toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

export function normalizeHostname(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end > 1 ? trimmed.slice(1, end).toLowerCase() : trimmed.toLowerCase();
  }
  const firstColon = trimmed.indexOf(":");
  if (firstColon > -1) return trimmed.slice(0, firstColon).toLowerCase();
  return trimmed.toLowerCase();
}

function normalizeHeaderValue(value: unknown, depth: number = 0): string | null {
  const direct = nonEmptyTrimmedString(value);
  if (direct) return direct;
  if (!isPlainObject(value) || depth >= 3) return null;

  const candidateKeys = [
    "value",
    "token",
    "secret",
    "apiKey",
    "api_key",
    "auth",
    "authToken",
    "auth_token",
    "accessToken",
    "access_token",
    "authorization",
    "bearer",
    "header",
    "raw",
    "text",
    "string",
  ];
  for (const key of candidateKeys) {
    if (!Object.hasOwn(value, key)) continue;
    const normalized = normalizeHeaderValue((value as Record<string, unknown>)[key], depth + 1);
    if (normalized) return normalized;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 1) {
    const [singleKey, singleValue] = entries[0];
    const normalizedKey = singleKey.trim().toLowerCase();
    if (
      normalizedKey !== "type" &&
      normalizedKey !== "version" &&
      normalizedKey !== "secretid" &&
      normalizedKey !== "secret_id"
    ) {
      const normalized = normalizeHeaderValue(singleValue, depth + 1);
      if (normalized) return normalized;
    }
  }

  return null;
}

function extractHeaderEntries(input: unknown): Array<[string, unknown]> {
  if (isPlainObject(input)) {
    return Object.entries(input);
  }
  if (!Array.isArray(input)) {
    return [];
  }

  const entries: Array<[string, unknown]> = [];
  for (const item of input) {
    if (Array.isArray(item)) {
      const key = nonEmptyTrimmedString(item[0]);
      if (!key) continue;
      entries.push([key, item[1]]);
      continue;
    }
    if (!isPlainObject(item)) continue;

    const mapped = item as Record<string, unknown>;
    const explicitKey =
      nonEmptyTrimmedString(mapped.key) ?? nonEmptyTrimmedString(mapped.name) ?? nonEmptyTrimmedString(mapped.header);
    if (explicitKey) {
      const explicitValue = Object.hasOwn(mapped, "value")
        ? mapped.value
        : Object.hasOwn(mapped, "token")
          ? mapped.token
          : Object.hasOwn(mapped, "secret")
            ? mapped.secret
            : mapped;
      entries.push([explicitKey, explicitValue]);
      continue;
    }

    const singleEntry = Object.entries(mapped);
    if (singleEntry.length === 1) {
      entries.push(singleEntry[0] as [string, unknown]);
    }
  }

  return entries;
}

export function normalizeHeaderMap(input: unknown): Record<string, string> | undefined {
  const entries = extractHeaderEntries(input);
  if (entries.length === 0) return undefined;

  const out: Record<string, string> = {};
  for (const [key, value] of entries) {
    const normalizedValue = normalizeHeaderValue(value);
    if (!normalizedValue) continue;
    const trimmedKey = key.trim();
    const trimmedValue = normalizedValue.trim();
    if (!trimmedKey || !trimmedValue) continue;
    out[trimmedKey] = trimmedValue;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function nonEmptyTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function headerMapHasKeyIgnoreCase(headers: Record<string, string>, targetKey: string): boolean {
  const normalizedTarget = targetKey.trim().toLowerCase();
  return Object.keys(headers).some((key) => key.trim().toLowerCase() === normalizedTarget);
}

export function headerMapGetIgnoreCase(headers: Record<string, string>, targetKey: string): string | null {
  const normalizedTarget = targetKey.trim().toLowerCase();
  const key = Object.keys(headers).find((candidate) => candidate.trim().toLowerCase() === normalizedTarget);
  if (!key) return null;
  const value = headers[key];
  return typeof value === "string" ? value : null;
}

export function tokenFromAuthorizationHeader(rawHeader: string | null): string | null {
  const trimmed = nonEmptyTrimmedString(rawHeader);
  if (!trimmed) return null;
  const bearerMatch = trimmed.match(/^bearer\s+(.+)$/i);
  if (bearerMatch?.[1]) {
    return nonEmptyTrimmedString(bearerMatch[1]);
  }
  return trimmed;
}

export function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return null;
}

export function generateEd25519PrivateKeyPem(): string {
  const generated = generateKeyPairSync("ed25519");
  return generated.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

export function isLocalImplicit(req: Request) {
  return req.actor.type === "board" && req.actor.source === "local_implicit";
}

export async function resolveActorEmail(db: Db, req: Request): Promise<string | null> {
  if (isLocalImplicit(req)) return "local@ironworks.local";
  const userId = req.actor.userId;
  if (!userId) return null;
  const user = await db
    .select({ email: authUsers.email })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .then((rows) => rows[0] ?? null);
  return user?.email ?? null;
}

export function requestIp(req: Request) {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.ip || "unknown";
}

export function isInviteTokenHashCollisionError(error: unknown) {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause ?? null];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const code = "code" in candidate && typeof candidate.code === "string" ? candidate.code : null;
    const message = "message" in candidate && typeof candidate.message === "string" ? candidate.message : "";
    const constraint =
      "constraint" in candidate && typeof candidate.constraint === "string" ? candidate.constraint : null;
    if (code !== "23505") continue;
    if (constraint === "invites_token_hash_unique_idx") return true;
    if (message.includes("invites_token_hash_unique_idx")) return true;
  }
  return false;
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

// ── Gateway defaults / join-request normalization ──

export function buildJoinDefaultsPayloadForAccept(input: {
  adapterType: string | null;
  defaultsPayload: unknown;
  ironworksApiUrl?: unknown;
  inboundOpenClawAuthHeader?: string | null;
  inboundOpenClawTokenHeader?: string | null;
}): unknown {
  if (input.adapterType !== "openclaw_gateway") {
    return input.defaultsPayload;
  }

  const merged = isPlainObject(input.defaultsPayload)
    ? { ...(input.defaultsPayload as Record<string, unknown>) }
    : ({} as Record<string, unknown>);

  if (!nonEmptyTrimmedString(merged.ironworksApiUrl)) {
    const legacyIronworksApiUrl = nonEmptyTrimmedString(input.ironworksApiUrl);
    if (legacyIronworksApiUrl) merged.ironworksApiUrl = legacyIronworksApiUrl;
  }
  const mergedHeaders = normalizeHeaderMap(merged.headers) ?? {};

  const inboundOpenClawAuthHeader = nonEmptyTrimmedString(input.inboundOpenClawAuthHeader);
  const inboundOpenClawTokenHeader = nonEmptyTrimmedString(input.inboundOpenClawTokenHeader);
  if (inboundOpenClawTokenHeader && !headerMapHasKeyIgnoreCase(mergedHeaders, "x-openclaw-token")) {
    mergedHeaders["x-openclaw-token"] = inboundOpenClawTokenHeader;
  }
  if (inboundOpenClawAuthHeader && !headerMapHasKeyIgnoreCase(mergedHeaders, "x-openclaw-auth")) {
    mergedHeaders["x-openclaw-auth"] = inboundOpenClawAuthHeader;
  }

  if (Object.keys(mergedHeaders).length > 0) {
    merged.headers = mergedHeaders;
  } else {
    delete merged.headers;
  }

  const discoveredToken =
    headerMapGetIgnoreCase(mergedHeaders, "x-openclaw-token") ??
    headerMapGetIgnoreCase(mergedHeaders, "x-openclaw-auth") ??
    tokenFromAuthorizationHeader(headerMapGetIgnoreCase(mergedHeaders, "authorization"));
  if (discoveredToken && !headerMapHasKeyIgnoreCase(mergedHeaders, "x-openclaw-token")) {
    mergedHeaders["x-openclaw-token"] = discoveredToken;
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

export function mergeJoinDefaultsPayloadForReplay(
  existingDefaultsPayload: unknown,
  nextDefaultsPayload: unknown,
): unknown {
  if (!isPlainObject(existingDefaultsPayload) && !isPlainObject(nextDefaultsPayload)) {
    return nextDefaultsPayload ?? existingDefaultsPayload;
  }
  if (!isPlainObject(existingDefaultsPayload)) {
    return nextDefaultsPayload;
  }
  if (!isPlainObject(nextDefaultsPayload)) {
    return existingDefaultsPayload;
  }

  const merged: Record<string, unknown> = {
    ...(existingDefaultsPayload as Record<string, unknown>),
    ...(nextDefaultsPayload as Record<string, unknown>),
  };

  const existingHeaders = normalizeHeaderMap((existingDefaultsPayload as Record<string, unknown>).headers);
  const nextHeaders = normalizeHeaderMap((nextDefaultsPayload as Record<string, unknown>).headers);
  if (existingHeaders || nextHeaders) {
    merged.headers = {
      ...(existingHeaders ?? {}),
      ...(nextHeaders ?? {}),
    };
  } else if (Object.hasOwn(merged, "headers")) {
    delete merged.headers;
  }

  return merged;
}

export function canReplayOpenClawGatewayInviteAccept(input: {
  requestType: "human" | "agent";
  adapterType: string | null;
  existingJoinRequest: Pick<typeof joinRequests.$inferSelect, "requestType" | "adapterType" | "status"> | null;
}): boolean {
  if (input.requestType !== "agent" || input.adapterType !== "openclaw_gateway") {
    return false;
  }
  if (!input.existingJoinRequest) {
    return false;
  }
  if (
    input.existingJoinRequest.requestType !== "agent" ||
    input.existingJoinRequest.adapterType !== "openclaw_gateway"
  ) {
    return false;
  }
  return input.existingJoinRequest.status === "pending_approval" || input.existingJoinRequest.status === "approved";
}

function summarizeSecretForLog(value: unknown): { present: true; length: number; sha256Prefix: string } | null {
  const trimmed = nonEmptyTrimmedString(value);
  if (!trimmed) return null;
  return {
    present: true,
    length: trimmed.length,
    sha256Prefix: hashToken(trimmed).slice(0, 12),
  };
}

export function summarizeOpenClawGatewayDefaultsForLog(defaultsPayload: unknown) {
  const defaults = isPlainObject(defaultsPayload) ? (defaultsPayload as Record<string, unknown>) : null;
  const headers = defaults ? normalizeHeaderMap(defaults.headers) : undefined;
  const gatewayTokenValue = headers
    ? (headerMapGetIgnoreCase(headers, "x-openclaw-token") ??
      headerMapGetIgnoreCase(headers, "x-openclaw-auth") ??
      tokenFromAuthorizationHeader(headerMapGetIgnoreCase(headers, "authorization")))
    : null;
  return {
    present: Boolean(defaults),
    keys: defaults ? Object.keys(defaults).sort() : [],
    url: defaults ? nonEmptyTrimmedString(defaults.url) : null,
    ironworksApiUrl: defaults ? nonEmptyTrimmedString(defaults.ironworksApiUrl) : null,
    headerKeys: headers ? Object.keys(headers).sort() : [],
    sessionKeyStrategy: defaults ? nonEmptyTrimmedString(defaults.sessionKeyStrategy) : null,
    disableDeviceAuth: defaults ? parseBooleanLike(defaults.disableDeviceAuth) : null,
    waitTimeoutMs: defaults && typeof defaults.waitTimeoutMs === "number" ? defaults.waitTimeoutMs : null,
    devicePrivateKeyPem: defaults ? summarizeSecretForLog(defaults.devicePrivateKeyPem) : null,
    gatewayToken: summarizeSecretForLog(gatewayTokenValue),
  };
}

export function normalizeAgentDefaultsForJoin(input: {
  adapterType: string | null;
  defaultsPayload: unknown;
  deploymentMode: DeploymentMode;
  deploymentExposure: DeploymentExposure;
  bindHost: string;
  allowedHostnames: string[];
}) {
  const fatalErrors: string[] = [];
  const diagnostics: JoinDiagnostic[] = [];
  if (input.adapterType !== "openclaw_gateway") {
    const normalized = isPlainObject(input.defaultsPayload) ? (input.defaultsPayload as Record<string, unknown>) : null;
    return { normalized, diagnostics, fatalErrors };
  }

  if (!isPlainObject(input.defaultsPayload)) {
    diagnostics.push({
      code: "openclaw_gateway_defaults_missing",
      level: "warn",
      message: "No OpenClaw gateway config was provided in agentDefaultsPayload.",
      hint: "Include agentDefaultsPayload.url and headers.x-openclaw-token for OpenClaw gateway joins.",
    });
    fatalErrors.push("agentDefaultsPayload is required for adapterType=openclaw_gateway");
    return {
      normalized: null as Record<string, unknown> | null,
      diagnostics,
      fatalErrors,
    };
  }

  const defaults = input.defaultsPayload as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};

  let gatewayUrl: URL | null = null;
  const rawGatewayUrl = nonEmptyTrimmedString(defaults.url);
  if (!rawGatewayUrl) {
    diagnostics.push({
      code: "openclaw_gateway_url_missing",
      level: "warn",
      message: "OpenClaw gateway URL is missing.",
      hint: "Set agentDefaultsPayload.url to ws:// or wss:// gateway URL.",
    });
    fatalErrors.push("agentDefaultsPayload.url is required");
  } else {
    try {
      gatewayUrl = new URL(rawGatewayUrl);
      if (gatewayUrl.protocol !== "ws:" && gatewayUrl.protocol !== "wss:") {
        diagnostics.push({
          code: "openclaw_gateway_url_protocol",
          level: "warn",
          message: `OpenClaw gateway URL must use ws:// or wss:// (got ${gatewayUrl.protocol}).`,
        });
        fatalErrors.push("agentDefaultsPayload.url must use ws:// or wss:// for openclaw_gateway");
      } else {
        normalized.url = gatewayUrl.toString();
        diagnostics.push({
          code: "openclaw_gateway_url_configured",
          level: "info",
          message: `Gateway endpoint set to ${gatewayUrl.toString()}`,
        });
      }
    } catch {
      diagnostics.push({
        code: "openclaw_gateway_url_invalid",
        level: "warn",
        message: `Invalid OpenClaw gateway URL: ${rawGatewayUrl}`,
      });
      fatalErrors.push("agentDefaultsPayload.url is not a valid URL");
    }
  }

  const headers = normalizeHeaderMap(defaults.headers) ?? {};
  const gatewayToken =
    headerMapGetIgnoreCase(headers, "x-openclaw-token") ??
    headerMapGetIgnoreCase(headers, "x-openclaw-auth") ??
    tokenFromAuthorizationHeader(headerMapGetIgnoreCase(headers, "authorization"));
  if (gatewayToken && !headerMapHasKeyIgnoreCase(headers, "x-openclaw-token")) {
    headers["x-openclaw-token"] = gatewayToken;
  }
  if (Object.keys(headers).length > 0) {
    normalized.headers = headers;
  }

  if (!gatewayToken) {
    diagnostics.push({
      code: "openclaw_gateway_auth_header_missing",
      level: "warn",
      message: "Gateway auth token is missing from agent defaults.",
      hint: "Set agentDefaultsPayload.headers.x-openclaw-token (or legacy x-openclaw-auth).",
    });
    fatalErrors.push("agentDefaultsPayload.headers.x-openclaw-token (or x-openclaw-auth) is required");
  } else if (gatewayToken.trim().length < 16) {
    diagnostics.push({
      code: "openclaw_gateway_auth_header_too_short",
      level: "warn",
      message: `Gateway auth token appears too short (${gatewayToken.trim().length} chars).`,
      hint: "Use the full gateway auth token from ~/.openclaw/openclaw.json (typically long random string).",
    });
    fatalErrors.push("agentDefaultsPayload.headers.x-openclaw-token is too short; expected a full gateway token");
  } else {
    diagnostics.push({
      code: "openclaw_gateway_auth_header_configured",
      level: "info",
      message: "Gateway auth token configured.",
    });
  }

  if (isPlainObject(defaults.payloadTemplate)) {
    normalized.payloadTemplate = defaults.payloadTemplate;
  }

  const parsedDisableDeviceAuth = parseBooleanLike(defaults.disableDeviceAuth);
  const disableDeviceAuth = parsedDisableDeviceAuth === true;
  if (parsedDisableDeviceAuth !== null) {
    normalized.disableDeviceAuth = parsedDisableDeviceAuth;
  }

  const configuredDevicePrivateKeyPem = nonEmptyTrimmedString(defaults.devicePrivateKeyPem);
  if (configuredDevicePrivateKeyPem) {
    normalized.devicePrivateKeyPem = configuredDevicePrivateKeyPem;
    diagnostics.push({
      code: "openclaw_gateway_device_key_configured",
      level: "info",
      message: "Gateway device key configured. Pairing approvals should persist for this agent.",
    });
  } else if (!disableDeviceAuth) {
    try {
      normalized.devicePrivateKeyPem = generateEd25519PrivateKeyPem();
      diagnostics.push({
        code: "openclaw_gateway_device_key_generated",
        level: "info",
        message:
          "Generated persistent gateway device key for this join. Pairing approvals should persist for this agent.",
      });
    } catch (err) {
      diagnostics.push({
        code: "openclaw_gateway_device_key_generate_failed",
        level: "warn",
        message: `Failed to generate gateway device key: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Set agentDefaultsPayload.devicePrivateKeyPem explicitly or set disableDeviceAuth=true.",
      });
      fatalErrors.push("Failed to generate gateway device key. Set devicePrivateKeyPem or disableDeviceAuth=true.");
    }
  }

  const waitTimeoutMs =
    typeof defaults.waitTimeoutMs === "number" && Number.isFinite(defaults.waitTimeoutMs)
      ? Math.floor(defaults.waitTimeoutMs)
      : typeof defaults.waitTimeoutMs === "string"
        ? Number.parseInt(defaults.waitTimeoutMs.trim(), 10)
        : NaN;
  if (Number.isFinite(waitTimeoutMs) && waitTimeoutMs > 0) {
    normalized.waitTimeoutMs = waitTimeoutMs;
  }

  const timeoutSec =
    typeof defaults.timeoutSec === "number" && Number.isFinite(defaults.timeoutSec)
      ? Math.floor(defaults.timeoutSec)
      : typeof defaults.timeoutSec === "string"
        ? Number.parseInt(defaults.timeoutSec.trim(), 10)
        : NaN;
  if (Number.isFinite(timeoutSec) && timeoutSec > 0) {
    normalized.timeoutSec = timeoutSec;
  }

  const sessionKeyStrategy = nonEmptyTrimmedString(defaults.sessionKeyStrategy);
  if (sessionKeyStrategy === "fixed" || sessionKeyStrategy === "issue" || sessionKeyStrategy === "run") {
    normalized.sessionKeyStrategy = sessionKeyStrategy;
  }

  const sessionKey = nonEmptyTrimmedString(defaults.sessionKey);
  if (sessionKey) {
    normalized.sessionKey = sessionKey;
  }

  const role = nonEmptyTrimmedString(defaults.role);
  if (role) {
    normalized.role = role;
  }

  if (Array.isArray(defaults.scopes)) {
    const scopes = defaults.scopes
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (scopes.length > 0) {
      normalized.scopes = scopes;
    }
  }

  const rawIronworksApiUrl = typeof defaults.ironworksApiUrl === "string" ? defaults.ironworksApiUrl.trim() : "";
  if (rawIronworksApiUrl) {
    try {
      const parsedIronworksApiUrl = new URL(rawIronworksApiUrl);
      if (parsedIronworksApiUrl.protocol !== "http:" && parsedIronworksApiUrl.protocol !== "https:") {
        diagnostics.push({
          code: "openclaw_gateway_ironworks_api_url_protocol",
          level: "warn",
          message: `ironworksApiUrl must use http:// or https:// (got ${parsedIronworksApiUrl.protocol}).`,
        });
      } else {
        normalized.ironworksApiUrl = parsedIronworksApiUrl.toString();
        diagnostics.push({
          code: "openclaw_gateway_ironworks_api_url_configured",
          level: "info",
          message: `ironworksApiUrl set to ${parsedIronworksApiUrl.toString()}`,
        });
      }
    } catch {
      diagnostics.push({
        code: "openclaw_gateway_ironworks_api_url_invalid",
        level: "warn",
        message: `Invalid ironworksApiUrl: ${rawIronworksApiUrl}`,
      });
    }
  }

  return { normalized, diagnostics, fatalErrors };
}

// ── Invite onboarding helpers ──

export function extractInviteMessage(invite: typeof invites.$inferSelect): string | null {
  const rawDefaults = invite.defaultsPayload;
  if (!rawDefaults || typeof rawDefaults !== "object" || Array.isArray(rawDefaults)) {
    return null;
  }
  const rawMessage = (rawDefaults as Record<string, unknown>).agentMessage;
  if (typeof rawMessage !== "string") {
    return null;
  }
  const trimmed = rawMessage.trim();
  return trimmed.length ? trimmed : null;
}

export function mergeInviteDefaults(
  defaultsPayload: Record<string, unknown> | null | undefined,
  agentMessage: string | null,
): Record<string, unknown> | null {
  const merged = defaultsPayload && typeof defaultsPayload === "object" ? { ...defaultsPayload } : {};
  if (agentMessage) {
    merged.agentMessage = agentMessage;
  }
  return Object.keys(merged).length ? merged : null;
}

export function inviteExpired(invite: typeof invites.$inferSelect) {
  return invite.expiresAt.getTime() <= Date.now();
}

export function grantsFromDefaults(
  defaultsPayload: Record<string, unknown> | null | undefined,
  key: "human" | "agent",
): Array<{
  permissionKey: (typeof PERMISSION_KEYS)[number];
  scope: Record<string, unknown> | null;
}> {
  if (!defaultsPayload || typeof defaultsPayload !== "object") return [];
  const scoped = defaultsPayload[key];
  if (!scoped || typeof scoped !== "object") return [];
  const grants = (scoped as Record<string, unknown>).grants;
  if (!Array.isArray(grants)) return [];
  const validPermissionKeys = new Set<string>(PERMISSION_KEYS);
  const result: Array<{
    permissionKey: (typeof PERMISSION_KEYS)[number];
    scope: Record<string, unknown> | null;
  }> = [];
  for (const item of grants) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.permissionKey !== "string") continue;
    if (!validPermissionKeys.has(record.permissionKey)) continue;
    result.push({
      permissionKey: record.permissionKey as (typeof PERMISSION_KEYS)[number],
      scope:
        record.scope && typeof record.scope === "object" && !Array.isArray(record.scope)
          ? (record.scope as Record<string, unknown>)
          : null,
    });
  }
  return result;
}

export function agentJoinGrantsFromDefaults(defaultsPayload: Record<string, unknown> | null | undefined): Array<{
  permissionKey: (typeof PERMISSION_KEYS)[number];
  scope: Record<string, unknown> | null;
}> {
  const grants = grantsFromDefaults(defaultsPayload, "agent");
  if (grants.some((grant) => grant.permissionKey === "tasks:assign")) {
    return grants;
  }
  return [
    ...grants,
    {
      permissionKey: "tasks:assign",
      scope: null,
    },
  ];
}

type JoinRequestManagerCandidate = {
  id: string;
  role: string;
  reportsTo: string | null;
};

export function resolveJoinRequestAgentManagerId(candidates: JoinRequestManagerCandidate[]): string | null {
  const ceoCandidates = candidates.filter((candidate) => candidate.role === "ceo");
  if (ceoCandidates.length === 0) return null;
  const rootCeo = ceoCandidates.find((candidate) => candidate.reportsTo === null);
  return (rootCeo ?? ceoCandidates[0] ?? null)?.id ?? null;
}

export type InviteResolutionProbe = {
  status: "reachable" | "timeout" | "unreachable";
  method: "HEAD";
  durationMs: number;
  httpStatus: number | null;
  message: string;
};

export async function probeInviteResolutionTarget(url: URL, timeoutMs: number): Promise<InviteResolutionProbe> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal,
    });
    const durationMs = Date.now() - startedAt;
    if (
      response.ok ||
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404 ||
      response.status === 405 ||
      response.status === 422 ||
      response.status === 500 ||
      response.status === 501
    ) {
      return {
        status: "reachable",
        method: "HEAD",
        durationMs,
        httpStatus: response.status,
        message: `Webhook endpoint responded to HEAD with HTTP ${response.status}.`,
      };
    }
    return {
      status: "unreachable",
      method: "HEAD",
      durationMs,
      httpStatus: response.status,
      message: `Webhook endpoint probe returned HTTP ${response.status}.`,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (isAbortError(error)) {
      return {
        status: "timeout",
        method: "HEAD",
        durationMs,
        httpStatus: null,
        message: `Webhook endpoint probe timed out after ${timeoutMs}ms.`,
      };
    }
    return {
      status: "unreachable",
      method: "HEAD",
      durationMs,
      httpStatus: null,
      message: error instanceof Error ? error.message : "Webhook endpoint probe failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function toInviteSummaryResponse(req: Request, token: string, invite: typeof invites.$inferSelect) {
  const baseUrl = requestBaseUrl(req);
  const onboardingPath = `/api/invites/${token}/onboarding`;
  const onboardingTextPath = `/api/invites/${token}/onboarding.txt`;
  const inviteMessage = extractInviteMessage(invite);
  return {
    id: invite.id,
    companyId: invite.companyId,
    inviteType: invite.inviteType,
    allowedJoinTypes: invite.allowedJoinTypes,
    expiresAt: invite.expiresAt,
    onboardingPath,
    onboardingUrl: baseUrl ? `${baseUrl}${onboardingPath}` : onboardingPath,
    onboardingTextPath,
    onboardingTextUrl: baseUrl ? `${baseUrl}${onboardingTextPath}` : onboardingTextPath,
    skillIndexPath: "/api/skills/index",
    skillIndexUrl: baseUrl ? `${baseUrl}/api/skills/index` : "/api/skills/index",
    inviteMessage,
  };
}

function buildOnboardingDiscoveryDiagnostics(input: {
  apiBaseUrl: string;
  deploymentMode: DeploymentMode;
  deploymentExposure: DeploymentExposure;
  bindHost: string;
  allowedHostnames: string[];
}): JoinDiagnostic[] {
  const diagnostics: JoinDiagnostic[] = [];
  let apiHost: string | null = null;
  if (input.apiBaseUrl) {
    try {
      apiHost = normalizeHostname(new URL(input.apiBaseUrl).hostname);
    } catch {
      apiHost = null;
    }
  }

  const bindHost = normalizeHostname(input.bindHost);
  const allowSet = new Set(
    input.allowedHostnames.map((entry) => normalizeHostname(entry)).filter((entry): entry is string => Boolean(entry)),
  );

  if (apiHost && isLoopbackHost(apiHost)) {
    diagnostics.push({
      code: "openclaw_onboarding_api_loopback",
      level: "warn",
      message:
        "Onboarding URL resolves to loopback hostname. Remote OpenClaw agents cannot reach localhost on your Ironworks host.",
      hint: "Use a reachable hostname/IP (for example Tailscale hostname, Docker host alias, or public domain).",
    });
  }

  if (
    input.deploymentMode === "authenticated" &&
    input.deploymentExposure === "private" &&
    (!bindHost || isLoopbackHost(bindHost))
  ) {
    diagnostics.push({
      code: "openclaw_onboarding_private_loopback_bind",
      level: "warn",
      message: "Ironworks is bound to loopback in authenticated/private mode.",
      hint: "Run with a reachable bind host or use pnpm dev --tailscale-auth for private-network onboarding.",
    });
  }

  if (
    input.deploymentMode === "authenticated" &&
    input.deploymentExposure === "private" &&
    apiHost &&
    !isLoopbackHost(apiHost) &&
    allowSet.size > 0 &&
    !allowSet.has(apiHost)
  ) {
    diagnostics.push({
      code: "openclaw_onboarding_private_host_not_allowed",
      level: "warn",
      message: `Onboarding host "${apiHost}" is not in allowed hostnames for authenticated/private mode.`,
      hint: `Run pnpm ironworksai allowed-hostname ${apiHost}`,
    });
  }

  return diagnostics;
}

function buildOnboardingConnectionCandidates(input: {
  apiBaseUrl: string;
  bindHost: string;
  allowedHostnames: string[];
}): string[] {
  let base: URL | null = null;
  try {
    if (input.apiBaseUrl) {
      base = new URL(input.apiBaseUrl);
    }
  } catch {
    base = null;
  }

  const protocol = base?.protocol ?? "http:";
  const port = base?.port ? `:${base.port}` : "";
  const candidates = new Set<string>();

  if (base) {
    candidates.add(base.origin);
  }

  const bindHost = normalizeHostname(input.bindHost);
  if (bindHost && !isLoopbackHost(bindHost)) {
    candidates.add(`${protocol}//${bindHost}${port}`);
  }

  for (const rawHost of input.allowedHostnames) {
    const host = normalizeHostname(rawHost);
    if (!host) continue;
    candidates.add(`${protocol}//${host}${port}`);
  }

  if (base && isLoopbackHost(base.hostname)) {
    candidates.add(`${protocol}//host.docker.internal${port}`);
  }

  return Array.from(candidates);
}

export function buildInviteOnboardingManifest(
  req: Request,
  token: string,
  invite: typeof invites.$inferSelect,
  opts: {
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    bindHost: string;
    allowedHostnames: string[];
  },
) {
  const baseUrl = requestBaseUrl(req);
  const skillPath = "/api/skills/ironworks";
  const skillUrl = baseUrl ? `${baseUrl}${skillPath}` : skillPath;
  const registrationEndpointPath = `/api/invites/${token}/accept`;
  const registrationEndpointUrl = baseUrl ? `${baseUrl}${registrationEndpointPath}` : registrationEndpointPath;
  const onboardingTextPath = `/api/invites/${token}/onboarding.txt`;
  const onboardingTextUrl = baseUrl ? `${baseUrl}${onboardingTextPath}` : onboardingTextPath;
  const discoveryDiagnostics = buildOnboardingDiscoveryDiagnostics({
    apiBaseUrl: baseUrl,
    deploymentMode: opts.deploymentMode,
    deploymentExposure: opts.deploymentExposure,
    bindHost: opts.bindHost,
    allowedHostnames: opts.allowedHostnames,
  });
  const connectionCandidates = buildOnboardingConnectionCandidates({
    apiBaseUrl: baseUrl,
    bindHost: opts.bindHost,
    allowedHostnames: opts.allowedHostnames,
  });

  return {
    invite: toInviteSummaryResponse(req, token, invite),
    onboarding: {
      instructions:
        "Join as an OpenClaw Gateway agent, save your one-time claim secret, wait for board approval, then claim your API key. Save the claim response token to ~/.openclaw/workspace/ironworks-claimed-api-key.json and load IRONWORKS_API_KEY from that file before starting heartbeat loops. You MUST submit adapterType='openclaw_gateway', set agentDefaultsPayload.url to your ws:// or wss:// OpenClaw gateway endpoint, and include agentDefaultsPayload.headers.x-openclaw-token (or legacy x-openclaw-auth).",
      inviteMessage: extractInviteMessage(invite),
      recommendedAdapterType: "openclaw_gateway",
      requiredFields: {
        requestType: "agent",
        agentName: "Display name for this agent",
        adapterType: "Use 'openclaw_gateway' for OpenClaw Gateway agents",
        capabilities: "Optional capability summary",
        agentDefaultsPayload:
          "Adapter config for OpenClaw gateway. MUST include url (ws:// or wss://) and headers.x-openclaw-token (or legacy x-openclaw-auth). Optional fields: ironworksApiUrl, waitTimeoutMs, sessionKeyStrategy, sessionKey, role, scopes, disableDeviceAuth, devicePrivateKeyPem.",
      },
      registrationEndpoint: {
        method: "POST",
        path: registrationEndpointPath,
        url: registrationEndpointUrl,
      },
      claimEndpointTemplate: {
        method: "POST",
        path: "/api/join-requests/{requestId}/claim-api-key",
        body: {
          claimSecret: "one-time claim secret returned when the join request is created",
        },
      },
      connectivity: {
        deploymentMode: opts.deploymentMode,
        deploymentExposure: opts.deploymentExposure,
        bindHost: opts.bindHost,
        allowedHostnames: opts.allowedHostnames,
        connectionCandidates,
        diagnostics: discoveryDiagnostics,
        guidance:
          opts.deploymentMode === "authenticated" && opts.deploymentExposure === "private"
            ? "If OpenClaw runs on another machine, ensure the Ironworks hostname is reachable and allowed via `pnpm ironworksai allowed-hostname <host>`."
            : "Ensure OpenClaw can reach this Ironworks API base URL for invite, claim, and skill bootstrap calls.",
      },
      textInstructions: {
        path: onboardingTextPath,
        url: onboardingTextUrl,
        contentType: "text/plain",
      },
      skill: {
        name: "ironworks",
        path: skillPath,
        url: skillUrl,
        installPath: "~/.openclaw/skills/ironworks/SKILL.md",
      },
    },
  };
}

export function buildInviteOnboardingTextDocument(
  req: Request,
  token: string,
  invite: typeof invites.$inferSelect,
  opts: {
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    bindHost: string;
    allowedHostnames: string[];
  },
) {
  const manifest = buildInviteOnboardingManifest(req, token, invite, opts);
  const onboarding = manifest.onboarding as {
    inviteMessage?: string | null;
    registrationEndpoint: { method: string; path: string; url: string };
    claimEndpointTemplate: { method: string; path: string };
    textInstructions: { path: string; url: string };
    skill: { path: string; url: string; installPath: string };
    connectivity: {
      diagnostics?: JoinDiagnostic[];
      guidance?: string;
      connectionCandidates?: string[];
      testResolutionEndpoint?: { method?: string; path?: string; url?: string };
    };
  };
  const diagnostics = Array.isArray(onboarding.connectivity?.diagnostics) ? onboarding.connectivity.diagnostics : [];

  const lines: string[] = [];
  const appendBlock = (block: string) => {
    const trimmed = block.replace(/^\n/, "").replace(/\n\s*$/, "");
    const lineIndentation = trimmed
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => line.match(/^(\s*)/)?.[0].length ?? 0);
    const minIndent = lineIndentation.length > 0 ? Math.min(...lineIndentation) : 0;
    for (const line of trimmed.split("\n")) {
      lines.push(line.slice(minIndent));
    }
  };

  appendBlock(`
    # Ironworks OpenClaw Gateway Onboarding

    This document is meant to be readable by both humans and agents.

    ## Invite
    - inviteType: ${invite.inviteType}
    - allowedJoinTypes: ${invite.allowedJoinTypes}
    - expiresAt: ${invite.expiresAt.toISOString()}
  `);

  if (onboarding.inviteMessage) {
    appendBlock(`
      ## Message from inviter
      ${onboarding.inviteMessage}
    `);
  }

  appendBlock(`
    ## Step 0

    Get the OpenClaw gateway auth token (THIS MUST BE SENT)
    Token lives in:

    ~/.openclaw/openclaw.json -> gateway.auth.token
    Extract:

    TOKEN="$(node -p 'require(process.env.HOME+"/.openclaw/openclaw.json").gateway.auth.token')"
    test -n "$TOKEN" || (echo "Missing TOKEN" && exit 1)
    test "\${#TOKEN}" -ge 16 || (echo "Gateway token unexpectedly short (\${#TOKEN})" && exit 1)

    3) IMPORTANT: Don't accidentally drop the token when generating JSON
    If you build JSON with Node, pass the token explicitly (argv), don't rely on an un-exported env var.

    Safe payload build looks sort of like this (substitute where necessary):

    BODY="$(node -e '
      const token = process.argv[1];
      if (!token) process.exit(2);
      const body = {
        requestType: "agent",
        agentName: "OpenClaw",
        adapterType: "openclaw_gateway",
        capabilities: "OpenClaw agent adapter",
        agentDefaultsPayload: {
          url: "ws://127.0.0.1:18789",
          ironworksApiUrl: "http://host.docker.internal:3100",
          headers: { "x-openclaw-token": token },
          waitTimeoutMs: 120000,
          sessionKeyStrategy: "issue",
          role: "operator",
          scopes: ["operator.admin"]
        }
      };
      process.stdout.write(JSON.stringify(body));
    ' "$TOKEN")"

    ## Step 1: Submit agent join request
    ${onboarding.registrationEndpoint.method} ${onboarding.registrationEndpoint.url}

    IMPORTANT: You MUST include agentDefaultsPayload.headers.x-openclaw-token with your gateway token.
    Legacy x-openclaw-auth is also accepted, but x-openclaw-token is preferred.
    Use adapterType "openclaw_gateway" and a ws:// or wss:// gateway URL.
    Pairing mode requirement:
    - Keep device auth enabled (recommended). If devicePrivateKeyPem is omitted, Ironworks generates and persists one during join so pairing approvals are stable.
    - You may set disableDeviceAuth=true only for special environments that cannot support pairing.
    - First run may return "pairing required" once; approve the pending pairing request in OpenClaw, then retry.
    Do NOT use /v1/responses or /hooks/* in this gateway join flow.

    Body (JSON):
    {
      "requestType": "agent",
      "agentName": "My OpenClaw Agent",
      "adapterType": "openclaw_gateway",
      "capabilities": "Optional summary",
      "agentDefaultsPayload": {
        "url": "wss://your-openclaw-gateway.example",
        "ironworksApiUrl": "https://ironworks-hostname-your-agent-can-reach:3100",
        "headers": { "x-openclaw-token": "replace-me" },
        "waitTimeoutMs": 120000,
        "sessionKeyStrategy": "issue",
        "role": "operator",
        "scopes": ["operator.admin"]
      }
    }

    Expected response includes:
    - request id
    - one-time claimSecret
    - claimApiKeyPath

    ## Step 2: Wait for board approval
    The board approves the join request in Ironworks before key claim is allowed.

    ## Step 3: Claim API key (one-time)
    ${onboarding.claimEndpointTemplate.method} /api/join-requests/{requestId}/claim-api-key

    Body (JSON):
    {
      "claimSecret": "<one-time-claim-secret>"
    }

    On successful claim, save the full JSON response to:

    - ~/.openclaw/workspace/ironworks-claimed-api-key.json
    chmod 600 ~/.openclaw/workspace/ironworks-claimed-api-key.json

    And set the IRONWORKS_API_KEY and IRONWORKS_API_URL in your environment variables as specified here:
    https://docs.openclaw.ai/help/environment

    e.g.

    {
      env: {
        IRONWORKS_API_KEY: "...",
        IRONWORKS_API_URL: "...",
      },
    }

    Then set IRONWORKS_API_KEY and IRONWORKS_API_URL from the saved token field for every heartbeat run.

    Important:
    - claim secrets expire
    - claim secrets are single-use
    - claim fails before board approval

    ## Step 4: Install Ironworks skill in OpenClaw
    GET ${onboarding.skill.url}
    Install path: ${onboarding.skill.installPath}

    Be sure to prepend your IRONWORKS_API_URL to the top of your skill and note the path to your IRONWORKS_API_URL

    ## Text onboarding URL
    ${onboarding.textInstructions.url}

    ## Connectivity guidance
    ${onboarding.connectivity?.guidance ?? "Ensure Ironworks is reachable from your OpenClaw runtime."}
  `);

  const connectionCandidates = Array.isArray(onboarding.connectivity?.connectionCandidates)
    ? onboarding.connectivity.connectionCandidates.filter((entry): entry is string => Boolean(entry))
    : [];

  if (connectionCandidates.length > 0) {
    lines.push("## Suggested Ironworks base URLs to try");
    for (const candidate of connectionCandidates) {
      lines.push(`- ${candidate}`);
    }
    appendBlock(`

      Test each candidate with:
      - GET <candidate>/api/health
      - set the first reachable candidate as agentDefaultsPayload.ironworksApiUrl when submitting your join request

      If none are reachable: ask your human operator for a reachable hostname/address and help them update network configuration.
      For authenticated/private mode, they may need:
      - pnpm ironworksai allowed-hostname <host>
      - then restart Ironworks and retry onboarding.
    `);
  }

  if (diagnostics.length > 0) {
    lines.push("## Connectivity diagnostics");
    for (const diag of diagnostics) {
      lines.push(`- [${diag.level}] ${diag.message}`);
      if (diag.hint) lines.push(`  hint: ${diag.hint}`);
    }
  }

  appendBlock(`

    ## Helpful endpoints
    ${onboarding.registrationEndpoint.path}
    ${onboarding.claimEndpointTemplate.path}
    ${onboarding.skill.path}
    ${manifest.invite.onboardingPath}
  `);

  return `${lines.join("\n")}\n`;
}

// ── Context ──

export type AccessService = ReturnType<typeof accessService>;
export type BoardAuthService = ReturnType<typeof boardAuthService>;
export type AgentService = ReturnType<typeof agentService>;
export type UserInviteService = ReturnType<typeof userInviteService>;
export type BudgetService = ReturnType<typeof budgetService>;

export interface AccessRouteContext {
  db: Db;
  opts: AccessRoutesOpts;
  access: AccessService;
  boardAuth: BoardAuthService;
  agents: AgentService;
  userInvites: UserInviteService;
  budgets: BudgetService;
  assertInstanceAdmin: (req: Request) => Promise<void>;
  assertCompanyPermission: (
    req: Request,
    companyId: string,
    permissionKey: (typeof PERMISSION_KEYS)[number],
  ) => Promise<void>;
}

export function buildAccessRouteContext(db: Db, opts: AccessRoutesOpts): AccessRouteContext {
  const access = accessService(db);
  const boardAuth = boardAuthService(db);
  const agents = agentService(db);
  const userInvites = userInviteService(db);
  const budgets = budgetService(db);

  async function assertInstanceAdmin(req: Request) {
    if (req.actor.type !== "board") throw unauthorized();
    if (isLocalImplicit(req)) return;
    const allowed = await access.isInstanceAdmin(req.actor.userId);
    if (!allowed) throw forbidden("Instance admin required");
  }

  async function assertCompanyPermission(
    req: Request,
    companyId: string,
    permissionKey: (typeof PERMISSION_KEYS)[number],
  ) {
    assertCompanyAccess(req, companyId);
    if (req.actor.type === "agent") {
      if (!req.actor.agentId) throw forbidden();
      const allowed = await access.hasPermission(companyId, "agent", req.actor.agentId, permissionKey);
      if (!allowed) throw forbidden("Permission denied");
      return;
    }
    if (req.actor.type !== "board") throw unauthorized();
    if (isLocalImplicit(req)) return;
    const allowed = await access.canUser(companyId, req.actor.userId, permissionKey);
    if (!allowed) throw forbidden("Permission denied");
  }

  return {
    db,
    opts,
    access,
    boardAuth,
    agents,
    userInvites,
    budgets,
    assertInstanceAdmin,
    assertCompanyPermission,
  };
}

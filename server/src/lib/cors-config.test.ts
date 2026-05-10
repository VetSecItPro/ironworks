import { describe, expect, it } from "vitest";
import { buildCorsOptions, parseAllowedOrigins } from "./cors-config.js";

describe("parseAllowedOrigins", () => {
  it("returns [] for undefined", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });

  it("returns [] for empty string", () => {
    expect(parseAllowedOrigins("")).toEqual([]);
  });

  it("returns [] for whitespace-only", () => {
    expect(parseAllowedOrigins("   ,  ,\t")).toEqual([]);
  });

  it("trims comma+space separated entries", () => {
    expect(parseAllowedOrigins("https://a.com, https://b.com ,  https://c.com")).toEqual([
      "https://a.com",
      "https://b.com",
      "https://c.com",
    ]);
  });

  it("deduplicates", () => {
    expect(parseAllowedOrigins("https://a.com,https://a.com,https://b.com")).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });
});

describe("buildCorsOptions", () => {
  it("dev + empty → allow-all (origin true), no warning", () => {
    const result = buildCorsOptions({ NODE_ENV: "development" });
    expect(result.warning).toBeNull();
    expect(result.options.origin).toBe(true);
    expect(result.options.credentials).toBe(true);
  });

  it("production + empty → fail-closed + warning (SEC-CORS-HIGH-004)", () => {
    // Previously: reflective allow-all. Now: refuses cross-origin requests
    // entirely when allowlist is empty in production. Same-origin / curl /
    // server-to-server (no Origin header) still allowed.
    const result = buildCorsOptions({ NODE_ENV: "production" });
    expect(result.warning).toContain("IRONWORKS_ALLOWED_ORIGINS");
    expect(typeof result.options.origin).toBe("function");
    const originFn = result.options.origin as (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean | string) => void,
    ) => void;
    originFn("https://anything.example", (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(false);
    });
    originFn(undefined, (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
    });
    expect(result.options.credentials).toBe(true);
  });

  it("non-empty allowlist → allowed origin echoed", () => {
    const result = buildCorsOptions({
      ALLOWED_ORIGINS: "https://app.ironworks.ai,https://staging.ironworks.ai",
      NODE_ENV: "production",
    });
    expect(result.warning).toBeNull();
    const originFn = result.options.origin as (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean | string) => void,
    ) => void;
    originFn("https://app.ironworks.ai", (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
    });
  });

  it("non-empty allowlist → non-listed origin rejected (allow=false)", () => {
    const result = buildCorsOptions({
      ALLOWED_ORIGINS: "https://app.ironworks.ai",
      NODE_ENV: "production",
    });
    const originFn = result.options.origin as (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean | string) => void,
    ) => void;
    originFn("https://evil.example", (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(false);
    });
  });

  it("non-empty allowlist → no-origin (curl/server) passes", () => {
    const result = buildCorsOptions({
      ALLOWED_ORIGINS: "https://app.ironworks.ai",
      NODE_ENV: "production",
    });
    const originFn = result.options.origin as (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean | string) => void,
    ) => void;
    originFn(undefined, (err, allow) => {
      expect(err).toBeNull();
      expect(allow).toBe(true);
    });
  });

  it("credentials always true", () => {
    expect(buildCorsOptions({ NODE_ENV: "development" }).options.credentials).toBe(true);
    expect(buildCorsOptions({ NODE_ENV: "production" }).options.credentials).toBe(true);
    expect(buildCorsOptions({ NODE_ENV: "production", ALLOWED_ORIGINS: "https://x.com" }).options.credentials).toBe(
      true,
    );
  });

  it("methods + headers configured", () => {
    const result = buildCorsOptions({ NODE_ENV: "development" });
    expect(result.options.methods).toEqual(
      expect.arrayContaining(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]),
    );
    expect(result.options.allowedHeaders).toEqual(
      expect.arrayContaining([
        "Content-Type",
        "Authorization",
        "X-Ironworks-Signature",
        "X-Mailgun-Signature-256",
        "X-Twilio-Email-Event-Webhook-Signature",
        "X-Twilio-Email-Event-Webhook-Timestamp",
        "X-Requested-With",
      ]),
    );
  });
});

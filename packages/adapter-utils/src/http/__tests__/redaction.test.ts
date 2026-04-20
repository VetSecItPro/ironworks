import { describe, expect, it } from "vitest";
import { KNOWN_SECRET_PATHS, KNOWN_SECRET_PATTERNS, redactHeaders, redactSecrets } from "../redaction.js";

describe("redactHeaders", () => {
  it("redacts Authorization header value", () => {
    const redacted = redactHeaders({ Authorization: "Bearer sk-ant-abc123def456" });
    expect(redacted.Authorization).toBe("[REDACTED]");
  });

  it("redacts Authorization with case-insensitive key match", () => {
    const redacted = redactHeaders({ authorization: "Bearer xyz" });
    expect(redacted.authorization).toBe("[REDACTED]");
  });

  it("redacts x-api-key header", () => {
    const redacted = redactHeaders({ "x-api-key": "sk-proj-secret" });
    expect(redacted["x-api-key"]).toBe("[REDACTED]");
  });

  it("redacts X-API-Key (any case)", () => {
    const redacted = redactHeaders({ "X-API-Key": "abc" });
    expect(redacted["X-API-Key"]).toBe("[REDACTED]");
  });

  it("redacts cookie header", () => {
    const redacted = redactHeaders({ Cookie: "session=secret123" });
    expect(redacted.Cookie).toBe("[REDACTED]");
  });

  it("redacts set-cookie header", () => {
    const redacted = redactHeaders({ "Set-Cookie": "session=secret123; Path=/" });
    expect(redacted["Set-Cookie"]).toBe("[REDACTED]");
  });

  it("preserves non-sensitive headers untouched", () => {
    const redacted = redactHeaders({
      "Content-Type": "application/json",
      "User-Agent": "ironworks/1.0",
      Accept: "text/event-stream",
    });
    expect(redacted["Content-Type"]).toBe("application/json");
    expect(redacted["User-Agent"]).toBe("ironworks/1.0");
    expect(redacted.Accept).toBe("text/event-stream");
  });

  it("does not mutate the input object", () => {
    const input = { Authorization: "Bearer secret" };
    const redacted = redactHeaders(input);
    expect(input.Authorization).toBe("Bearer secret");
    expect(redacted.Authorization).toBe("[REDACTED]");
  });

  it("handles empty header object", () => {
    expect(redactHeaders({})).toEqual({});
  });

  it("redactHeaders scans values for secret patterns even when key is not sensitive", () => {
    const redacted = redactHeaders({
      "X-Debug-Info": "Bearer sk-ant-abc1234567890",
      "User-Agent": "ironworks/1.0",
    });
    expect(redacted["X-Debug-Info"]).not.toContain("sk-ant-abc1234567890");
    expect(redacted["X-Debug-Info"]).toContain("Bearer [REDACTED]");
    expect(redacted["User-Agent"]).toBe("ironworks/1.0");
  });

  it("redactHeaders handles both key-match and value-scan", () => {
    const redacted = redactHeaders({
      Authorization: "Bearer sk-ant-foo", // key match → full redact
      "X-Request-Id": "req-abc-sk-poe-leakedhere", // no key match → pattern scan
    });
    expect(redacted.Authorization).toBe("[REDACTED]");
    expect(redacted["X-Request-Id"]).not.toContain("sk-poe-leakedhere");
  });
});

describe("redactSecrets (path-based)", () => {
  it("redacts `api_key` at any nesting depth", () => {
    const input = { outer: { inner: { api_key: "sk-ant-foo" } } };
    const redacted = redactSecrets(input);
    expect(redacted.outer.inner.api_key).toBe("[REDACTED]");
  });

  it("redacts `apiKey` camelCase", () => {
    const input = { config: { apiKey: "sk-ant-foo" } };
    const redacted = redactSecrets(input);
    expect(redacted.config.apiKey).toBe("[REDACTED]");
  });

  it("redacts `api-key` kebab-case (in string keys)", () => {
    const input = { config: { "api-key": "sk-ant-foo" } };
    const redacted = redactSecrets(input);
    expect(redacted.config["api-key"]).toBe("[REDACTED]");
  });

  it("redacts `token`, `access_token`, `refresh_token`", () => {
    const input = { token: "a", access_token: "b", refresh_token: "c" };
    const redacted = redactSecrets(input);
    expect(redacted.token).toBe("[REDACTED]");
    expect(redacted.access_token).toBe("[REDACTED]");
    expect(redacted.refresh_token).toBe("[REDACTED]");
  });

  it("redacts `password`, `secret`, `private_key`", () => {
    const input = { password: "a", secret: "b", private_key: "c" };
    const redacted = redactSecrets(input);
    expect(redacted.password).toBe("[REDACTED]");
    expect(redacted.secret).toBe("[REDACTED]");
    expect(redacted.private_key).toBe("[REDACTED]");
  });

  it("redacts `authorization` field when in body (not just header)", () => {
    const input = { authorization: "Bearer sk-ant-foo" };
    const redacted = redactSecrets(input);
    expect(redacted.authorization).toBe("[REDACTED]");
  });

  it("preserves non-sensitive fields", () => {
    const input = { model: "claude-sonnet-4.6", temperature: 0.7 };
    const redacted = redactSecrets(input);
    expect(redacted.model).toBe("claude-sonnet-4.6");
    expect(redacted.temperature).toBe(0.7);
  });
});

describe("redactSecrets (string-pattern scanning)", () => {
  it("redacts sk-ant-* inside any string leaf", () => {
    const input = { messages: [{ role: "user", content: "Paste: sk-ant-abc1234567890xyz" }] };
    const redacted = redactSecrets(input);
    expect(redacted.messages[0].content).not.toContain("sk-ant-abc1234567890xyz");
    expect(redacted.messages[0].content).toContain("[REDACTED]");
  });

  it("redacts Bearer tokens in string leaves", () => {
    const input = { log: "Requested with Bearer sk-or-v1-abc123456 response ok" };
    const redacted = redactSecrets(input);
    expect(redacted.log).toContain("Bearer [REDACTED]");
  });

  it("redacts multiple patterns in same string", () => {
    const input = { note: "keys: sk-ant-aaaaaaaaaa and sk-proj-bbbbbbbbbb" };
    const redacted = redactSecrets(input);
    expect(redacted.note).not.toContain("sk-ant-aaaaaaaaaa");
    expect(redacted.note).not.toContain("sk-proj-bbbbbbbbbb");
  });

  it("redacts sk-or-v1-* OpenRouter keys", () => {
    const input = { key: "sk-or-v1-abcdef1234567890" };
    const redacted = redactSecrets(input);
    expect(redacted.key).toBe("[REDACTED]");
  });

  it("redacts sk-poe-* Poe keys", () => {
    const input = { key: "sk-poe-abcdef1234567890" };
    const redacted = redactSecrets(input);
    expect(redacted.key).toBe("[REDACTED]");
  });

  it("redacts cfut_* Cloudflare tokens in strings", () => {
    const input = { note: "Leaked: cfut_1234567890abcdefghijklmnopqrstuvwxyzabcdefghij" };
    const redacted = redactSecrets(input);
    expect(redacted.note).not.toContain("cfut_1234567890abcdefghijklmnopqrstuvwxyzabcdefghij");
  });
});

describe("redactSecrets (edge cases)", () => {
  it("handles null and undefined gracefully", () => {
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets(undefined)).toBeUndefined();
  });

  it("handles primitives unchanged", () => {
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(true)).toBe(true);
    expect(redactSecrets("plain string")).toBe("plain string");
  });

  it("handles arrays", () => {
    const input = [{ api_key: "a" }, { api_key: "b" }];
    const redacted = redactSecrets(input);
    expect(redacted[0].api_key).toBe("[REDACTED]");
    expect(redacted[1].api_key).toBe("[REDACTED]");
  });

  it("handles circular references without crashing (fail-safe: over-redact)", () => {
    const input: Record<string, unknown> = { name: "outer" };
    input.self = input;
    // Should not infinite-loop. Either returns a sanitized version or [CIRCULAR] marker.
    const redacted = redactSecrets(input);
    expect(redacted).toBeDefined();
    expect(redacted.name).toBe("outer");
  });

  it("does not mutate the input object", () => {
    const input = { nested: { api_key: "original" } };
    const redacted = redactSecrets(input);
    expect(input.nested.api_key).toBe("original");
    expect(redacted.nested.api_key).toBe("[REDACTED]");
  });

  it("fail-safe: Error objects get their message redacted", () => {
    const err = new Error("Leaked: sk-ant-abcdefghij");
    const redacted = redactSecrets({ error: err });
    // Accept either full Error serialization or just message — both must be redacted
    expect(JSON.stringify(redacted)).not.toContain("sk-ant-abcdefghij");
  });

  it("fail-safe: unknown non-JSON-serializable value over-redacts rather than throw", () => {
    const weird = new Map([["api_key", "secret"]]);
    // Map isn't a plain object — redactor must not throw; at minimum, should return something safe
    expect(() => redactSecrets({ map: weird })).not.toThrow();
  });

  it("exported KNOWN_SECRET_PATHS matches spec (case-insensitive lookups include these)", () => {
    expect(KNOWN_SECRET_PATHS).toContain("api_key");
    expect(KNOWN_SECRET_PATHS).toContain("apiKey");
    expect(KNOWN_SECRET_PATHS).toContain("token");
    expect(KNOWN_SECRET_PATHS).toContain("password");
    expect(KNOWN_SECRET_PATHS).toContain("secret");
    expect(KNOWN_SECRET_PATHS).toContain("authorization");
  });

  it("exported KNOWN_SECRET_PATTERNS exposes regexes for external reuse", () => {
    expect(Array.isArray(KNOWN_SECRET_PATTERNS)).toBe(true);
    expect(KNOWN_SECRET_PATTERNS.length).toBeGreaterThanOrEqual(5);
    // Each should be a RegExp with /g flag (so multi-match works)
    for (const p of KNOWN_SECRET_PATTERNS) {
      expect(p).toBeInstanceOf(RegExp);
      expect(p.flags).toContain("g");
    }
  });

  it("pattern redaction is safe under concurrent calls (lastIndex is not shared)", async () => {
    const payload = "Bearer sk-ant-aaaaaaaaaa text Bearer sk-proj-bbbbbbbbbb";
    // Kick off many concurrent redactions — if lastIndex were shared, interleaved calls would
    // produce wrong output on some; all results must be identical
    const results = await Promise.all(
      Array.from({ length: 50 }, () => Promise.resolve(redactSecrets({ log: payload }))),
    );
    for (const r of results) {
      expect((r as { log: string }).log).not.toContain("sk-ant-aaaaaaaaaa");
      expect((r as { log: string }).log).not.toContain("sk-proj-bbbbbbbbbb");
      expect((r as { log: string }).log).toMatch(/Bearer \[REDACTED\]/);
    }
  });
});

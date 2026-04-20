import { describe, expect, it } from "vitest";
import {
  HttpAdapterAuthError,
  HttpAdapterCircuitOpenError,
  HttpAdapterClientError,
  HttpAdapterConfigError,
  HttpAdapterError,
  HttpAdapterNetworkError,
  HttpAdapterRateLimitError,
  HttpAdapterServerError,
  HttpAdapterStreamBreak,
  HttpAdapterTimeoutError,
  toAdapterExecutionResult,
} from "../errors.js";

describe("HttpAdapterError hierarchy", () => {
  it("base error has code + retryable + cause", () => {
    const err = new HttpAdapterError("test", { code: "config_error", retryable: false });
    expect(err.code).toBe("config_error");
    expect(err.retryable).toBe(false);
    expect(err.message).toBe("test");
    expect(err).toBeInstanceOf(Error);
  });

  it("auth error is non-retryable", () => {
    const err = new HttpAdapterAuthError("invalid key");
    expect(err.code).toBe("auth_failed");
    expect(err.retryable).toBe(false);
  });

  it("rate-limit error is retryable with retryAfterMs", () => {
    const err = new HttpAdapterRateLimitError("rate limited", { retryAfterMs: 5000 });
    expect(err.code).toBe("rate_limited");
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(5000);
  });

  it("server error (5xx) is retryable", () => {
    const err = new HttpAdapterServerError("upstream failed", { status: 503 });
    expect(err.code).toBe("server_error");
    expect(err.retryable).toBe(true);
    expect(err.status).toBe(503);
  });

  it("timeout error is retryable once (by convention)", () => {
    const err = new HttpAdapterTimeoutError("deadline exceeded");
    expect(err.code).toBe("timeout");
    expect(err.retryable).toBe(true);
  });

  it("stream break error — NEVER retryable (R16 mitigation)", () => {
    const err = new HttpAdapterStreamBreak("disconnect after tool_call", { toolCallEmitted: true });
    expect(err.code).toBe("stream_break");
    expect(err.retryable).toBe(false);
    expect(err.toolCallEmitted).toBe(true);
  });

  it("circuit open error is non-retryable", () => {
    const err = new HttpAdapterCircuitOpenError("circuit open", { reopenAtMs: Date.now() + 60000 });
    expect(err.code).toBe("circuit_open");
    expect(err.retryable).toBe(false);
    expect(err.reopenAtMs).toBeGreaterThan(Date.now());
  });

  it("config error is non-retryable", () => {
    const err = new HttpAdapterConfigError("missing api key");
    expect(err.code).toBe("config_error");
    expect(err.retryable).toBe(false);
  });

  it("network error (DNS, TLS) is non-retryable by default", () => {
    const err = new HttpAdapterNetworkError("ENOTFOUND", { cause: new Error("dns lookup failed") });
    expect(err.code).toBe("network_error");
    expect(err.retryable).toBe(false);
    expect(err.cause).toBeDefined();
  });

  // Finding 1: network error retryability override
  it("network error can be marked retryable for transient codes", () => {
    const err = new HttpAdapterNetworkError("ECONNRESET", { retryable: true });
    expect(err.retryable).toBe(true);
  });

  it("cause is preserved through the hierarchy", () => {
    const root = new Error("original");
    const wrapped = new HttpAdapterServerError("wrapped", { status: 500, cause: root });
    expect(wrapped.cause).toBe(root);
  });

  it("HttpAdapterClientError has code=client_error and retryable=false", () => {
    const err = new HttpAdapterClientError("bad request", { status: 400 });
    expect(err.code).toBe("client_error");
    expect(err.retryable).toBe(false);
    expect(err.status).toBe(400);
  });

  // Finding 2: native ES2022 Error.cause
  it("cause is exposed via the native Error.cause property", () => {
    const root = new Error("root cause");
    const err = new HttpAdapterServerError("wrap", { status: 500, cause: root });
    expect(err.cause).toBe(root);
    // Verify the cause message is accessible (native Error.cause chain for util.inspect / structured loggers)
    expect((err.cause as Error).message).toBe("root cause");
  });
});

describe("toAdapterExecutionResult", () => {
  it("converts HttpAdapterAuthError to an AdapterExecutionResult with errorCode", () => {
    const err = new HttpAdapterAuthError("bad key");
    const result = toAdapterExecutionResult(err);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("auth_failed");
    expect(result.errorMessage).toContain("bad key");
    expect(result.errorMeta?.retryable).toBe(false);
  });

  it("converts HttpAdapterRateLimitError preserving retryAfterMs in meta", () => {
    const err = new HttpAdapterRateLimitError("slow down", { retryAfterMs: 3000 });
    const result = toAdapterExecutionResult(err);
    expect(result.errorMeta?.retryAfterMs).toBe(3000);
  });

  it("wraps unknown errors as generic HttpAdapterError-like result", () => {
    const err = new Error("surprise");
    const result = toAdapterExecutionResult(err);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("unknown_error");
    expect(result.errorMessage).toContain("surprise");
  });

  it("redacts any bearer-token-shaped strings in error messages", () => {
    const err = new HttpAdapterAuthError("Invalid key: Bearer sk-ant-a1b2c3d4e5f6g7h8");
    const result = toAdapterExecutionResult(err);
    expect(result.errorMessage).not.toContain("sk-ant-a1b2c3d4e5f6g7h8");
    expect(result.errorMessage).toMatch(/Bearer\s+\[REDACTED\]/);
  });

  // Minor improvements: additional redaction coverage
  it("redacts multiple matches in the same message", () => {
    const err = new HttpAdapterAuthError("two keys: sk-ant-aaaaaaaaaa and sk-proj-bbbbbbbbbb");
    const result = toAdapterExecutionResult(err);
    expect(result.errorMessage).not.toContain("sk-ant-aaaaaaaaaa");
    expect(result.errorMessage).not.toContain("sk-proj-bbbbbbbbbb");
  });

  it("redacts generic sk-* tokens (OpenAI legacy)", () => {
    const err = new HttpAdapterAuthError("bad key: sk-1234567890abcdefghijklmn");
    const result = toAdapterExecutionResult(err);
    expect(result.errorMessage).not.toContain("sk-1234567890abcdefghijklmn");
  });

  it("redacts cfut_ Cloudflare tokens", () => {
    const err = new HttpAdapterAuthError("leaked: cfut_1234567890abcdefghijklmnopqrstuvwxyzabcdefghij");
    const result = toAdapterExecutionResult(err);
    expect(result.errorMessage).not.toContain("cfut_1234567890abcdefghijklmnopqrstuvwxyzabcdefghij");
  });

  it("redacts strings passed to unknown-error branch", () => {
    const result = toAdapterExecutionResult(new Error("leaked: sk-ant-zzzzzzzzzzzzzzzz"));
    expect(result.errorMessage).not.toContain("sk-ant-zzzzzzzzzzzzzzzz");
  });

  it("toAdapterExecutionResult handles HttpAdapterClientError", () => {
    const err = new HttpAdapterClientError("bad", { status: 400 });
    const r = toAdapterExecutionResult(err);
    expect(r.errorCode).toBe("client_error");
    expect(r.errorMeta?.retryable).toBe(false);
    expect(r.errorMeta?.status).toBe(400);
  });
});

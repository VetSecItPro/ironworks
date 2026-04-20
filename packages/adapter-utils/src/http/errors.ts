import type { AdapterExecutionResult } from "../types.js";

// ---------------------------------------------------------------------------
// Error code literal union (Finding 3)
// ---------------------------------------------------------------------------

export type HttpAdapterErrorCode =
  | "auth_failed"
  | "rate_limited"
  | "client_error"
  | "server_error"
  | "timeout"
  | "stream_break"
  | "circuit_open"
  | "config_error"
  | "network_error"
  | "unknown_error";

// ---------------------------------------------------------------------------
// Message redaction (tactical: error messages only)
// Full structured-JSON redaction lives in redaction.ts (Task B.3)
// ---------------------------------------------------------------------------

function redactErrorMessage(msg: string): string {
  return (
    msg
      // Bearer token pattern - apply first so the token inside is caught
      .replace(/Bearer\s+[A-Za-z0-9\-_.]+/g, "Bearer [REDACTED]")
      // Provider-specific key prefixes (more specific before generic)
      .replace(/sk-ant-[A-Za-z0-9\-_.]{10,}/g, "[REDACTED]")
      .replace(/sk-proj-[A-Za-z0-9\-_.]{10,}/g, "[REDACTED]")
      .replace(/sk-or-v1-[A-Za-z0-9\-_.]{10,}/g, "[REDACTED]")
      .replace(/sk-poe-[A-Za-z0-9\-_.]{10,}/g, "[REDACTED]")
      // Generic OpenAI-style sk-* (apply AFTER more specific patterns)
      .replace(/sk-[A-Za-z0-9\-_.]{20,}/g, "[REDACTED]")
      // Cloudflare tokens
      .replace(/cfut_[A-Za-z0-9]{40,}/g, "[REDACTED]")
  );
}

// ---------------------------------------------------------------------------
// Base error class
// ---------------------------------------------------------------------------

export class HttpAdapterError extends Error {
  readonly code: HttpAdapterErrorCode;
  readonly retryable: boolean;

  constructor(message: string, options: { code: HttpAdapterErrorCode; retryable: boolean; cause?: unknown }) {
    super(message, { cause: options.cause }); // native ES2022 path (Finding 2)
    this.name = "HttpAdapterError";
    this.code = options.code;
    this.retryable = options.retryable;
    // Restore prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Subclasses
// ---------------------------------------------------------------------------

export class HttpAdapterAuthError extends HttpAdapterError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { code: "auth_failed", retryable: false, cause: options?.cause });
    this.name = "HttpAdapterAuthError";
  }
}

export class HttpAdapterRateLimitError extends HttpAdapterError {
  readonly retryAfterMs?: number;

  constructor(message: string, options?: { retryAfterMs?: number; cause?: unknown }) {
    super(message, { code: "rate_limited", retryable: true, cause: options?.cause });
    this.name = "HttpAdapterRateLimitError";
    this.retryAfterMs = options?.retryAfterMs;
  }
}

export class HttpAdapterServerError extends HttpAdapterError {
  readonly status?: number;

  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, { code: "server_error", retryable: true, cause: options?.cause });
    this.name = "HttpAdapterServerError";
    this.status = options?.status;
  }
}

export class HttpAdapterTimeoutError extends HttpAdapterError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { code: "timeout", retryable: true, cause: options?.cause });
    this.name = "HttpAdapterTimeoutError";
  }
}

/** R16 mitigation marker - stream disconnected after a tool_call was emitted. NEVER retryable. */
export class HttpAdapterStreamBreak extends HttpAdapterError {
  readonly toolCallEmitted: boolean;

  constructor(message: string, options?: { toolCallEmitted?: boolean; cause?: unknown }) {
    super(message, { code: "stream_break", retryable: false, cause: options?.cause });
    this.name = "HttpAdapterStreamBreak";
    this.toolCallEmitted = options?.toolCallEmitted ?? false;
  }
}

export class HttpAdapterCircuitOpenError extends HttpAdapterError {
  readonly reopenAtMs?: number;

  constructor(message: string, options?: { reopenAtMs?: number; cause?: unknown }) {
    super(message, { code: "circuit_open", retryable: false, cause: options?.cause });
    this.name = "HttpAdapterCircuitOpenError";
    this.reopenAtMs = options?.reopenAtMs;
  }
}

export class HttpAdapterConfigError extends HttpAdapterError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { code: "config_error", retryable: false, cause: options?.cause });
    this.name = "HttpAdapterConfigError";
  }
}

/**
 * Upstream returned a 4xx error that is NOT an auth or rate-limit problem
 * (e.g., 400 Bad Request, 404 Not Found, 422 Unprocessable Entity). These are
 * permanently unrecoverable for the current request — retrying will just waste
 * quota. Callers that need the status code can read err.status.
 */
export class HttpAdapterClientError extends HttpAdapterError {
  readonly status?: number;
  constructor(message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message, { code: "client_error", retryable: false, cause: options.cause });
    this.name = "HttpAdapterClientError";
    this.status = options.status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Generic network error (DNS failure, TLS handshake, socket-level). Default
 * non-retryable because persistent DNS/TLS issues signal a real config problem,
 * but callers MAY override for known-transient cases (ECONNRESET, ETIMEDOUT
 * mid-connect) where a retry is warranted.
 */
export class HttpAdapterNetworkError extends HttpAdapterError {
  constructor(message: string, options: { cause?: unknown; retryable?: boolean } = {}) {
    super(message, {
      code: "network_error",
      retryable: options.retryable ?? false,
      cause: options.cause,
    });
    this.name = "HttpAdapterNetworkError";
  }
}

// ---------------------------------------------------------------------------
// Namespace re-export (for barrel compatibility: index.ts does `export { errors }`)
// ---------------------------------------------------------------------------

export const errors = {
  HttpAdapterError,
  HttpAdapterAuthError,
  HttpAdapterRateLimitError,
  HttpAdapterClientError,
  HttpAdapterServerError,
  HttpAdapterTimeoutError,
  HttpAdapterStreamBreak,
  HttpAdapterCircuitOpenError,
  HttpAdapterConfigError,
  HttpAdapterNetworkError,
  toAdapterExecutionResult,
} as const;

// ---------------------------------------------------------------------------
// Serialization helper
// ---------------------------------------------------------------------------

export function toAdapterExecutionResult(err: unknown): AdapterExecutionResult {
  if (err instanceof HttpAdapterError) {
    const timedOut = err instanceof HttpAdapterTimeoutError;

    // Build subclass-specific meta fields
    const extraMeta: Record<string, unknown> = {};
    if (err instanceof HttpAdapterRateLimitError && err.retryAfterMs !== undefined) {
      extraMeta.retryAfterMs = err.retryAfterMs;
    }
    if (err instanceof HttpAdapterClientError && err.status !== undefined) {
      extraMeta.status = err.status;
    }
    if (err instanceof HttpAdapterServerError && err.status !== undefined) {
      extraMeta.status = err.status;
    }
    if (err instanceof HttpAdapterStreamBreak) {
      extraMeta.toolCallEmitted = err.toolCallEmitted;
    }
    if (err instanceof HttpAdapterCircuitOpenError && err.reopenAtMs !== undefined) {
      extraMeta.reopenAtMs = err.reopenAtMs;
    }

    return {
      exitCode: 1,
      signal: null,
      timedOut,
      errorCode: err.code,
      errorMessage: redactErrorMessage(err.message),
      errorMeta: { retryable: err.retryable, ...extraMeta },
    };
  }

  // Unknown error
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : String(err);

  return {
    exitCode: 1,
    signal: null,
    timedOut: false,
    errorCode: "unknown_error" as HttpAdapterErrorCode,
    errorMessage: redactErrorMessage(message),
  };
}

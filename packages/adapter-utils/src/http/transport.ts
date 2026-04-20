/**
 * Hardened HTTP client for all provider adapters (poe, anthropic, openai, openrouter).
 *
 * Responsibilities: single-shot POST JSON, streaming POST, bearer-token auth,
 * timeout, response size cap, content-type enforcement, secret redaction in errors,
 * and mapping network/HTTP errors to typed error classes.
 *
 * Does NOT: retry, parse SSE, normalize tool calls, circuit-break, or rate-limit.
 * Those concerns compose on top at the adapter layer.
 */

import { Readable } from "node:stream";
import { request } from "undici";
import {
  HttpAdapterAuthError,
  HttpAdapterClientError,
  HttpAdapterConfigError,
  HttpAdapterNetworkError,
  HttpAdapterRateLimitError,
  HttpAdapterServerError,
  HttpAdapterTimeoutError,
} from "./errors.js";
import { redactSecrets } from "./redaction.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RESPONSE_BYTES = 10_000_000; // 10 MB — guard against OOM on malformed responses

// Hoisted to module scope so string-to-bytes encoding doesn't re-allocate on every SSE chunk.
const TEXT_ENCODER = new TextEncoder();

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SendJsonOptions {
  url: string;
  apiKey: string;
  body: unknown;
  extraHeaders?: Record<string, string>;
  /** Milliseconds before the request is aborted. Default: 120 000 ms. */
  timeoutMs?: number;
  /** Max bytes to read from the response body. Default: 10 000 000 bytes. */
  maxResponseBytes?: number;
  /** Caller-supplied abort signal, composed with internal timeout signal. */
  abortSignal?: AbortSignal;
}

export interface SendJsonResult {
  body: unknown;
  status: number;
  headers: Record<string, string>;
}

export interface SendJsonStreamResult {
  body: ReadableStream<Uint8Array>;
  status: number;
  headers: Record<string, string>;
}

export interface Transport {
  sendJson(opts: SendJsonOptions): Promise<SendJsonResult>;
  sendJsonStream(opts: SendJsonOptions): Promise<SendJsonStreamResult>;
}

/** Internal options accepted by createTransport — reserved for future pool tuning. */
export type TransportOptions = {};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse a Retry-After header value into milliseconds from now.
 * Accepts both the numeric-seconds form and the HTTP-date form.
 */
function parseRetryAfter(header: string | undefined, now: number): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs) && secs >= 0) return Math.ceil(secs * 1_000);
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - now);
  return undefined;
}

/**
 * Compose caller's optional AbortSignal with an internal timeout signal so
 * either can cancel the request independently.
 */
function composeSignal(timeoutMs: number, userSignal: AbortSignal | undefined): AbortSignal {
  // AbortSignal.timeout is available in Node 17+; always create it so the request
  // has a hard deadline even when the caller supplies no signal.
  const timeoutSignal = AbortSignal.timeout(timeoutMs);

  if (!userSignal) {
    return timeoutSignal;
  }

  // AbortSignal.any is available in Node 20+ — combine both abort sources.
  return AbortSignal.any([userSignal, timeoutSignal]);
}

/**
 * Collect a Node.js Readable into a string while enforcing a byte cap.
 * Rejects early with a descriptive error if the cap is exceeded — prevents
 * holding the entire body in memory for oversized/malicious responses.
 */
async function drainReadable(readable: Readable, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const rawChunk of readable) {
    const chunk = rawChunk as Buffer | Uint8Array | string;
    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : typeof chunk === "string"
        ? Buffer.from(chunk, "utf-8")
        : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > maxBytes) {
      // Destroy the stream to release the socket back to the pool quickly.
      readable.destroy();
      throw new HttpAdapterServerError(`Response too large: exceeded ${maxBytes} byte limit`, { status: 0 });
    }
    chunks.push(buf);
  }

  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Drain up to limit bytes from a Readable for use in error messages.
 */
async function drainForError(readable: Readable, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const rawChunk of readable) {
    const chunk = rawChunk as Buffer | Uint8Array | string;
    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : typeof chunk === "string"
        ? Buffer.from(chunk, "utf-8")
        : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > limit) {
      readable.destroy();
      break;
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Flatten undici's IncomingHttpHeaders (may contain string | string[] values)
 * into a plain Record<string, string> for consistent downstream usage.
 */
function flattenHeaders(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (val === undefined) continue;
    out[key] = Array.isArray(val) ? val.join(", ") : val;
  }
  return out;
}

/**
 * Build the request headers, injecting Authorization and Content-Type.
 * Never mutates the caller's extraHeaders object.
 */
function buildHeaders(
  apiKey: string,
  accept: string,
  extraHeaders: Record<string, string> | undefined,
): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    accept,
    ...extraHeaders,
  };
}

/**
 * Redact secrets from an arbitrary string before embedding it in an error message.
 * Handles the case where the body text may contain the raw API key or bearer token.
 */
function safeRedact(value: string): string {
  return redactSecrets(value) as string;
}

/**
 * Map an HTTP error status (non-2xx) to the appropriate typed error.
 * Consumes and redacts the response body for the error message.
 */
async function mapHttpError(
  status: number,
  rawHeaders: Record<string, string | string[] | undefined>,
  body: Readable,
): Promise<never> {
  // Drain body for the error message — capped at 4 KB so malformed error
  // pages don't grow unboundedly in memory.
  const rawBody = await drainForError(body, 4_096);
  const safeBody = safeRedact(rawBody);
  const headers = flattenHeaders(rawHeaders);

  if (status === 401 || status === 403) {
    throw new HttpAdapterAuthError(`HTTP ${status}: ${safeBody}`);
  }

  if (status === 429) {
    const retryAfterMs = parseRetryAfter(headers["retry-after"], Date.now());
    throw new HttpAdapterRateLimitError(`HTTP 429: ${safeBody}`, { retryAfterMs });
  }

  // 4xx-other (400, 404, 422, etc.) are permanently unrecoverable — retrying
  // the same request against the same endpoint will always fail identically.
  if (status >= 400 && status < 500) {
    throw new HttpAdapterClientError(`HTTP ${status}: ${safeBody}`, { status });
  }

  if (status >= 500) {
    throw new HttpAdapterServerError(`HTTP ${status}: ${safeBody}`, { status });
  }

  // Unexpected status outside 4xx/5xx — treat as non-retryable to avoid
  // burning quota on unknown protocol-level anomalies.
  throw new HttpAdapterClientError(`HTTP ${status}: ${safeBody}`, { status });
}

// Internal representation of a raw undici response.
interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Readable;
}

/**
 * Execute a POST request via undici, returning the raw response data.
 * Shared by both sendJson and sendJsonStream.
 */
async function executeRequest(opts: SendJsonOptions, accept: string): Promise<RawResponse> {
  const { url, apiKey, body, extraHeaders, abortSignal } = opts;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Validate config before touching the network — fail fast on clearly wrong input.
  if (!apiKey) {
    throw new HttpAdapterConfigError("apiKey must not be empty");
  }
  try {
    new URL(url);
  } catch {
    throw new HttpAdapterConfigError(`Invalid URL: ${url}`);
  }
  if (timeoutMs <= 0) {
    throw new HttpAdapterConfigError("timeoutMs must be > 0");
  }

  const signal = composeSignal(timeoutMs, abortSignal);
  const headers = buildHeaders(apiKey, accept, extraHeaders);
  const serialisedBody = JSON.stringify(body);

  try {
    // No explicit dispatcher — uses the global undici Agent (keepalive by default).
    // Tests replace the global dispatcher with MockAgent via setGlobalDispatcher.
    const resp = await request(url, {
      method: "POST",
      headers,
      body: serialisedBody,
      signal,
    });
    return {
      status: resp.statusCode,
      headers: resp.headers as Record<string, string | string[] | undefined>,
      // undici's BodyReadable extends Readable; widen to Readable for our API surface.
      body: resp.body as unknown as Readable,
    };
  } catch (err: unknown) {
    // Distinguish timeout-flavoured aborts from generic network errors.
    if (err instanceof Error) {
      const { name, message: msg } = err;

      // AbortSignal.timeout() fires a DOMException with name === 'TimeoutError'.
      // undici may also surface its own timeout errors.
      if (
        name === "TimeoutError" ||
        msg.includes("Connect Timeout") ||
        msg.includes("Body Timeout") ||
        msg.includes("Headers Timeout")
      ) {
        throw new HttpAdapterTimeoutError(`Request timed out after ${timeoutMs}ms`, { cause: err });
      }

      // User-supplied signal fired (name === 'AbortError') — re-throw as-is so
      // callers can detect a deliberate cancellation vs. a timeout.
      if (name === "AbortError") {
        throw err;
      }

      throw new HttpAdapterNetworkError(`Network error: ${safeRedact(msg)}`, { cause: err, retryable: true });
    }
    throw new HttpAdapterNetworkError("Network error: unknown", { cause: err });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a single-shot POST with a JSON body and parse the JSON response.
 *
 * Enforces:
 * - Non-empty apiKey
 * - application/json response content-type
 * - Response size cap (default 10 MB)
 * - Timeout (default 120 s)
 * - Secret redaction in thrown error messages
 */
export async function sendJson(opts: SendJsonOptions): Promise<SendJsonResult> {
  const maxBytes = opts.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const { status, headers: rawHeaders, body } = await executeRequest(opts, "application/json");

  const flatHeaders = flattenHeaders(rawHeaders);
  const contentType = flatHeaders["content-type"] ?? "";

  // Non-2xx: map to typed errors before checking content-type — error pages
  // may arrive as text/html and we want the status-specific error, not a
  // content-type error.
  if (status < 200 || status >= 300) {
    await mapHttpError(status, rawHeaders, body);
  }

  // Early-reject if Content-Length declares more bytes than we're willing to
  // buffer — avoids pulling oversized payloads over the wire at all.
  const contentLength = flatHeaders["content-length"];
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      body.destroy();
      throw new HttpAdapterServerError(`response too large: declared ${declared} bytes, max ${maxBytes}`, { status });
    }
  }

  // Enforce application/json on success — HTML error pages that slip through
  // with a 200 are a known failure mode for some CDN/proxy setups.
  if (!contentType.includes("application/json")) {
    body.destroy();
    throw new HttpAdapterServerError(`Unexpected content-type: expected application/json, got "${contentType}"`);
  }

  const rawText = await drainReadable(body, maxBytes);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new HttpAdapterServerError(`Failed to parse JSON response: ${safeRedact(rawText.slice(0, 200))}`, {
      cause: err,
    });
  }

  return { body: parsed, status, headers: flatHeaders };
}

/**
 * Send a POST and return the raw response stream for SSE consumption.
 *
 * The response body is NOT consumed here — the caller (SSE parser layer) owns
 * the stream lifecycle. Error statuses are handled eagerly before returning.
 */
export async function sendJsonStream(opts: SendJsonOptions): Promise<SendJsonStreamResult> {
  const maxBytes = opts.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const { status, headers: rawHeaders, body } = await executeRequest(opts, "text/event-stream");

  const flatHeaders = flattenHeaders(rawHeaders);
  const contentType = flatHeaders["content-type"] ?? "";

  // Non-2xx: map to typed errors (consumes the body for the error message).
  if (status < 200 || status >= 300) {
    await mapHttpError(status, rawHeaders, body);
  }

  // Early-reject if Content-Length declares more bytes than we're willing to
  // buffer — avoids pulling oversized payloads over the wire at all.
  const contentLength = flatHeaders["content-length"];
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      body.destroy();
      throw new HttpAdapterServerError(`response too large: declared ${declared} bytes, max ${maxBytes}`, { status });
    }
  }

  // Require text/event-stream on success — a JSON response here means the
  // provider returned a non-streaming reply despite stream=true in the body.
  if (!contentType.includes("text/event-stream")) {
    body.destroy();
    throw new HttpAdapterServerError(
      `Unexpected content-type for streaming: expected text/event-stream, got "${contentType}"`,
    );
  }

  // Wrap the Node.js Readable into a WHATWG ReadableStream<Uint8Array> so
  // the SSE parser layer can use the Web Streams API uniformly.
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      body.on("data", (chunk: Buffer | Uint8Array | string) => {
        const bytes = Buffer.isBuffer(chunk)
          ? new Uint8Array(chunk)
          : typeof chunk === "string"
            ? TEXT_ENCODER.encode(chunk)
            : chunk instanceof Uint8Array
              ? chunk
              : new Uint8Array(Buffer.from(chunk as string));
        controller.enqueue(bytes);
      });
      body.on("end", () => controller.close());
      body.on("error", (err: Error) => controller.error(err));
    },
    cancel() {
      body.destroy();
    },
  });

  return { body: webStream, status, headers: flatHeaders };
}

/**
 * Create a transport instance with its own logical identity.
 * All instances share the module-level undici Agent (connection pool) for
 * keepalive reuse across concurrent requests to the same origin.
 */
export function createTransport(_opts?: TransportOptions): Transport {
  return {
    sendJson: (o) => sendJson(o),
    sendJsonStream: (o) => sendJsonStream(o),
  };
}

// ---------------------------------------------------------------------------
// Barrel namespace export (index.ts re-exports `transport`)
// ---------------------------------------------------------------------------

export const transport = {
  sendJson,
  sendJsonStream,
  createTransport,
};

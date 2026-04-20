/**
 * Structured telemetry event emitter for HTTP adapter calls.
 *
 * Every adapter call emits one `AdapterCallEvent` to a pluggable sink.
 * Sinks are selected via the `IRONWORKS_TELEMETRY_SINK` env var or the
 * `ObserverOptions.sink` override injected at construction time.
 *
 * Sink values:
 * - `stdout` (default) — JSON newline per event to process.stdout; captured
 *   by Docker / cloud log drivers and queryable via structured-log tooling.
 * - `none` — silent no-op; use in tests or contexts where logs are unwanted.
 * - `http:<url>` — fire-and-forget POST to an external collector; errors are
 *   swallowed so telemetry failures never crash adapter paths.
 *
 * Redaction is applied unconditionally before any sink write so secrets
 * present in error details or context blobs never reach logs or collectors.
 */

import { redactSecrets } from "./redaction.js";
import type { UsageSummary } from "./sse-parser.js";

// ─── Public types ─────────────────────────────────────────────────────────────

/** Structured payload emitted once per adapter call for observability + billing. */
export interface AdapterCallEvent {
  /** ISO 8601 UTC timestamp set at call completion. */
  timestamp: string;
  /** Unique identifier for the request (from B.19 request-id utility). */
  request_id: string;
  /** Atlas Ops workspace or tenant identifier. */
  workspace_id: string;
  /** Adapter variant that processed the call (e.g. `poe_api`, `openai`, `anthropic`). */
  adapter_type: string;
  /** Normalized model name resolved at call time. */
  model: string;
  /** Wall-clock duration from request dispatch to final byte received. */
  duration_ms: number;
  /** `success` or `error`; drives downstream alerting and retry dashboards. */
  status: "success" | "error";
  /** Provider-reported token counts; absent when not available (e.g. streamed no-usage path). */
  token_usage?: UsageSummary;
  /** Estimated cost in USD; computed by the cost utility (B.5). */
  cost_usd?: number;
  /**
   * Whether the response was served from the provider's prompt cache.
   * Feeds the cache-hit rate metric on the cost dashboard.
   */
  cache_hit?: boolean;
  /** Machine-readable error identifier when status=error (e.g. `rate_limit`, `auth_failed`). */
  error_code?: string;
  /**
   * Human-readable error detail; redacted before emission so stack traces
   * containing credentials don't reach logs.
   */
  error_detail?: string;
  /** Identity of the end-user or automation that triggered the call, if known. */
  user_triggered_by?: string;
  /**
   * Optional free-form context bag (run_id, pipeline name, etc.).
   * Deep-redacted before emission.
   */
  context?: Record<string, unknown>;
}

/**
 * Sink discriminated union.
 * `http:` prefix carries the full URL as the suffix so the type system encodes
 * the shape without needing a wrapper object.
 */
export type TelemetrySink = "stdout" | "none" | `http:${string}`;

/** Construction options for `createObserver`. */
export interface ObserverOptions {
  /**
   * Sink override. When omitted the value of `IRONWORKS_TELEMETRY_SINK` is
   * read from the environment; if that is also unset, `stdout` is used.
   */
  sink?: TelemetrySink;
  /**
   * Inject a custom fetch implementation (for testing HTTP sink behaviour
   * without real network calls).
   */
  fetchImpl?: typeof fetch;
}

/** Observer interface returned by `createObserver`. */
export interface Observer {
  /**
   * Fire-and-forget emit. Never throws regardless of sink errors.
   * Numeric fields (token_usage, cost_usd, duration_ms) survive redaction intact.
   * Circular references or unserializable context degrade to a minimal event preserving correlation fields.
   */
  emit(event: AdapterCallEvent): void;
  /**
   * Wait for any in-flight HTTP posts to settle (succeed or fail).
   * Resolves to `undefined` in all cases — callers should not depend on
   * rejection for flow control.
   */
  flush(): Promise<void>;
}

// ─── Inflight cap constants ───────────────────────────────────────────────────

/** Max concurrent in-flight HTTP telemetry requests. Protects against unbounded memory growth under slow collectors. */
const MAX_INFLIGHT_HTTP = 256;

/** Tracks events dropped in the current burst window for rate-limited stderr warnings. */
let droppedInBurst = 0;

/** Timestamp (ms) of the last stderr drop-warning so we don't spam stderr on every drop. */
let lastDropWarningMs = 0;

// ─── Safe serialization ───────────────────────────────────────────────────────

/**
 * Serialize an event to JSON, gracefully handling circular references or
 * otherwise unserializable values. On failure emits a degraded event that
 * preserves correlation fields so observers can still track the call.
 */
function safeStringify(event: AdapterCallEvent): string {
  try {
    return JSON.stringify(event);
  } catch {
    // Circular reference or unserializable field. Emit a degraded event that preserves
    // correlation fields so observers can still track the call happened.
    return JSON.stringify({
      timestamp: event.timestamp,
      request_id: event.request_id,
      workspace_id: event.workspace_id,
      adapter_type: event.adapter_type,
      model: event.model,
      duration_ms: event.duration_ms,
      status: event.status,
      error_code: "telemetry_serialization_failed",
      error_detail: "event payload contained a circular reference or unserializable value",
    });
  }
}

// ─── Sink resolution ──────────────────────────────────────────────────────────

/**
 * Resolve the sink from the process environment.
 * Reads once at observer construction; no live reload in v1 (SIGHUP is
 * out-of-scope until a persistent daemon architecture is introduced).
 * Invalid HTTP URLs emit a one-time stderr warning and fall back to stdout
 * so misconfiguration is visible without crashing the process.
 */
function resolveSinkFromEnv(): TelemetrySink {
  const raw = process.env.IRONWORKS_TELEMETRY_SINK;
  if (!raw) return "stdout";
  if (raw === "stdout" || raw === "none") return raw;

  // Extract URL portion from bare URLs or already-prefixed `http:` values.
  let urlString: string | undefined;
  if (raw.startsWith("http://") || raw.startsWith("https://")) urlString = raw;
  else if (raw.startsWith("http:")) urlString = raw.slice(5);

  if (urlString) {
    try {
      new URL(urlString);
      // URL is valid; return with the `http:` sentinel prefix.
      return `http:${urlString}`;
    } catch {
      // Invalid URL — warn once so misconfiguration surfaces in prod logs.
      process.stderr.write(
        `[observability] invalid IRONWORKS_TELEMETRY_SINK URL: ${urlString}; falling back to stdout\n`,
      );
      return "stdout";
    }
  }

  // Unknown sink value — warn and fall back rather than silently ignoring.
  process.stderr.write(`[observability] unknown IRONWORKS_TELEMETRY_SINK value: ${raw}; falling back to stdout\n`);
  return "stdout";
}

// ─── Public factory ───────────────────────────────────────────────────────────

/**
 * Create a new `Observer` bound to the given (or env-resolved) sink.
 *
 * @example
 * ```ts
 * const obs = createObserver(); // uses IRONWORKS_TELEMETRY_SINK or stdout
 * obs.emit({ ... });
 * await obs.flush(); // only needed in tests or graceful-shutdown paths
 * ```
 */
export function createObserver(options: ObserverOptions = {}): Observer {
  const sink = options.sink ?? resolveSinkFromEnv();
  const fetchFn = options.fetchImpl ?? fetch;

  // Track in-flight HTTP promises so `flush()` can await them.
  const inflight = new Set<Promise<unknown>>();

  return {
    emit(event: AdapterCallEvent): void {
      if (sink === "none") return;

      // Redact before serialisation: error_detail, context blobs, etc. may
      // contain credentials that leaked through from caller code.
      const redacted = redactSecrets(event as unknown as Record<string, unknown>);

      // safeStringify handles circular refs in context without throwing.
      const line = `${safeStringify(redacted as unknown as AdapterCallEvent)}\n`;

      if (sink === "stdout") {
        process.stdout.write(line);
        return;
      }

      if (sink.startsWith("http:")) {
        // Cap concurrent in-flight requests to prevent unbounded memory growth
        // when a collector is slow or unreachable for an extended period.
        if (inflight.size >= MAX_INFLIGHT_HTTP) {
          droppedInBurst++;
          // Throttle stderr warnings to at most once per 10 seconds so a sustained
          // outage doesn't flood the log with individual drop notices.
          const now = Date.now();
          if (now - lastDropWarningMs > 10_000) {
            process.stderr.write(
              `[observability] telemetry queue full (${inflight.size} in-flight); dropped ${droppedInBurst} events\n`,
            );
            lastDropWarningMs = now;
            droppedInBurst = 0;
          }
          return; // drop this event
        }

        // Strip the `http:` sentinel to recover the real URL.
        const url = sink.slice(5);
        const p = fetchFn(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // Identify the emitting library so collectors can distinguish
            // adapter-utils telemetry from other ironworks components.
            "x-ironworks-source": "adapter-utils",
          },
          body: line,
        }).catch(() => {
          // Telemetry failures must never propagate to adapter callers.
          // stdout is the durable fallback in production environments.
        });
        inflight.add(p);
        // Clean up after settlement to avoid unbounded growth on long-lived observers.
        void p.finally(() => inflight.delete(p));
      }
    },

    async flush(): Promise<void> {
      // allSettled absorbs both resolved and rejected promises; never throws.
      await Promise.allSettled([...inflight]);
    },
  };
}

// ─── Module-level default observer ───────────────────────────────────────────

/**
 * Lazily-constructed singleton observer.
 * Created on first call to `emitCallEvent` so the env var is evaluated after
 * any test-time assignments rather than at module load.
 */
let _defaultObserver: Observer | undefined;

function getDefaultObserver(): Observer {
  if (!_defaultObserver) _defaultObserver = createObserver();
  return _defaultObserver;
}

/**
 * Convenience wrapper that emits to the process-level default observer.
 * Adapters should call this rather than managing an `Observer` instance
 * directly; the observer is wired to the env-configured sink automatically.
 */
export function emitCallEvent(event: AdapterCallEvent): void {
  getDefaultObserver().emit(event);
}

/**
 * Reset the default observer so the next `emitCallEvent` call re-reads the
 * environment.  Exported for test isolation only — do not call in production.
 */
export function _resetDefaultObserver(): void {
  _defaultObserver = undefined;
}

// ─── Barrel namespace ─────────────────────────────────────────────────────────

/** Namespace export for barrel-style imports (`observability.createObserver`, etc.). */
export const observability = {
  createObserver,
  emitCallEvent,
  _resetDefaultObserver,
};

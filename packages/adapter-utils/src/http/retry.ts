import {
  HttpAdapterError,
  HttpAdapterRateLimitError,
} from './errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for the retry executor. All values are read-only per invocation —
 * the executor never mutates the policy object.
 */
export interface RetryPolicy {
  /** Maximum number of RETRIES (initial attempt is not counted). */
  maxRetries: number;
  /** Base delay for exponential backoff in milliseconds. */
  baseDelayMs: number;
  /**
   * Jitter as a ratio [0, 1]. Applied as ±ratio variance on the computed delay.
   * 0.3 = ±30% random spread.
   */
  jitterRatio: number;
  /**
   * Hard cap on cumulative elapsed time across all attempts and sleeps, in
   * milliseconds. Prevents runaway retry loops when upstream is pathologically
   * slow. Checked before each sleep; if the remaining budget is exhausted the
   * last error is rethrown immediately.
   */
  totalTimeoutMs: number;
}

/**
 * Mutable flag shared between the retry executor and the function being
 * retried. The function (typically an SSE consumer) sets `emitted = true` the
 * moment a tool_call block has been fully received. The executor reads this
 * flag before each retry decision.
 *
 * Using a mutable object (rather than a return value or closure variable)
 * allows the flag to be set from deep inside a streaming pipeline without
 * threading it back up through multiple return values.
 */
export interface ToolCallFlag {
  /**
   * Set to true when a tool_call has been emitted upstream. Prevents retry
   * even on retryable errors — retrying after a tool_call may cause duplicate
   * execution (files written twice, emails sent twice, payments processed twice).
   */
  emitted: boolean;
}

/**
 * Per-invocation context passed to the retried function on every attempt.
 * The function MAY mutate `toolCallFlag.emitted` to signal the executor that
 * retrying is no longer safe.
 */
export interface RetryContext {
  /** 0-indexed attempt counter. 0 = initial call, 1+ = retries. */
  attempt: number;
  /** Shared mutable flag; set `emitted = true` once a tool_call has been sent. */
  toolCallFlag: ToolCallFlag;
}

/**
 * Payload delivered to the `onRetry` callback before each sleep-then-retry
 * cycle. Useful for logging, metrics, and circuit-breaker integration.
 */
export interface RetryEvent {
  /** The attempt that failed (0-indexed, same as RetryContext.attempt). */
  attempt: number;
  /** The error that triggered this retry. */
  error: unknown;
  /** Milliseconds the executor will sleep before the next attempt. */
  delayMs: number;
}

/** Options for a single `runWithRetry` invocation. */
export interface RetryOptions {
  policy: RetryPolicy;
  /**
   * Shared tool-call flag. When omitted the executor creates a local flag
   * (`{ emitted: false }`). Pass an explicit flag when the retried function
   * is an SSE consumer that needs to signal mid-stream tool emission.
   */
  toolCallFlag?: ToolCallFlag;
  /** Called synchronously before each retry sleep. Optional. */
  onRetry?: (event: RetryEvent) => void;
  /** When aborted, the next sleep or attempt check throws the signal reason. */
  abortSignal?: AbortSignal;
}

/** Sensible production defaults. Override per-call via spread. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 500,
  jitterRatio: 0.3,
  totalTimeoutMs: 60_000,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns a Promise that resolves after `ms` milliseconds, or rejects if the
 * provided AbortSignal fires first.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    // onAbort must be defined before setTimeout so the timer callback can
    // reference it for cleanup.
    let onAbort: (() => void) | undefined;

    const timer = setTimeout(() => {
      // { once: true } only auto-removes on the abort event itself, not on
      // normal timer expiry. Explicit removal prevents listener accumulation
      // on long-lived AbortControllers reused across many retry operations.
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    if (signal) {
      onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Adds bounded random spread to a base delay.
 * Jitter prevents thundering-herd when many clients retry after a shared outage.
 */
function applyJitter(baseMs: number, ratio: number): number {
  const variance = baseMs * ratio * (Math.random() * 2 - 1);
  return Math.max(0, baseMs + variance);
}

// ---------------------------------------------------------------------------
// Core executor
// ---------------------------------------------------------------------------

/**
 * Execute `fn` with bounded exponential-backoff retries on transient errors.
 *
 * Invariant: once `toolCallFlag.emitted` is true, NO retry is attempted
 * regardless of error type. This prevents duplicate tool execution when an SSE
 * stream disconnects mid-response after a tool_use block has been emitted to
 * the agent runtime (e.g. file write, email send, API call).
 *
 * Retries only on `HttpAdapterError` subclasses with `err.retryable === true`.
 * Unknown/non-HttpAdapterError errors propagate immediately without retrying.
 *
 * @param fn      Async function to execute. Receives a `RetryContext` on each
 *                attempt so it can mutate the shared `toolCallFlag`.
 * @param options Policy, shared flag, optional callbacks, and abort support.
 */
export async function runWithRetry<T>(
  fn: (ctx: RetryContext) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { policy, onRetry, abortSignal } = options;
  // Use a caller-supplied flag when available so SSE consumers can signal
  // tool emission from inside the stream without a separate return channel.
  const toolCallFlag: ToolCallFlag = options.toolCallFlag ?? { emitted: false };
  const startTime = Date.now();

  let lastError: unknown;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    if (abortSignal?.aborted) {
      throw abortSignal.reason;
    }

    const elapsed = Date.now() - startTime;
    // Never bail on the very first attempt due to timeout — the cap is for
    // accumulated retry overhead, not the initial call.
    if (attempt > 0 && elapsed >= policy.totalTimeoutMs) {
      throw lastError;
    }

    try {
      return await fn({ attempt, toolCallFlag });
    } catch (err) {
      lastError = err;

      // NEVER retry after tool_call emission — retrying could re-execute the
      // tool (file/email/payment duplicated). See HttpAdapterStreamBreak docs.
      if (toolCallFlag.emitted) {
        throw err;
      }

      // Unknown errors (not our error hierarchy) propagate immediately; we
      // can't reason about whether they're safe to retry.
      if (!(err instanceof HttpAdapterError)) {
        throw err;
      }

      if (!err.retryable) {
        throw err;
      }

      // Budget exhausted — rethrow the final error.
      if (attempt === policy.maxRetries) {
        throw err;
      }

      // Compute how long to wait before the next attempt.
      let delayMs: number;
      if (err instanceof HttpAdapterRateLimitError && err.retryAfterMs !== undefined) {
        // Honor the server's explicit backoff instruction when available.
        // Clamp to zero — broken upstreams have been observed sending negative values;
        // Node normalises setTimeout(..., -1) to 0 but intent should be explicit.
        delayMs = Math.max(0, err.retryAfterMs);
      } else {
        delayMs = applyJitter(policy.baseDelayMs * Math.pow(2, attempt), policy.jitterRatio);
      }

      // Clamp to remaining total-timeout budget.
      const remaining = policy.totalTimeoutMs - (Date.now() - startTime);
      if (remaining <= 0) {
        throw err;
      }
      delayMs = Math.min(delayMs, remaining);

      onRetry?.({ attempt, error: err, delayMs });

      await sleep(delayMs, abortSignal);
    }
  }

  // Unreachable: the loop always returns or throws, but TypeScript needs this.
  throw lastError ?? new Error('runWithRetry: exhausted without result or error');
}

// ---------------------------------------------------------------------------
// Barrel compatibility
// ---------------------------------------------------------------------------

// index.ts re-exports via `export { retry }` — keep the namespace shape.
export const retry = { runWithRetry, DEFAULT_RETRY_POLICY };

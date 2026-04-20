// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Token-bucket rate limiter configuration. */
export interface RateLimiterOptions {
  /** Refill rate in tokens per second. Default: 10. */
  tokensPerSecond?: number;
  /** Max bucket capacity (also the burst ceiling). Default: 60. */
  maxCapacity?: number;
  /**
   * Max number of distinct keys retained in memory. LRU evicts least-recently-used
   * when the cap is reached. Keys with non-empty queues are never evicted — doing so
   * would silently drop waiting callers. Default: 256.
   */
  maxKeys?: number;
}

export interface RateLimiter {
  /**
   * Reserve `cost` tokens for `key`. Resolves when the tokens are available.
   *
   * Waiters are served FIFO — a smaller request queued later never jumps ahead of a
   * larger one already waiting. This prevents starvation of high-cost callers when the
   * bucket refills just enough for cheaper requests.
   *
   * If `signal` is already aborted, rejects immediately without consuming any tokens.
   * If `signal` fires while waiting in queue, the waiter is removed and the promise
   * rejects; the abort listener is cleaned up in both normal and abort paths.
   *
   * **Queue depth:** The waiter queue is unbounded per key. For hostile workloads an
   * external cap should be applied at the adapter layer; for normal agent fleets the
   * natural bound is concurrent-request-count per provider, which is typically << 100.
   *
   * @param key  Per-provider (or per-tenant) isolation key.
   * @param cost Number of tokens this call spends. Must be > 0 and <= maxCapacity.
   *             May be fractional (e.g. 0.5 for half-credit requests). Default: 1.
   * @param signal Optional AbortSignal for cooperative cancellation.
   */
  acquire(key: string, cost?: number, signal?: AbortSignal): Promise<void>;

  /** Diagnostic: current remaining tokens for key (fractional). */
  available(key: string): number;

  /** Force-reset a key's state. Useful for testing and manual recovery. */
  reset(key: string): void;
}

// ---------------------------------------------------------------------------
// Internal state per key
// ---------------------------------------------------------------------------

interface Waiter {
  cost: number;
  resolve: () => void;
  reject: (err: Error) => void;
  /** The AbortSignal passed by the caller; null when none was provided. */
  signal: AbortSignal | null;
  /** Cleanup installed on the AbortSignal; null when no signal was provided. */
  onAbort: (() => void) | null;
}

interface KeyState {
  /** Current available tokens (fractional to avoid drift). */
  tokens: number;
  /** Timestamp of the last refill calculation in ms. */
  lastRefillMs: number;
  /** FIFO queue of waiters blocked on insufficient tokens. */
  queue: Waiter[];
  /** Handle for the pending setTimeout used to drive the queue; null when idle. */
  timerId: ReturnType<typeof setTimeout> | null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a process-local, per-key token-bucket rate limiter.
 *
 * Each key (e.g. 'poe', 'anthropic') owns an independent bucket so one
 * provider's rate pressure does not slow down callers for other providers.
 *
 * The bucket starts full (maxCapacity tokens) and refills continuously at
 * `tokensPerSecond`. Tokens are fractional internally to avoid accumulated
 * drift from integer rounding.
 *
 * **Memory bound:** The `states` map is capped at `maxKeys` entries. The Map's
 * insertion order is used as an LRU indicator: every access moves a key to the
 * tail via delete + re-insert. Eviction walks from the head and removes the
 * first key whose queue is empty. Keys with waiting callers are never evicted.
 */
export function createRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
  const tokensPerSecond = options.tokensPerSecond ?? 10;
  const maxCapacity = options.maxCapacity ?? 60;
  const maxKeys = options.maxKeys ?? 256;

  if (tokensPerSecond <= 0) throw new Error("tokensPerSecond must be > 0");
  if (maxCapacity <= 0) throw new Error("maxCapacity must be > 0");
  if (maxKeys <= 0) throw new Error("maxKeys must be > 0");

  // Map insertion order = LRU; delete+re-insert on access moves entry to tail.
  const states = new Map<string, KeyState>();

  // ---------------------------------------------------------------------------
  // LRU helpers
  // ---------------------------------------------------------------------------

  function getOrInit(key: string): KeyState {
    let s = states.get(key);
    if (s) {
      // Move to tail (most-recently-used)
      states.delete(key);
      states.set(key, s);
      return s;
    }

    s = {
      tokens: maxCapacity, // bucket starts full
      lastRefillMs: Date.now(),
      queue: [],
      timerId: null,
    };

    // Evict before inserting if we are at the cap
    if (states.size >= maxKeys) {
      // Walk from head (oldest) and evict the first key with an empty queue.
      // Keys with active waiters are never evicted to avoid silently dropping callers.
      for (const [candidateKey, candidate] of states) {
        if (candidate.queue.length === 0) {
          if (candidate.timerId !== null) clearTimeout(candidate.timerId);
          states.delete(candidateKey);
          break;
        }
      }
      // If every key has pending waiters we grow past maxKeys temporarily;
      // dropping a waiter would be worse than a transient memory overage.
    }

    states.set(key, s);
    return s;
  }

  // ---------------------------------------------------------------------------
  // Refill logic
  // ---------------------------------------------------------------------------

  /**
   * Advance the bucket's token count by computing elapsed time since last refill.
   * Tokens are capped at maxCapacity to prevent unbounded accumulation.
   * Uses fractional arithmetic to avoid drift from repeated integer rounding.
   */
  function refill(s: KeyState): void {
    const now = Date.now();
    const elapsed = (now - s.lastRefillMs) / 1000; // seconds
    s.tokens = Math.min(maxCapacity, s.tokens + elapsed * tokensPerSecond);
    s.lastRefillMs = now;
  }

  // ---------------------------------------------------------------------------
  // Queue processing
  // ---------------------------------------------------------------------------

  /**
   * Drain the FIFO queue: serve as many head-of-queue waiters as the current
   * token balance allows, then schedule a wakeup for when the next waiter can
   * be served. Called after every token acquisition and after every refill tick.
   *
   * FIFO invariant: we only inspect queue[0]. Even if a later waiter needs fewer
   * tokens, we don't skip over the head — that would starve high-cost callers.
   */
  function processQueue(key: string, s: KeyState): void {
    // Clear any existing timer so we don't double-schedule
    if (s.timerId !== null) {
      clearTimeout(s.timerId);
      s.timerId = null;
    }

    refill(s);

    // Serve head-of-queue entries while we have enough tokens
    while (s.queue.length > 0) {
      const head = s.queue[0];
      if (s.tokens < head.cost) break;

      // Enough tokens: dequeue, clean up the abort listener, resolve the waiter
      s.queue.shift();
      s.tokens -= head.cost;

      if (head.signal && head.onAbort) {
        // Remove the listener from the original signal before resolving — long-lived
        // signals shared across multiple acquires would otherwise accumulate listeners.
        head.signal.removeEventListener("abort", head.onAbort);
      }
      head.onAbort = null;

      head.resolve();
    }

    // If waiters remain, schedule a wakeup when the head will have enough tokens
    if (s.queue.length > 0) {
      const needed = s.queue[0].cost - s.tokens;
      // How many ms until `needed` tokens are available at the current refill rate
      const waitMs = Math.ceil((needed / tokensPerSecond) * 1000);
      s.timerId = setTimeout(() => {
        s.timerId = null;
        processQueue(key, s);
      }, waitMs);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function acquire(key: string, cost = 1, signal?: AbortSignal): Promise<void> {
    // Reject impossible requests early — they can never be satisfied regardless
    // of how long the caller waits, so queuing them would block others forever.
    if (cost > maxCapacity) {
      return Promise.reject(new Error(`acquire cost ${cost} exceeds capacity ${maxCapacity}`));
    }

    // Reject immediately if the signal is already cancelled — do not consume tokens
    if (signal?.aborted) {
      return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error("Aborted"));
    }

    const s = getOrInit(key);
    refill(s);

    // Fast path: tokens available and nobody is waiting ahead of us
    if (s.queue.length === 0 && s.tokens >= cost) {
      s.tokens -= cost;
      return Promise.resolve();
    }

    // Slow path: enqueue and wait
    return new Promise<void>((resolve, reject) => {
      let onAbort: (() => void) | null = null;

      const waiter: Waiter = {
        cost,
        resolve,
        reject,
        signal: signal ?? null,
        onAbort: null,
      };

      if (signal) {
        onAbort = () => {
          // Guard against the rare race where the timer fires and resolves the waiter
          // in the same microtask turn that abort fires — only act if still queued.
          const idx = s.queue.indexOf(waiter);
          if (idx === -1) return; // already resolved, nothing to do

          s.queue.splice(idx, 1);
          // Null the back-reference so processQueue's cleanup no-ops if it runs
          waiter.onAbort = null;

          reject(signal.reason instanceof Error ? signal.reason : new Error("Aborted"));

          // Reschedule the timer in case the evicted head was the one blocking others
          if (s.queue.length > 0 && s.timerId === null) {
            processQueue(key, s);
          }
        };
        waiter.onAbort = onAbort;
        signal.addEventListener("abort", onAbort, { once: true });
      }

      s.queue.push(waiter);

      // Kick the queue processor if no timer is already running
      if (s.timerId === null) {
        processQueue(key, s);
      }
    });
  }

  function available(key: string): number {
    const s = states.get(key);
    if (!s) return maxCapacity; // unknown key = fresh bucket
    refill(s);
    return s.tokens;
  }

  function reset(key: string): void {
    const s = states.get(key);
    if (!s) return;

    // Drain queue first — waiters would otherwise hang on unresolvable promises.
    for (const waiter of s.queue) {
      if (waiter.signal && waiter.onAbort) {
        waiter.signal.removeEventListener("abort", waiter.onAbort);
      }
      waiter.reject(new Error("rate limiter reset"));
    }

    // Clear any pending wake-up timer
    if (s.timerId !== null) {
      clearTimeout(s.timerId);
      s.timerId = null;
    }

    states.delete(key);
  }

  return { acquire, available, reset };
}

// ---------------------------------------------------------------------------
// Barrel compat
// ---------------------------------------------------------------------------

export const rateLimiter = { createRateLimiter };

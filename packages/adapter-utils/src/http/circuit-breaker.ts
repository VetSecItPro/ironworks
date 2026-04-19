import { HttpAdapterCircuitOpenError, HttpAdapterError } from './errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for createCircuitBreaker(). All fields optional with sensible defaults. */
export interface CircuitBreakerOptions {
  /** Consecutive tripping failures needed to open the circuit. Default: 5. */
  failureThreshold?: number;
  /** How long the circuit stays open before moving to half-open. Default: 60_000 (60s). */
  cooldownMs?: number;
  /**
   * Predicate deciding whether a caught error counts toward the failure threshold.
   * Default: any HttpAdapterError with retryable=true (server errors, rate-limit, timeout).
   * Auth/config/unknown errors do NOT trip the circuit by default because circuit-breaking
   * them does not help — they are permanent failures, not transient ones.
   */
  shouldTrip?: (err: unknown) => boolean;
  /**
   * Maximum number of per-key states retained in memory. When exceeded, the
   * least-recently-accessed key is evicted. Only keys in `closed` state with zero
   * consecutive failures are eligible for eviction — open/half-open states are
   * preserved regardless because evicting them would silently reset protection.
   * Default: 256.
   */
  maxKeys?: number;
}

export interface CircuitBreaker {
  run<T>(key: string, fn: () => Promise<T>): Promise<T>;
  /** Inspect current state for a key. Mainly for tests / diagnostics. */
  getState(key: string): 'closed' | 'open' | 'half_open';
  /** Force-reset a key's state. For manual ops recovery. */
  reset(key: string): void;
}

// ---------------------------------------------------------------------------
// Internal state shape (one entry per adapter key)
// ---------------------------------------------------------------------------

interface KeyState {
  state: 'closed' | 'open' | 'half_open';
  consecutiveFailures: number;
  /** Timestamp when the circuit was last opened; null while closed. */
  openedAtMs: number | null;
  /**
   * Resolves when the current half-open probe completes (success or failure).
   * Non-null only while a probe is actively running. Concurrent callers that
   * arrive after cooldown but find a probe already in flight treat the circuit
   * as still open rather than launching a second probe — this prevents multiple
   * concurrent requests from hammering a potentially-recovering provider.
   */
  probe: Promise<void> | null;
}

// ---------------------------------------------------------------------------
// Default shouldTrip predicate
// ---------------------------------------------------------------------------

/**
 * Only retryable adapter errors trip the circuit.
 * Non-retryable errors (auth, config) are permanent and circuit-breaking them
 * would mask the real problem without reducing load on the provider.
 */
const defaultShouldTrip = (err: unknown): boolean => {
  return err instanceof HttpAdapterError && err.retryable === true;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a process-local, per-key circuit breaker.
 *
 * Each key (e.g. 'poe', 'anthropic') owns independent state so one
 * flapping provider cannot block others sharing the same instance.
 *
 * **Probe ownership invariant:** The probe owner is whichever caller first
 * transitions state from 'open' to 'half_open' under a cleared `probe` field.
 * All subsequent callers that arrive while that probe is in flight fail-fast
 * with `HttpAdapterCircuitOpenError`. This is intentional: we don't want
 * multiple probes hammering a provider that may or may not have recovered.
 *
 * **Memory bound:** The `states` map is capped at `maxKeys` entries (default 256).
 * When the cap is exceeded, the least-recently-accessed key that is safely
 * evictable (closed + zero failures) is removed. Open/half-open keys are never
 * evicted because doing so would silently reset active circuit protection.
 */
export function createCircuitBreaker(options: CircuitBreakerOptions = {}): CircuitBreaker {
  const failureThreshold = options.failureThreshold ?? 5;
  const cooldownMs = options.cooldownMs ?? 60_000;
  const maxKeys = options.maxKeys ?? 256;
  // Freeze options so later mutation of the caller's object doesn't change behavior
  const shouldTrip = options.shouldTrip ?? defaultShouldTrip;

  // Map preserves insertion order; we exploit this for LRU tracking by
  // delete-then-re-insert on every access (moves entry to tail = most recent).
  const states = new Map<string, KeyState>();

  function getOrInit(key: string): KeyState {
    let s = states.get(key);
    if (s) {
      // Move to tail (most recently used) by delete + re-insert
      states.delete(key);
      states.set(key, s);
      return s;
    }

    s = { state: 'closed', consecutiveFailures: 0, openedAtMs: null, probe: null };

    // Evict before inserting if we are at the cap
    if (states.size >= maxKeys) {
      // Walk from head (oldest) and evict the first safely-evictable entry.
      // Safely evictable = closed state + no accumulated failures.
      // Open/half-open entries are skipped to preserve active protection.
      for (const [candidateKey, candidate] of states) {
        if (candidate.state === 'closed' && candidate.consecutiveFailures === 0) {
          states.delete(candidateKey);
          break;
        }
      }
      // If every entry is open/half-open we cannot evict; the map grows past
      // maxKeys temporarily. This is an extreme edge case (maxKeys open circuits
      // simultaneously) and growing temporarily is safer than dropping protection.
    }

    states.set(key, s);
    return s;
  }

  async function run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const s = getOrInit(key);

    if (s.state === 'open') {
      const reopenAtMs = (s.openedAtMs ?? 0) + cooldownMs;
      if (Date.now() < reopenAtMs) {
        // Still within cooldown — fail-fast without calling the provider
        throw new HttpAdapterCircuitOpenError(
          `Circuit open for key "${key}". Retrying after ${new Date(reopenAtMs).toISOString()}.`,
          { reopenAtMs },
        );
      }

      // Cooldown elapsed. The first caller to arrive wins the probe; any concurrent
      // caller that finds probe !== null fails fast — see JSDoc on `run`.
      if (s.probe !== null) {
        throw new HttpAdapterCircuitOpenError(
          `Circuit open for key "${key}" (probe already in flight).`,
          { reopenAtMs },
        );
      }

      // We are the probe owner. Transition and set the lock before any await.
      s.state = 'half_open';
      let probeResolve!: () => void;
      s.probe = new Promise<void>((r) => { probeResolve = r; });

      try {
        const result = await fn();
        // Probe succeeded — provider is healthy again
        s.state = 'closed';
        s.consecutiveFailures = 0;
        s.openedAtMs = null;
        return result;
      } catch (err) {
        if (shouldTrip(err)) {
          // Provider still unhealthy — restart the cooldown clock
          s.state = 'open';
          s.openedAtMs = Date.now();
        } else {
          // Non-tripping error during probe: the probe slot is consumed but the
          // circuit should not stay stuck in half_open. Reset to closed so
          // subsequent calls proceed normally.
          s.state = 'closed';
          s.consecutiveFailures = 0;
        }
        throw err;
      } finally {
        s.probe = null;
        probeResolve();
      }
    }

    if (s.state === 'half_open') {
      // This branch is only reachable if state was externally set to half_open
      // (e.g. via a future administrative API). Treat as open to be defensive.
      const reopenAtMs = (s.openedAtMs ?? 0) + cooldownMs;
      throw new HttpAdapterCircuitOpenError(
        `Circuit open for key "${key}" (probe in flight).`,
        { reopenAtMs },
      );
    }

    // Closed state — normal execution path
    try {
      const result = await fn();
      // Reset consecutive counter on any success so a single blip doesn't accumulate
      s.consecutiveFailures = 0;
      return result;
    } catch (err) {
      if (shouldTrip(err)) {
        s.consecutiveFailures++;
        if (s.consecutiveFailures >= failureThreshold) {
          // Threshold crossed — open the circuit
          s.state = 'open';
          s.openedAtMs = Date.now();
        }
      }
      throw err;
    }
  }

  function getState(key: string): 'closed' | 'open' | 'half_open' {
    return states.get(key)?.state ?? 'closed';
  }

  function reset(key: string): void {
    states.delete(key);
  }

  return { run, getState, reset };
}

// ---------------------------------------------------------------------------
// Barrel compat
// ---------------------------------------------------------------------------

export const circuitBreaker = { createCircuitBreaker };

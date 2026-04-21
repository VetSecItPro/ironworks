/**
 * In-process LRU cache for plugin tool results.
 *
 * Design decisions:
 *
 * BACKEND — in-memory LRU per-worker, not Redis.
 * The tool call volume at plugin granularity is low (typically <100 distinct
 * arg combinations per agent run), and the latency benefit is only meaningful
 * when the round-trip to the plugin worker is avoided entirely. An in-memory
 * LRU achieves that at zero infrastructure cost. Redis would add a network hop
 * that partially negates the savings and requires operational overhead not yet
 * warranted. If a future Redis instance becomes available (e.g. for shared
 * rate-limit state already planned), migration is straightforward: replace
 * `ToolCache` with a Redis-backed implementation behind the same interface.
 *
 * LRU SIZE — 10,000 entries.
 * A single tool result is typically a few KB of JSON text. 10,000 entries at
 * 4 KB each = ~40 MB worst case, well inside Node's default heap. The cap is
 * intentionally generous because the eviction cost (a Map delete + insert) is
 * O(1) and the downside of over-eviction is a cache miss, not incorrectness.
 *
 * CACHE KEY — SHA-256 of `{ toolName, adapterType, argsSubset }`.
 * Including `adapterType` prevents a collision when two adapters call the same
 * tool name but expect different behavior from the same plugin. SHA-256 is
 * overkill for security here (there's no adversarial key-forging risk); it's
 * used because Node's built-in `crypto.createHash` is available without extra
 * deps and produces a compact, fixed-length key (64 hex chars) with negligible
 * collision probability.
 *
 * ERROR RESULTS — never cached.
 * A tool error is often transient (network blip, rate limit, worker restart).
 * Caching it would serve the stale error to subsequent callers for the full TTL,
 * masking recovery. Successful results are safe to cache because idempotent
 * read-only tools return the same data for the same args (within the TTL window).
 *
 * INVALIDATION — TTL expiry only (v1).
 * Manual invalidation adds API surface (and therefore attack surface and
 * operational complexity) for a v1 feature. TTL expiry is sufficient for the
 * declared use cases (web search caches, LLM-based classification). A manual
 * `invalidate(key)` method can be added when a concrete need is identified.
 */

import { createHash } from "node:crypto";
import type { PluginToolCacheConfig } from "@ironworksai/shared";

// Re-export so callers import from one place
export type { PluginToolCacheConfig };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A single entry stored in the cache.
 * `expiresAt` is an absolute epoch millisecond timestamp so TTL comparisons
 * are a simple `Date.now() >= entry.expiresAt` without tracking insert time.
 */
export interface ToolCacheEntry<T> {
  value: T;
  expiresAt: number;
}

/** Outcome of a cache lookup — discriminated by `hit`. */
export type ToolCacheLookup<T> = { hit: true; value: T } | { hit: false };

/** Summary counter snapshot returned by `getStats()`. */
export interface ToolCacheStats {
  hits: number;
  misses: number;
  size: number;
}

/**
 * A bounded LRU cache keyed by string, with per-entry TTL expiry.
 *
 * `T` is the cached value type. In production use `T = ToolResult` from the
 * plugin-sdk, but the cache implementation is generic to simplify testing.
 */
export interface ToolCache<T> {
  /**
   * Look up a cached entry by key. Returns a hit only when the key exists
   * AND the entry has not expired. Expired entries are evicted lazily here.
   */
  get(key: string): ToolCacheLookup<T>;

  /**
   * Store a value under `key` with the given TTL. Evicts the LRU entry when
   * the cache is at capacity before inserting.
   *
   * @param key - Cache key (typically from `buildCacheKey`)
   * @param value - The value to cache
   * @param ttlSeconds - Positive integer lifetime; entry is stale after this many seconds
   */
  set(key: string, value: T, ttlSeconds: number): void;

  /** Current number of entries (may include not-yet-evicted expired ones). */
  size(): number;

  /** Snapshot of hit/miss counters for observability. */
  getStats(): ToolCacheStats;

  /** Evict all entries (used in tests to guarantee a clean slate). */
  clear(): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum number of entries the default cache holds before evicting the LRU.
 * 10,000 is large enough to cover any realistic set of distinct arg combinations
 * without meaningful memory pressure (~40 MB ceiling at 4 KB per entry).
 */
export const DEFAULT_MAX_CACHE_SIZE = 10_000;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new in-memory LRU `ToolCache`.
 *
 * @param maxSize - Maximum number of entries before LRU eviction. Defaults to
 *   {@link DEFAULT_MAX_CACHE_SIZE}. Pass a smaller value in tests.
 */
export function createToolCache<T>(maxSize: number = DEFAULT_MAX_CACHE_SIZE): ToolCache<T> {
  // Map preserves insertion order; deleting and re-inserting on access moves
  // an entry to the "most-recently-used" tail. Eviction removes the head (Map's
  // first key in insertion order). This is the canonical O(1) LRU pattern with
  // a plain JS Map — no third-party LRU library needed.
  const store = new Map<string, ToolCacheEntry<T>>();

  let hits = 0;
  let misses = 0;

  return {
    get(key: string): ToolCacheLookup<T> {
      const entry = store.get(key);

      if (!entry) {
        misses++;
        return { hit: false };
      }

      // Lazy expiry: evict now rather than letting stale data sit until the
      // next set() eviction pass. This keeps the effective cache size closer
      // to the number of live entries rather than total inserted entries.
      if (Date.now() >= entry.expiresAt) {
        store.delete(key);
        misses++;
        return { hit: false };
      }

      // LRU refresh: move to MRU tail by deleting and re-inserting.
      store.delete(key);
      store.set(key, entry);

      hits++;
      return { hit: true, value: entry.value };
    },

    set(key: string, value: T, ttlSeconds: number): void {
      // If the key already exists, remove it first so the re-insert lands at
      // the MRU tail (avoids a stale entry sitting near the LRU head).
      if (store.has(key)) {
        store.delete(key);
      }

      // Evict the LRU entry (Map's first insertion-order key) when at capacity.
      if (store.size >= maxSize) {
        const firstKey = store.keys().next().value;
        if (firstKey !== undefined) {
          store.delete(firstKey);
        }
      }

      store.set(key, {
        value,
        expiresAt: Date.now() + ttlSeconds * 1_000,
      });
    },

    size(): number {
      return store.size;
    },

    getStats(): ToolCacheStats {
      return { hits, misses, size: store.size };
    },

    clear(): void {
      store.clear();
      hits = 0;
      misses = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Cache key construction
// ---------------------------------------------------------------------------

/**
 * Build a deterministic cache key from the tool identity and the relevant
 * subset of call arguments.
 *
 * Why SHA-256 rather than a plain JSON string?
 * - Bounded, fixed-length keys (64 hex chars) regardless of arg depth or size.
 * - Protects the Map from O(n) key comparisons on very large arg blobs.
 * - Avoids Map key collisions from args that happen to share a JSON prefix.
 *
 * Why `JSON.stringify` with sorted keys for the args subset?
 * Stable JSON key ordering ensures two calls with the same args in different
 * insertion order produce the same key. Without it `{ a:1, b:2 }` and
 * `{ b:2, a:1 }` would be different keys despite being semantically equal.
 *
 * @param toolName - The bare (non-namespaced) tool name
 * @param adapterType - The adapter type string (e.g. "anthropic-api")
 * @param args - Full args object from the tool invocation
 * @param cacheConfig - The tool's cache configuration; `keyFields` controls
 *   which args contribute to the key
 */
export function buildCacheKey(
  toolName: string,
  adapterType: string,
  args: Record<string, unknown>,
  cacheConfig: PluginToolCacheConfig,
): string {
  // Compute the arg subset that should contribute to the key.
  // When `keyFields` is absent or empty we use all args — the safe default
  // because it errs toward cache misses rather than false hits.
  const argsSubset: Record<string, unknown> =
    cacheConfig.keyFields && cacheConfig.keyFields.length > 0
      ? Object.fromEntries(cacheConfig.keyFields.filter((f) => f in args).map((f) => [f, args[f]]))
      : args;

  // Stable JSON serialization: sort keys recursively so insertion order
  // in the caller's args object never affects the key.
  const payload = JSON.stringify(
    { toolName, adapterType, argsSubset },
    // replacer that sorts object keys at every level
    (_key, value: unknown) =>
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
        : value,
  );

  return createHash("sha256").update(payload).digest("hex");
}

// ---------------------------------------------------------------------------
// Module-level default cache instance
// ---------------------------------------------------------------------------

// Single shared instance for production use. Tests that need isolation should
// call `createToolCache()` directly and pass the instance around rather than
// using this singleton — it prevents test state from leaking between runs.
let _defaultCache: ToolCache<unknown> | undefined;

function getDefaultCache(): ToolCache<unknown> {
  if (!_defaultCache) {
    _defaultCache = createToolCache(DEFAULT_MAX_CACHE_SIZE);
  }
  return _defaultCache;
}

/**
 * Reset the default cache singleton. Call in test teardown to prevent state
 * leaking between test files. Do NOT call in production code.
 */
export function _resetToolCache(): void {
  _defaultCache = undefined;
}

/**
 * Standard test-infrastructure alias consumed by setup-singletons.ts global
 * beforeEach hook. Delegates to _resetToolCache so both call sites stay in sync.
 */
export function _resetSingletonsForTest(): void {
  _resetToolCache();
}

/**
 * Perform a cache lookup against the process-level default cache.
 */
export function cacheGet<T>(
  toolName: string,
  adapterType: string,
  args: Record<string, unknown>,
  cacheConfig: PluginToolCacheConfig,
): ToolCacheLookup<T> {
  const key = buildCacheKey(toolName, adapterType, args, cacheConfig);
  return getDefaultCache().get(key) as ToolCacheLookup<T>;
}

/**
 * Store a successful tool result in the process-level default cache.
 * Never call this for error results — caching errors would serve stale
 * failures to subsequent callers for the full TTL window.
 */
export function cacheSet<T>(
  toolName: string,
  adapterType: string,
  args: Record<string, unknown>,
  cacheConfig: PluginToolCacheConfig,
  value: T,
): void {
  const key = buildCacheKey(toolName, adapterType, args, cacheConfig);
  getDefaultCache().set(key, value, cacheConfig.ttlSeconds);
}

/**
 * Return a snapshot of hit/miss counters from the default cache.
 * Feeds the observability layer without exposing the cache internals.
 */
export function getCacheStats(): ToolCacheStats {
  return getDefaultCache().getStats();
}

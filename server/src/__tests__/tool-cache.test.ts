/**
 * Tests for the in-process tool result cache (first-party / framework helpers).
 *
 * Coverage targets:
 *  1. Cache miss on first call with unseen args
 *  2. Cache hit on repeated call with same args
 *  3. Cache miss when args differ
 *  4. TTL expiry causes a miss
 *  5. `keyFields` subset — only listed fields contribute to the key
 *  6. LRU eviction at capacity
 *  7. Tenant isolation — different companyIds never collide
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetToolCache,
  buildFrameworkCacheKey,
  createToolCache,
  type FrameworkToolCacheConfig,
  frameworkCacheGet,
  frameworkCacheSet,
} from "../services/tool-cache.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOOL = "team-directory";
const COMPANY_A = "00000000-0000-0000-0000-aaaaaaaaaaaa";
const COMPANY_B = "00000000-0000-0000-0000-bbbbbbbbbbbb";

function makeCfg(overrides: Partial<FrameworkToolCacheConfig> = {}): FrameworkToolCacheConfig {
  return { ttlSeconds: 60, ...overrides };
}

beforeEach(() => {
  _resetToolCache();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// buildFrameworkCacheKey
// ---------------------------------------------------------------------------

describe("buildFrameworkCacheKey", () => {
  it("returns a 64-char hex string (SHA-256)", () => {
    const key = buildFrameworkCacheKey(COMPANY_A, TOOL, { query: "hello" }, makeCfg());
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same inputs", () => {
    const cfg = makeCfg();
    const k1 = buildFrameworkCacheKey(COMPANY_A, TOOL, { query: "hello" }, cfg);
    const k2 = buildFrameworkCacheKey(COMPANY_A, TOOL, { query: "hello" }, cfg);
    expect(k1).toBe(k2);
  });

  it("differs when args differ", () => {
    const cfg = makeCfg();
    const k1 = buildFrameworkCacheKey(COMPANY_A, TOOL, { query: "hello" }, cfg);
    const k2 = buildFrameworkCacheKey(COMPANY_A, TOOL, { query: "world" }, cfg);
    expect(k1).not.toBe(k2);
  });

  it("differs when toolName differs", () => {
    const cfg = makeCfg();
    const k1 = buildFrameworkCacheKey(COMPANY_A, "tool-a", { q: 1 }, cfg);
    const k2 = buildFrameworkCacheKey(COMPANY_A, "tool-b", { q: 1 }, cfg);
    expect(k1).not.toBe(k2);
  });

  it("isolates by companyId — same args produce different keys per tenant", () => {
    const cfg = makeCfg();
    const k1 = buildFrameworkCacheKey(COMPANY_A, TOOL, { q: 1 }, cfg);
    const k2 = buildFrameworkCacheKey(COMPANY_B, TOOL, { q: 1 }, cfg);
    expect(k1).not.toBe(k2);
  });

  it("is stable across object key insertion order", () => {
    const cfg = makeCfg();
    const k1 = buildFrameworkCacheKey(COMPANY_A, TOOL, { a: 1, b: 2 }, cfg);
    const k2 = buildFrameworkCacheKey(COMPANY_A, TOOL, { b: 2, a: 1 }, cfg);
    expect(k1).toBe(k2);
  });

  describe("keyFields subset", () => {
    it("ignores args not listed in keyFields", () => {
      const cfg = makeCfg({ keyFields: ["query"] });
      const k1 = buildFrameworkCacheKey(COMPANY_A, TOOL, { query: "hello", requestId: "req-1" }, cfg);
      const k2 = buildFrameworkCacheKey(COMPANY_A, TOOL, { query: "hello", requestId: "req-2" }, cfg);
      expect(k1).toBe(k2);
    });

    it("still differs when a listed keyField differs", () => {
      const cfg = makeCfg({ keyFields: ["query"] });
      const k1 = buildFrameworkCacheKey(COMPANY_A, TOOL, { query: "hello", requestId: "req-1" }, cfg);
      const k2 = buildFrameworkCacheKey(COMPANY_A, TOOL, { query: "world", requestId: "req-1" }, cfg);
      expect(k1).not.toBe(k2);
    });

    it("falls back to all args when keyFields is empty array", () => {
      const cfgAll = makeCfg();
      const cfgKeyed = makeCfg({ keyFields: [] });
      const kAll1 = buildFrameworkCacheKey(COMPANY_A, TOOL, { query: "hello", requestId: "req-1" }, cfgAll);
      const kAll2 = buildFrameworkCacheKey(COMPANY_A, TOOL, { query: "hello", requestId: "req-2" }, cfgAll);
      // No keyFields defaults to "all args contribute" — so different requestId yields different keys.
      expect(kAll1).not.toBe(kAll2);

      // Empty array behaves the same as omitted (all args contribute).
      const kKeyed1 = buildFrameworkCacheKey(COMPANY_A, TOOL, { query: "hello", requestId: "req-1" }, cfgKeyed);
      const kKeyed2 = buildFrameworkCacheKey(COMPANY_A, TOOL, { query: "hello", requestId: "req-2" }, cfgKeyed);
      expect(kKeyed1).not.toBe(kKeyed2);
    });
  });
});

// ---------------------------------------------------------------------------
// LRU cache primitive (createToolCache)
// ---------------------------------------------------------------------------

describe("createToolCache", () => {
  it("misses on a key that was never set", () => {
    const cache = createToolCache<string>(10);
    expect(cache.get("missing")).toEqual({ hit: false });
  });

  it("hits on a key that was just set", () => {
    const cache = createToolCache<string>(10);
    cache.set("k1", "value1", 60);
    expect(cache.get("k1")).toEqual({ hit: true, value: "value1" });
  });

  it("returns a miss after TTL expires", () => {
    vi.useFakeTimers();
    const cache = createToolCache<string>(10);
    cache.set("k1", "value1", 1);
    expect(cache.get("k1")).toEqual({ hit: true, value: "value1" });
    vi.advanceTimersByTime(1500);
    expect(cache.get("k1")).toEqual({ hit: false });
  });

  it("evicts the least-recently-used entry when at capacity", () => {
    const cache = createToolCache<string>(2);
    cache.set("a", "A", 60);
    cache.set("b", "B", 60);
    // Touching `a` makes `b` the LRU.
    cache.get("a");
    cache.set("c", "C", 60);
    expect(cache.get("b")).toEqual({ hit: false });
    expect(cache.get("a")).toEqual({ hit: true, value: "A" });
    expect(cache.get("c")).toEqual({ hit: true, value: "C" });
  });

  it("tracks hit/miss counters", () => {
    const cache = createToolCache<string>(10);
    cache.get("missing");
    cache.set("k", "v", 60);
    cache.get("k");
    cache.get("k");
    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.size).toBe(1);
  });

  it("clears all entries and resets counters", () => {
    const cache = createToolCache<string>(10);
    cache.set("k1", "v1", 60);
    cache.set("k2", "v2", 60);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.getStats()).toEqual({ hits: 0, misses: 0, size: 0 });
  });
});

// ---------------------------------------------------------------------------
// frameworkCacheGet / frameworkCacheSet (default singleton)
// ---------------------------------------------------------------------------

describe("frameworkCacheGet / frameworkCacheSet", () => {
  it("misses on first lookup", () => {
    const cfg = makeCfg();
    const result = frameworkCacheGet<string>(COMPANY_A, TOOL, { query: "hello" }, cfg);
    expect(result).toEqual({ hit: false });
  });

  it("hits after a corresponding set", () => {
    const cfg = makeCfg();
    frameworkCacheSet(COMPANY_A, TOOL, { query: "hello" }, cfg, "world");
    expect(frameworkCacheGet<string>(COMPANY_A, TOOL, { query: "hello" }, cfg)).toEqual({
      hit: true,
      value: "world",
    });
  });

  it("misses when args differ", () => {
    const cfg = makeCfg();
    frameworkCacheSet(COMPANY_A, TOOL, { query: "hello" }, cfg, "world");
    expect(frameworkCacheGet<string>(COMPANY_A, TOOL, { query: "different" }, cfg)).toEqual({
      hit: false,
    });
  });

  it("isolates entries between companies", () => {
    const cfg = makeCfg();
    frameworkCacheSet(COMPANY_A, TOOL, { query: "x" }, cfg, "for-A");
    expect(frameworkCacheGet<string>(COMPANY_B, TOOL, { query: "x" }, cfg)).toEqual({ hit: false });
    expect(frameworkCacheGet<string>(COMPANY_A, TOOL, { query: "x" }, cfg)).toEqual({
      hit: true,
      value: "for-A",
    });
  });

  it("misses after TTL expiry", () => {
    vi.useFakeTimers();
    const cfg = makeCfg({ ttlSeconds: 1 });
    frameworkCacheSet(COMPANY_A, TOOL, { query: "hello" }, cfg, "world");
    vi.advanceTimersByTime(1500);
    expect(frameworkCacheGet<string>(COMPANY_A, TOOL, { query: "hello" }, cfg)).toEqual({
      hit: false,
    });
  });
});

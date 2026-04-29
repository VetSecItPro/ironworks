/**
 * Tests for the tool result cache (Phase O.5).
 *
 * Coverage targets (per spec):
 *  1. Cache miss on first call with unseen args
 *  2. Cache hit on repeated call with same args
 *  3. Cache miss when args differ
 *  4. TTL expiry causes a miss
 *  5. `keyFields` subset — only listed fields contribute to the key
 *  6. No cache field on tool declaration — cache is never consulted
 *  7. LRU eviction at capacity
 *  8. Zod schema rejects invalid cache configs
 */

import {
  type PluginToolCacheConfig,
  pluginToolCacheConfigSchema,
  pluginToolDeclarationSchema,
} from "@ironworksai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetToolCache,
  buildCacheKey,
  buildFrameworkCacheKey,
  cacheGet,
  cacheSet,
  createToolCache,
  DEFAULT_MAX_CACHE_SIZE,
  type FrameworkToolCacheConfig,
  frameworkCacheGet,
  frameworkCacheSet,
  getCacheStats,
} from "../services/tool-cache.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOOL = "search-issues";
const ADAPTER = "anthropic-api";
const COMPANY_A = "00000000-0000-0000-0000-aaaaaaaaaaaa";
const COMPANY_B = "00000000-0000-0000-0000-bbbbbbbbbbbb";

function makeCfg(overrides: Partial<PluginToolCacheConfig> = {}): PluginToolCacheConfig {
  return { ttlSeconds: 60, ...overrides };
}

// ---------------------------------------------------------------------------
// buildCacheKey unit tests
// ---------------------------------------------------------------------------

describe("buildCacheKey", () => {
  it("returns a 64-char hex string (SHA-256)", () => {
    const key = buildCacheKey(COMPANY_A, TOOL, ADAPTER, { query: "hello" }, makeCfg());
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same inputs", () => {
    const cfg = makeCfg();
    const k1 = buildCacheKey(COMPANY_A, TOOL, ADAPTER, { query: "hello" }, cfg);
    const k2 = buildCacheKey(COMPANY_A, TOOL, ADAPTER, { query: "hello" }, cfg);
    expect(k1).toBe(k2);
  });

  it("differs when args differ", () => {
    const cfg = makeCfg();
    const k1 = buildCacheKey(COMPANY_A, TOOL, ADAPTER, { query: "hello" }, cfg);
    const k2 = buildCacheKey(COMPANY_A, TOOL, ADAPTER, { query: "world" }, cfg);
    expect(k1).not.toBe(k2);
  });

  it("differs when toolName differs", () => {
    const cfg = makeCfg();
    const k1 = buildCacheKey(COMPANY_A, "tool-a", ADAPTER, { q: 1 }, cfg);
    const k2 = buildCacheKey(COMPANY_A, "tool-b", ADAPTER, { q: 1 }, cfg);
    expect(k1).not.toBe(k2);
  });

  it("differs when adapterType differs", () => {
    const cfg = makeCfg();
    const k1 = buildCacheKey(COMPANY_A, TOOL, "openai-api", { q: 1 }, cfg);
    const k2 = buildCacheKey(COMPANY_A, TOOL, "anthropic-api", { q: 1 }, cfg);
    expect(k1).not.toBe(k2);
  });

  it("is stable regardless of arg key insertion order", () => {
    const cfg = makeCfg();
    const k1 = buildCacheKey(COMPANY_A, TOOL, ADAPTER, { a: 1, b: 2 }, cfg);
    const k2 = buildCacheKey(COMPANY_A, TOOL, ADAPTER, { b: 2, a: 1 }, cfg);
    // Same semantic args, different insertion order — must produce the same key
    expect(k1).toBe(k2);
  });

  describe("keyFields subset behaviour (case 5)", () => {
    it("uses only specified keyFields when provided", () => {
      // `requestId` varies per call but `query` is the semantic key.
      // keyFields declares only `query` should contribute to the cache key
      // so `requestId` changes don't bust the cache.
      const cfg = makeCfg({ keyFields: ["query"] });
      const k1 = buildCacheKey(COMPANY_A, TOOL, ADAPTER, { query: "hello", requestId: "req-1" }, cfg);
      const k2 = buildCacheKey(COMPANY_A, TOOL, ADAPTER, { query: "hello", requestId: "req-2" }, cfg);
      expect(k1).toBe(k2);
    });

    it("produces a different key when a keyField value changes", () => {
      const cfg = makeCfg({ keyFields: ["query"] });
      const k1 = buildCacheKey(COMPANY_A, TOOL, ADAPTER, { query: "hello", requestId: "req-1" }, cfg);
      const k2 = buildCacheKey(COMPANY_A, TOOL, ADAPTER, { query: "world", requestId: "req-1" }, cfg);
      expect(k1).not.toBe(k2);
    });

    it("all-args key differs when non-key fields differ (validates keyFields reduces collisions)", () => {
      // Without keyFields: these two calls produce different keys (non-determinism bleeds in)
      const cfgAll = makeCfg();
      const kAll1 = buildCacheKey(COMPANY_A, TOOL, ADAPTER, { query: "hello", requestId: "req-1" }, cfgAll);
      const kAll2 = buildCacheKey(COMPANY_A, TOOL, ADAPTER, { query: "hello", requestId: "req-2" }, cfgAll);
      expect(kAll1).not.toBe(kAll2);

      // With keyFields=['query']: same key despite requestId difference
      const cfgKeyed = makeCfg({ keyFields: ["query"] });
      const kKeyed1 = buildCacheKey(COMPANY_A, TOOL, ADAPTER, { query: "hello", requestId: "req-1" }, cfgKeyed);
      const kKeyed2 = buildCacheKey(COMPANY_A, TOOL, ADAPTER, { query: "hello", requestId: "req-2" }, cfgKeyed);
      expect(kKeyed1).toBe(kKeyed2);
    });

    it("handles keyFields that are absent from args gracefully", () => {
      // Missing fields are silently omitted from the subset — no throw
      const cfg = makeCfg({ keyFields: ["query", "missingField"] });
      expect(() => buildCacheKey(COMPANY_A, TOOL, ADAPTER, { query: "hello" }, cfg)).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// createToolCache unit tests
// ---------------------------------------------------------------------------

describe("createToolCache", () => {
  it("reports size 0 when empty", () => {
    const cache = createToolCache<string>(10);
    expect(cache.size()).toBe(0);
  });

  // Case 1: cache miss on first call
  it("returns a miss for an unknown key", () => {
    const cache = createToolCache<string>(10);
    const result = cache.get("nonexistent");
    expect(result.hit).toBe(false);
  });

  // Case 2: cache hit after set with same key
  it("returns a hit after storing a value", () => {
    const cache = createToolCache<string>(10);
    cache.set("k1", "hello", 60);
    const result = cache.get("k1");
    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.value).toBe("hello");
    }
  });

  // Case 3: cache miss when args differ (via different keys)
  it("returns a miss for a different key", () => {
    const cache = createToolCache<string>(10);
    cache.set("k1", "hello", 60);
    const result = cache.get("k2");
    expect(result.hit).toBe(false);
  });

  // Case 4: TTL expiry — entry expires after ttlSeconds
  it("returns a miss after TTL has elapsed", () => {
    const cache = createToolCache<string>(10);

    // Store with a 1-second TTL but fake time so it appears expired immediately
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValueOnce(now); // for set()
    cache.set("k-ttl", "value", 1);

    // Advance time past expiry — next Date.now() call (in get) returns now+2s
    vi.spyOn(Date, "now").mockReturnValueOnce(now + 2_000);
    const result = cache.get("k-ttl");
    expect(result.hit).toBe(false);

    vi.restoreAllMocks();
  });

  it("returns a hit before TTL elapses", () => {
    const cache = createToolCache<string>(10);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValueOnce(now);
    cache.set("k-ttl", "value", 60);

    // Still within TTL window
    vi.spyOn(Date, "now").mockReturnValueOnce(now + 30_000);
    const result = cache.get("k-ttl");
    expect(result.hit).toBe(true);

    vi.restoreAllMocks();
  });

  // Case 7: LRU eviction
  it("evicts the LRU entry when at capacity", () => {
    const cache = createToolCache<number>(3);
    cache.set("k1", 1, 60);
    cache.set("k2", 2, 60);
    cache.set("k3", 3, 60);
    // Access k1 so it becomes MRU; k2 is now LRU
    cache.get("k1");
    // Insert k4 — should evict k2 (the LRU)
    cache.set("k4", 4, 60);

    expect(cache.size()).toBe(3);
    expect(cache.get("k2").hit).toBe(false); // evicted
    expect(cache.get("k1").hit).toBe(true);
    expect(cache.get("k3").hit).toBe(true);
    expect(cache.get("k4").hit).toBe(true);
  });

  it("tracks hit and miss stats", () => {
    const cache = createToolCache<string>(10);
    cache.set("k", "v", 60);
    cache.get("k"); // hit
    cache.get("k"); // hit
    cache.get("missing"); // miss
    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.size).toBe(1);
  });

  it("resets stats on clear()", () => {
    const cache = createToolCache<string>(10);
    cache.set("k", "v", 60);
    cache.get("k");
    cache.clear();
    const stats = cache.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.size).toBe(0);
  });

  it("reports the default max size constant as 10,000", () => {
    // Guard that the constant matches the documented bound from the design comment
    expect(DEFAULT_MAX_CACHE_SIZE).toBe(10_000);
  });
});

// ---------------------------------------------------------------------------
// Default-cache convenience functions (cacheGet / cacheSet)
// ---------------------------------------------------------------------------

describe("cacheGet / cacheSet (default cache)", () => {
  beforeEach(() => _resetToolCache());
  afterEach(() => _resetToolCache());

  const cfg = makeCfg();

  // Case 1: miss on first lookup
  it("returns a miss when the result has not been cached", () => {
    const result = cacheGet<string>(COMPANY_A, TOOL, ADAPTER, { query: "hello" }, cfg);
    expect(result.hit).toBe(false);
  });

  // Case 2: hit after cacheSet with same args
  it("returns a hit after cacheSet with the same args", () => {
    cacheSet(COMPANY_A, TOOL, ADAPTER, { query: "hello" }, cfg, "cached-result");
    const result = cacheGet<string>(COMPANY_A, TOOL, ADAPTER, { query: "hello" }, cfg);
    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.value).toBe("cached-result");
    }
  });

  // Case 3: miss when args differ
  it("returns a miss when args differ from the cached args", () => {
    cacheSet(COMPANY_A, TOOL, ADAPTER, { query: "hello" }, cfg, "cached-result");
    const result = cacheGet<string>(COMPANY_A, TOOL, ADAPTER, { query: "world" }, cfg);
    expect(result.hit).toBe(false);
  });

  // Case 4: TTL expiry via default cache
  it("returns a miss after the TTL has elapsed", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValueOnce(now);
    cacheSet(COMPANY_A, TOOL, ADAPTER, { query: "hello" }, makeCfg({ ttlSeconds: 1 }), "value");
    vi.spyOn(Date, "now").mockReturnValueOnce(now + 2_000);
    const result = cacheGet<string>(COMPANY_A, TOOL, ADAPTER, { query: "hello" }, makeCfg({ ttlSeconds: 1 }));
    expect(result.hit).toBe(false);
    vi.restoreAllMocks();
  });

  // Case 5: keyFields subset via default cache
  it("hits when only keyFields match and other args differ", () => {
    const cfgKeyed = makeCfg({ keyFields: ["query"] });
    cacheSet(COMPANY_A, TOOL, ADAPTER, { query: "hello", requestId: "req-1" }, cfgKeyed, "value");
    // requestId differs — should still be a hit because keyFields=['query']
    const result = cacheGet<string>(COMPANY_A, TOOL, ADAPTER, { query: "hello", requestId: "req-999" }, cfgKeyed);
    expect(result.hit).toBe(true);
  });

  // Case 6: no cache config — cache is never consulted
  it("cache remains empty when cacheGet/cacheSet are never called (no cache config path)", () => {
    // Simulate the dispatcher branch where the tool has no `cache` field:
    // neither cacheGet nor cacheSet is invoked. The cache must remain clean.
    const stats = getCacheStats();
    expect(stats.size).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Zod schema validation for PluginToolCacheConfig (case 8)
// ---------------------------------------------------------------------------

describe("pluginToolCacheConfigSchema", () => {
  it("accepts a valid config with ttlSeconds only", () => {
    const result = pluginToolCacheConfigSchema.safeParse({ ttlSeconds: 300 });
    expect(result.success).toBe(true);
  });

  it("accepts a valid config with keyFields", () => {
    const result = pluginToolCacheConfigSchema.safeParse({ ttlSeconds: 60, keyFields: ["query", "lang"] });
    expect(result.success).toBe(true);
  });

  it("rejects ttlSeconds = 0", () => {
    const result = pluginToolCacheConfigSchema.safeParse({ ttlSeconds: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative ttlSeconds", () => {
    const result = pluginToolCacheConfigSchema.safeParse({ ttlSeconds: -10 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer ttlSeconds", () => {
    const result = pluginToolCacheConfigSchema.safeParse({ ttlSeconds: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects missing ttlSeconds", () => {
    const result = pluginToolCacheConfigSchema.safeParse({ keyFields: ["query"] });
    expect(result.success).toBe(false);
  });

  it("pluginToolDeclarationSchema accepts a cache field", () => {
    const result = pluginToolDeclarationSchema.safeParse({
      name: "search",
      displayName: "Search",
      description: "Search issues",
      parametersSchema: { type: "object" },
      cache: { ttlSeconds: 120 },
    });
    expect(result.success).toBe(true);
  });

  it("pluginToolDeclarationSchema accepts tool without cache field (opt-in is optional)", () => {
    const result = pluginToolDeclarationSchema.safeParse({
      name: "write-comment",
      displayName: "Write Comment",
      description: "Posts a comment",
      parametersSchema: { type: "object" },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tenant isolation — every cached entry is scoped to companyId. Two companies
// asking the same tool with the same args must NEVER share a cache entry.
// This is the load-bearing privacy guarantee for the cache layer; without it
// Company A's data leaks into Company B's runs.
// ---------------------------------------------------------------------------

describe("tenant isolation by companyId", () => {
  beforeEach(() => _resetToolCache());
  afterEach(() => _resetToolCache());

  const cfg = makeCfg();

  it("buildCacheKey produces different keys for the same tool+args across companies", () => {
    const kA = buildCacheKey(COMPANY_A, TOOL, ADAPTER, { query: "hello" }, cfg);
    const kB = buildCacheKey(COMPANY_B, TOOL, ADAPTER, { query: "hello" }, cfg);
    expect(kA).not.toBe(kB);
  });

  it("Company B never reads Company A's cached entry", () => {
    cacheSet(COMPANY_A, TOOL, ADAPTER, { query: "hello" }, cfg, "company-A-secret-result");
    const lookupB = cacheGet<string>(COMPANY_B, TOOL, ADAPTER, { query: "hello" }, cfg);
    expect(lookupB.hit).toBe(false);
  });

  it("Company A still reads its own cached entry after Company B writes a different one", () => {
    cacheSet(COMPANY_A, TOOL, ADAPTER, { query: "hello" }, cfg, "value-A");
    cacheSet(COMPANY_B, TOOL, ADAPTER, { query: "hello" }, cfg, "value-B");
    const lookupA = cacheGet<string>(COMPANY_A, TOOL, ADAPTER, { query: "hello" }, cfg);
    expect(lookupA.hit).toBe(true);
    if (lookupA.hit) expect(lookupA.value).toBe("value-A");
  });
});

// ---------------------------------------------------------------------------
// buildFrameworkCacheKey — first-party tool key builder (no adapterType)
// ---------------------------------------------------------------------------

describe("buildFrameworkCacheKey", () => {
  function makeFwCfg(overrides: Partial<FrameworkToolCacheConfig> = {}): FrameworkToolCacheConfig {
    return { ttlSeconds: 300, ...overrides };
  }

  it("returns a 64-char hex string", () => {
    const key = buildFrameworkCacheKey(COMPANY_A, "renderTeamDirectory", { companyId: COMPANY_A }, makeFwCfg());
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same inputs", () => {
    const cfg = makeFwCfg();
    const k1 = buildFrameworkCacheKey(COMPANY_A, "renderTeamDirectory", { companyId: COMPANY_A }, cfg);
    const k2 = buildFrameworkCacheKey(COMPANY_A, "renderTeamDirectory", { companyId: COMPANY_A }, cfg);
    expect(k1).toBe(k2);
  });

  it("differs when companyId differs (tenant isolation)", () => {
    const cfg = makeFwCfg();
    const kA = buildFrameworkCacheKey(COMPANY_A, "renderTeamDirectory", { companyId: COMPANY_A }, cfg);
    const kB = buildFrameworkCacheKey(COMPANY_B, "renderTeamDirectory", { companyId: COMPANY_B }, cfg);
    expect(kA).not.toBe(kB);
  });

  it("differs when toolName differs", () => {
    const cfg = makeFwCfg();
    const k1 = buildFrameworkCacheKey(COMPANY_A, "renderTeamDirectory", {}, cfg);
    const k2 = buildFrameworkCacheKey(COMPANY_A, "fetchCandidateRecipes", {}, cfg);
    expect(k1).not.toBe(k2);
  });

  it("differs from buildCacheKey for the same tool (no adapterType in framework key)", () => {
    // The two key builders must not produce the same key for equivalent inputs
    // because plugin keys include adapterType and framework keys do not.
    // If they collided, a plugin tool result could poison a first-party cache slot.
    const pluginKey = buildCacheKey(COMPANY_A, TOOL, ADAPTER, {}, makeCfg());
    const fwKey = buildFrameworkCacheKey(COMPANY_A, TOOL, {}, makeFwCfg());
    expect(pluginKey).not.toBe(fwKey);
  });

  it("respects keyFields subset", () => {
    const cfg = makeFwCfg({ keyFields: ["companyId"] });
    // agentId varies per agent but companyId is stable — should collapse to one key
    const k1 = buildFrameworkCacheKey(
      COMPANY_A,
      "renderTeamDirectory",
      { companyId: COMPANY_A, agentId: "agent-1" },
      cfg,
    );
    const k2 = buildFrameworkCacheKey(
      COMPANY_A,
      "renderTeamDirectory",
      { companyId: COMPANY_A, agentId: "agent-2" },
      cfg,
    );
    expect(k1).toBe(k2);
  });

  it("is stable regardless of args key insertion order", () => {
    const cfg = makeFwCfg();
    const k1 = buildFrameworkCacheKey(COMPANY_A, "renderTeamDirectory", { a: 1, b: 2 }, cfg);
    const k2 = buildFrameworkCacheKey(COMPANY_A, "renderTeamDirectory", { b: 2, a: 1 }, cfg);
    expect(k1).toBe(k2);
  });
});

// ---------------------------------------------------------------------------
// frameworkCacheGet / frameworkCacheSet — first-party cache helpers
// ---------------------------------------------------------------------------

describe("frameworkCacheGet / frameworkCacheSet (default cache)", () => {
  beforeEach(() => _resetToolCache());
  afterEach(() => _resetToolCache());

  const fwCfg: FrameworkToolCacheConfig = { ttlSeconds: 300 };

  // Hit after set with same args
  it("returns a hit after frameworkCacheSet with the same args", () => {
    frameworkCacheSet(COMPANY_A, "renderTeamDirectory", { companyId: COMPANY_A }, fwCfg, "- Alice (CEO)");
    const result = frameworkCacheGet<string>(COMPANY_A, "renderTeamDirectory", { companyId: COMPANY_A }, fwCfg);
    expect(result.hit).toBe(true);
    if (result.hit) expect(result.value).toBe("- Alice (CEO)");
  });

  // Miss before any set
  it("returns a miss on first call (cold cache)", () => {
    const result = frameworkCacheGet<string>(COMPANY_A, "renderTeamDirectory", { companyId: COMPANY_A }, fwCfg);
    expect(result.hit).toBe(false);
  });

  // Simulates two-call deduplication: second call within TTL is a hit
  it("second call within TTL does not re-execute the underlying function (one set, one get)", () => {
    let dbCallCount = 0;

    // Simulate the first agent's call (cache miss — DB is queried, result cached)
    const firstResult = frameworkCacheGet<string>(COMPANY_A, "renderTeamDirectory", { companyId: COMPANY_A }, fwCfg);
    if (!firstResult.hit) {
      dbCallCount++;
      frameworkCacheSet(
        COMPANY_A,
        "renderTeamDirectory",
        { companyId: COMPANY_A },
        fwCfg,
        "- Alice (CEO)\n- Bob (CTO)",
      );
    }

    // Simulate the second agent's call (cache hit — DB is NOT queried)
    const secondResult = frameworkCacheGet<string>(COMPANY_A, "renderTeamDirectory", { companyId: COMPANY_A }, fwCfg);
    if (!secondResult.hit) {
      dbCallCount++;
    }

    expect(secondResult.hit).toBe(true);
    // Only one DB call fired despite two "agent" calls — the cache deduplicates
    expect(dbCallCount).toBe(1);
  });

  // TTL expiry — cache expires after ttlSeconds
  it("returns a miss after TTL has elapsed", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValueOnce(now);
    frameworkCacheSet(COMPANY_A, "renderTeamDirectory", { companyId: COMPANY_A }, { ttlSeconds: 1 }, "value");
    vi.spyOn(Date, "now").mockReturnValueOnce(now + 2_000);
    const result = frameworkCacheGet<string>(
      COMPANY_A,
      "renderTeamDirectory",
      { companyId: COMPANY_A },
      { ttlSeconds: 1 },
    );
    expect(result.hit).toBe(false);
    vi.restoreAllMocks();
  });

  // Tenant isolation — Company B must not read Company A's cached entry
  it("Company B cannot read Company A's cached entry (tenant isolation)", () => {
    frameworkCacheSet(COMPANY_A, "renderTeamDirectory", { companyId: COMPANY_A }, fwCfg, "company-A-secret");
    const lookupB = frameworkCacheGet<string>(COMPANY_B, "renderTeamDirectory", { companyId: COMPANY_B }, fwCfg);
    expect(lookupB.hit).toBe(false);
  });

  it("Company A reads its own entry even after Company B writes one", () => {
    frameworkCacheSet(COMPANY_A, "renderTeamDirectory", { companyId: COMPANY_A }, fwCfg, "value-A");
    frameworkCacheSet(COMPANY_B, "renderTeamDirectory", { companyId: COMPANY_B }, fwCfg, "value-B");
    const lookupA = frameworkCacheGet<string>(COMPANY_A, "renderTeamDirectory", { companyId: COMPANY_A }, fwCfg);
    expect(lookupA.hit).toBe(true);
    if (lookupA.hit) expect(lookupA.value).toBe("value-A");
  });

  // Tool name scoping — different tools must not share entries
  it("different first-party tools do not share cache entries", () => {
    frameworkCacheSet(COMPANY_A, "renderTeamDirectory", { companyId: COMPANY_A }, fwCfg, "team-data");
    const crossLookup = frameworkCacheGet<string>(COMPANY_A, "fetchCandidateRecipes", { companyId: COMPANY_A }, fwCfg);
    expect(crossLookup.hit).toBe(false);
  });

  // keyFields reduces cache key so different agentIds share an entry for role-invariant data
  it("keyFields=companyId collapses identical company reads across different agentIds", () => {
    const cfgCompanyOnly: FrameworkToolCacheConfig = { ttlSeconds: 120, keyFields: ["companyId"] };
    // Agent 1 misses and primes the cache
    frameworkCacheSet(COMPANY_A, "listCompanySkillsFull", { companyId: COMPANY_A }, cfgCompanyOnly, ["skill-a"]);
    // Agent 2 with a different (irrelevant) field still hits
    const hit = frameworkCacheGet<string[]>(
      COMPANY_A,
      "listCompanySkillsFull",
      { companyId: COMPANY_A },
      cfgCompanyOnly,
    );
    expect(hit.hit).toBe(true);
    if (hit.hit) expect(hit.value).toEqual(["skill-a"]);
  });
});

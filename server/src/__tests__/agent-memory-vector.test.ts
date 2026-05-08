/**
 * Service-level tests for tier-3 vector retrieval in `agent-memory.ts`.
 *
 * Strategy: mock the Drizzle DB at the chainable-builder level (matches the
 * existing agent-memory.test.ts pattern). The provider is dependency-injected
 * directly into `findRelevantMemories` / `getContextualMemories`, so we don't
 * need to mock the factory module — the production env-resolved provider is
 * never invoked when the caller passes one explicitly.
 *
 * What's covered:
 *   1. Vector path returns ranked rows when provider configured + embeddings exist
 *   2. NoOp provider → falls back to FTS (vector path skipped entirely)
 *   3. Zero embeddings → falls back to FTS (no provider call made)
 *   4. Provider.embed() throws → falls back to FTS
 *   5. getContextualMemories dedupes a row that matches both tier-2 and tier-3
 */

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmbeddingProvider } from "../services/embeddings/provider.js";

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Stub the factory so production callers (no DI) don't accidentally hit
// real env. Tests below pass providers explicitly; this is just a safety net.
vi.mock("../services/embeddings/factory.js", () => ({
  getMemoryProvider: () => new NoOpProviderStub(),
}));

vi.mock("../services/embeddings/queue.js", () => ({
  enqueueEmbeddingJob: vi.fn().mockResolvedValue(undefined),
}));

class NoOpProviderStub implements EmbeddingProvider {
  readonly name = "noop";
  readonly model = "noop";
  readonly dims = 0;
  async embed(): Promise<number[]> {
    throw new Error("noop");
  }
  async embedBatch(): Promise<number[][]> {
    throw new Error("noop");
  }
}

class FixedProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly model = "text-embedding-3-small";
  readonly dims = 1536;
  embedCalls = 0;
  async embed(_text: string): Promise<number[]> {
    this.embedCalls += 1;
    return Array.from({ length: 1536 }, (_, i) => (i % 100) / 100);
  }
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}

class ThrowingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly model = "text-embedding-3-small";
  readonly dims = 1536;
  async embed(): Promise<number[]> {
    throw new Error("upstream 500");
  }
  async embedBatch(): Promise<number[][]> {
    throw new Error("upstream 500");
  }
}

const AGENT_ID = randomUUID();
const COMPANY_ID = randomUUID();

function row(id: string, content: string) {
  return {
    id,
    agentId: AGENT_ID,
    companyId: COMPANY_ID,
    memoryType: "semantic",
    category: "test",
    content,
    sourceIssueId: null,
    sourceProjectId: null,
    confidence: 80,
    accessCount: 0,
    lastAccessedAt: new Date(),
    expiresAt: null,
    archivedAt: null,
    createdAt: new Date(),
  };
}

/**
 * Build a Drizzle-shaped DB mock whose behavior is keyed off which step in
 * the chain is invoked. We classify each `select()` invocation by the shape
 * passed in, since `findRelevantMemories` runs three different SELECTs:
 *   - `select(sql\`SELECT 1 FROM pg_extension...\`)` (via db.execute)
 *   - `select({ count })` (the embedding-count probe)
 *   - `select({ id, ..., distance })` (the cosine query)
 *   - `select({ id, ..., rank })` (the FTS query)
 *   - `select(memoryColumns)` (the recent-fallback query)
 *
 * We tag the chain by inspecting the first-arg keys.
 */
interface MockState {
  pgvectorAvailable: boolean;
  embeddingCount: number;
  vectorResults: ReturnType<typeof row>[];
  ftsResults: ReturnType<typeof row>[];
  /** If set, vector SELECT throws (simulates pgvector op error). */
  vectorThrows?: boolean;
}

function makeDb(state: MockState) {
  function chainFor(result: unknown) {
    const c: Record<string, unknown> = {};
    c.from = vi.fn().mockReturnValue(c);
    c.where = vi.fn().mockReturnValue(c);
    c.orderBy = vi.fn().mockReturnValue(c);
    c.limit = vi.fn().mockImplementation(() => Promise.resolve(result));
    c.groupBy = vi.fn().mockReturnValue(c);
    // biome-ignore lint/suspicious/noThenProperty: drizzle thenable contract
    // biome-ignore lint/suspicious/noExplicitAny: pass-through for promise resolution
    c.then = vi.fn().mockImplementation((resolve: any) => resolve(result));
    return c;
  }

  return {
    execute: vi.fn().mockImplementation(() => {
      // Used by isPgvectorAvailable
      return Promise.resolve(state.pgvectorAvailable ? [{ "?column?": 1 }] : []);
    }),
    select: vi.fn().mockImplementation((projection: unknown) => {
      // Decide which kind of query this is by inspecting the projection keys.
      if (projection && typeof projection === "object") {
        const keys = Object.keys(projection as Record<string, unknown>);
        if (keys.length === 1 && keys[0] === "count") {
          // embedding-count probe
          return chainFor([{ count: state.embeddingCount }]);
        }
        if (keys.includes("distance")) {
          if (state.vectorThrows) {
            const c = chainFor([]);
            c.limit = vi.fn().mockImplementation(() => Promise.reject(new Error("pgvector op failed")));
            return c;
          }
          return chainFor(state.vectorResults);
        }
        if (keys.includes("rank")) {
          return chainFor(state.ftsResults);
        }
      }
      // Fallback (e.g. memoryColumns recent path)
      return chainFor(state.ftsResults);
    }),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  };
}

describe("agent-memory tier-3 vector retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findRelevantMemories", () => {
    it("returns vector-ranked results when provider configured and embeddings exist", async () => {
      const { findRelevantMemories } = await import("../services/agent-memory.js");
      const provider = new FixedProvider();
      const vectorRows = [row("v1", "vector hit alpha"), row("v2", "vector hit beta")];
      const db = makeDb({
        pgvectorAvailable: true,
        embeddingCount: 7,
        vectorResults: vectorRows,
        ftsResults: [row("f1", "fts hit")],
      });

      // biome-ignore lint/suspicious/noExplicitAny: mock db type erasure
      const result = await findRelevantMemories(db as any, AGENT_ID, "deployment broke", 5, provider);

      expect(provider.embedCalls).toBe(1);
      expect(result.map((r) => r.id)).toEqual(["v1", "v2"]);
    });

    it("falls back to FTS when provider is NoOp", async () => {
      const { findRelevantMemories } = await import("../services/agent-memory.js");
      const provider = new NoOpProviderStub();
      const ftsRows = [row("f1", "fts hit")];
      const db = makeDb({
        pgvectorAvailable: true,
        embeddingCount: 7,
        vectorResults: [row("v1", "should not appear")],
        ftsResults: ftsRows,
      });

      // biome-ignore lint/suspicious/noExplicitAny: mock db type erasure
      const result = await findRelevantMemories(db as any, AGENT_ID, "deployment broke", 5, provider);
      expect(result.map((r) => r.id)).toEqual(["f1"]);
    });

    it("falls back to FTS when zero rows have embeddings", async () => {
      const { findRelevantMemories } = await import("../services/agent-memory.js");
      const provider = new FixedProvider();
      const ftsRows = [row("f1", "fts hit")];
      const db = makeDb({
        pgvectorAvailable: true,
        embeddingCount: 0,
        vectorResults: [row("v1", "should not appear")],
        ftsResults: ftsRows,
      });

      // biome-ignore lint/suspicious/noExplicitAny: mock db type erasure
      const result = await findRelevantMemories(db as any, AGENT_ID, "deployment broke", 5, provider);

      expect(provider.embedCalls).toBe(0); // shouldn't call embed when no rows have embeddings
      expect(result.map((r) => r.id)).toEqual(["f1"]);
    });

    it("falls back to FTS when query embedding generation throws", async () => {
      const { findRelevantMemories } = await import("../services/agent-memory.js");
      const provider = new ThrowingProvider();
      const ftsRows = [row("f1", "fts hit")];
      const db = makeDb({
        pgvectorAvailable: true,
        embeddingCount: 5,
        vectorResults: [row("v1", "should not appear")],
        ftsResults: ftsRows,
      });

      // biome-ignore lint/suspicious/noExplicitAny: mock db type erasure
      const result = await findRelevantMemories(db as any, AGENT_ID, "deployment broke", 5, provider);
      expect(result.map((r) => r.id)).toEqual(["f1"]);
    });
  });

  describe("getContextualMemories dedup", () => {
    it("deduplicates an entry returned by both tier-2 (FTS) and tier-3 (vector)", async () => {
      const { getContextualMemories } = await import("../services/agent-memory.js");
      const provider = new FixedProvider();
      const sharedRow = row("shared", "matched both tiers");
      const tier2Rows = [sharedRow, row("fts-only", "fts unique")];
      const tier3Rows = [sharedRow, row("vec-only", "vector unique")];

      // Build a stateful chain: tier-1 returns [], tier-2 returns FTS,
      // pgvector probe returns count > 0, tier-3 returns vector results.
      let ftsCallCount = 0;
      const db = {
        execute: vi.fn().mockImplementation(() => Promise.resolve([{ "?column?": 1 }])),
        select: vi.fn().mockImplementation((projection: unknown) => {
          const keys = projection && typeof projection === "object" ? Object.keys(projection as Record<string, unknown>) : [];
          const c: Record<string, unknown> = {};
          c.from = vi.fn().mockReturnValue(c);
          c.where = vi.fn().mockReturnValue(c);
          c.orderBy = vi.fn().mockReturnValue(c);
          c.groupBy = vi.fn().mockReturnValue(c);

          let result: unknown = [];
          if (keys.length === 1 && keys[0] === "count") {
            result = [{ count: 3 }];
          } else if (keys.includes("distance")) {
            result = tier3Rows;
          } else if (keys.includes("rank")) {
            ftsCallCount += 1;
            result = tier2Rows;
          } else if (keys.includes("memoryType") && !keys.includes("rank") && !keys.includes("distance")) {
            // Tier-1 working memory query (memoryColumns projection without rank/distance)
            result = [];
          }

          c.limit = vi.fn().mockImplementation(() => Promise.resolve(result));
          // biome-ignore lint/suspicious/noThenProperty: drizzle thenable
          // biome-ignore lint/suspicious/noExplicitAny: mock pass-through
          c.then = vi.fn().mockImplementation((resolve: any) => resolve(result));
          return c;
        }),
      };

      // biome-ignore lint/suspicious/noExplicitAny: mock db type erasure
      const result = await getContextualMemories(db as any, AGENT_ID, "deployment broke", 10, provider);

      // shared should appear exactly once; both unique entries present
      const ids = result.map((r) => r.id);
      expect(ids.filter((id) => id === "shared").length).toBe(1);
      expect(ids).toContain("fts-only");
      expect(ids).toContain("vec-only");
      expect(ftsCallCount).toBeGreaterThanOrEqual(1);
    });
  });
});

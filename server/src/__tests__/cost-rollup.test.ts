/**
 * Unit tests for the nightly cost rollup job.
 *
 * Tests inject a minimal DB stub rather than using vi.mock() singleton patterns.
 * Each test builds its own stub with controlled behaviour.
 *
 * Covers:
 *   - No-op when watermark is already at yesterday
 *   - Empty days: watermark still advances, no rows inserted
 *   - Data present: rows inserted, watermark advances
 *   - Idempotency: calling with up-to-date watermark is a no-op
 *   - First run (no watermark): 90-day backfill
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

function daysBefore(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── DB stub ───────────────────────────────────────────────────────────────────

interface StubOptions {
  watermarkDate?: string | null;
  aggRowCount?: number;
}

/**
 * Build a minimal Drizzle-like DB stub for the rollup tests.
 * Uses collaborator injection (passed to runCostRollup as `db`) rather than
 * module-level vi.mock() to keep tests independent.
 */
function buildStubDb({ watermarkDate = null, aggRowCount = 0 }: StubOptions = {}) {
  let selectCallIndex = 0;
  let insertCallCount = 0;

  // Produce a thenable chain for fluent query building
  function makeChain(resolveWith: unknown) {
    const chain: Record<string, unknown> = {};
    for (const m of [
      "from",
      "where",
      "leftJoin",
      "innerJoin",
      "groupBy",
      "orderBy",
      "limit",
      "set",
      "values",
      "onConflictDoUpdate",
      "returning",
    ]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    // biome-ignore lint/suspicious/noThenProperty: drizzle thenable contract for test stub
    chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => unknown) => resolve(resolveWith));
    return chain;
  }

  const db = {
    _insertCallCount: () => insertCallCount,

    select: vi.fn().mockImplementation(() => {
      const idx = selectCallIndex++;
      if (idx === 0) {
        // First select = watermark read from instance_settings
        return makeChain(
          watermarkDate !== null ? [{ general: { costRollupWatermark: watermarkDate }, singletonKey: "default" }] : [],
        );
      }
      // Subsequent selects = cost_events aggregate for a day
      const rows = Array.from({ length: aggRowCount }, (_, i) => ({
        companyId: `company-${i}`,
        agentId: `agent-${i}`,
        provider: "anthropic_api",
        callCount: 1,
        inputTokens: 100,
        outputTokens: 50,
        costUsdMicro: 10_000,
      }));
      return makeChain(rows);
    }),

    delete: vi.fn().mockImplementation(() => makeChain({ rowCount: 0 })),

    insert: vi.fn().mockImplementation(() => {
      insertCallCount++;
      const chain = makeChain([]);
      (chain.values as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      return chain;
    }),

    update: vi.fn().mockImplementation(() => makeChain([])),
  } as unknown as import("@ironworksai/db").Db;

  return db;
}

import { runCostRollup } from "../services/cost-rollup.js";

describe("runCostRollup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("when watermark equals yesterday (already up to date)", () => {
    it("returns 0 days processed without inserting any rows", async () => {
      const yesterday = daysBefore(1);
      const db = buildStubDb({ watermarkDate: yesterday });

      const result = await runCostRollup(db);

      expect(result.daysProcessed).toBe(0);
      expect(result.totalRowsInserted).toBe(0);
      expect(result.newWatermark).toBe(yesterday);
    });
  });

  describe("when watermark is null (first run ever)", () => {
    it("processes 90 days and advances watermark to yesterday", async () => {
      const db = buildStubDb({ watermarkDate: null, aggRowCount: 0 });

      const result = await runCostRollup(db);

      // 90-day initial backfill window (all empty days)
      expect(result.daysProcessed).toBe(90);
      expect(result.totalRowsInserted).toBe(0);
      expect(result.newWatermark).toBe(daysBefore(1));
    });
  });

  describe("empty day handling", () => {
    it("advances watermark even when no cost_events exist for the day", async () => {
      const twoDaysAgo = daysBefore(2);
      const db = buildStubDb({ watermarkDate: twoDaysAgo, aggRowCount: 0 });

      const result = await runCostRollup(db);

      expect(result.daysProcessed).toBe(1);
      expect(result.totalRowsInserted).toBe(0);
      expect(result.newWatermark).toBe(daysBefore(1));
    });
  });

  describe("with cost data present", () => {
    it("inserts rollup rows and reports them in totalRowsInserted", async () => {
      const twoDaysAgo = daysBefore(2);
      // 2 aggregate rows for the day
      const db = buildStubDb({ watermarkDate: twoDaysAgo, aggRowCount: 2 });

      const result = await runCostRollup(db);

      expect(result.daysProcessed).toBe(1);
      expect(result.totalRowsInserted).toBe(2);
      expect(result.newWatermark).toBe(daysBefore(1));
    });
  });

  describe("idempotency", () => {
    it("returns no-op result when called again with watermark at yesterday", async () => {
      const yesterday = daysBefore(1);
      const db = buildStubDb({ watermarkDate: yesterday });

      const result = await runCostRollup(db);

      // Idempotent: nothing more to process
      expect(result.daysProcessed).toBe(0);
      expect(result.totalRowsInserted).toBe(0);
      expect(result.newWatermark).toBe(yesterday);
    });
  });
});

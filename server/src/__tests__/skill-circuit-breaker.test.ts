/**
 * Tests for the skill circuit breaker — PR 6/6 of the skill loop.
 *
 * Coverage:
 *   1. detectRunawayRecipes returns [] when no invocations exist
 *   2. detectRunawayRecipes returns [] when activation rate <= 50%
 *   3. detectRunawayRecipes returns recipe ID when activation rate > 50%
 *   4. detectRunawayRecipes auto-pauses the runaway recipe
 *   5. checkCostOverhead returns shouldDisable=false when ratio < 15%
 *   6. checkCostOverhead returns shouldDisable=true when ratio > 15%
 *   7. isSkillLoopCostDisabled reflects denylist state after checkCostOverhead triggers
 */

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../middleware/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock the skill-recipe-service so pauseRecipe calls are captured
const mockPauseRecipe = vi.fn();
vi.mock("../services/skill-recipe-service.js", () => ({
  skillRecipeService: vi.fn(() => ({
    pauseRecipe: mockPauseRecipe,
  })),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { checkCostOverhead, detectRunawayRecipes, isSkillLoopCostDisabled } from "../services/skill-circuit-breaker.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const COMPANY_A = randomUUID();
const _COMPANY_B = randomUUID(); // used for cost circuit breaker isolation
const RECIPE_A = randomUUID();
const RECIPE_B = randomUUID();
const _AGENT_A = randomUUID();

/**
 * Minimal Db stub that handles only the queries the circuit breaker issues.
 * Uses chained method fakes matching Drizzle's fluent query builder API.
 */
function makeDb(opts: {
  heartbeatRunsCount?: number;
  invocations?: Array<{ recipeId: string; companyId: string; count: number }>;
  costRows?: Array<{ billingCode: string | null; totalCost: number }>;
}) {
  const runRows =
    opts.heartbeatRunsCount !== undefined ? [{ companyId: COMPANY_A, totalRuns: opts.heartbeatRunsCount }] : [];

  const invocationRows = (opts.invocations ?? []).map((inv) => ({
    recipeId: inv.recipeId,
    companyId: inv.companyId,
    invocations: inv.count,
  }));

  const costEventRows = (opts.costRows ?? []).map((r) => ({
    billingCode: r.billingCode,
    totalCost: r.totalCost,
  }));

  // biome-ignore lint/suspicious/noExplicitAny: test-only DB stub
  const makeChain = (rows: unknown[]): any => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only DB stub
    const chain: any = {
      from: () => chain,
      where: () => chain,
      groupBy: () => chain,
      // Drizzle resolves the query on .then() call or await — intentional thenable
      // biome-ignore lint/suspicious/noThenProperty: intentional Drizzle query mock
      then: (resolve: (v: unknown) => void) => resolve(rows),
    };
    return chain;
  };

  // biome-ignore lint/suspicious/noExplicitAny: test-only DB stub
  const db: any = {
    select: (fields?: unknown) => {
      // Distinguish which query is being built by inspecting the requested fields
      // The run-count query selects heartbeatRuns.companyId; cost query selects billingCode
      if (fields && "billingCode" in (fields as object)) {
        return makeChain(costEventRows);
      }
      if (fields && "totalRuns" in (fields as object)) {
        return makeChain(runRows);
      }
      if (fields && "invocations" in (fields as object)) {
        return makeChain(invocationRows);
      }
      // selectDistinct for getCompaniesWithActiveRecipes
      return makeChain([]);
    },
    selectDistinct: () => makeChain([]),
  };

  return db;
}

// ── Runaway detector tests ────────────────────────────────────────────────────

describe("detectRunawayRecipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPauseRecipe.mockResolvedValue({ id: RECIPE_A, pausedAt: new Date() });
  });

  it("returns [] when there are no invocations", async () => {
    const db = makeDb({ heartbeatRunsCount: 10, invocations: [] });
    const result = await detectRunawayRecipes(db, { companyId: COMPANY_A });
    expect(result).toHaveLength(0);
    expect(mockPauseRecipe).not.toHaveBeenCalled();
  });

  it("returns [] when activation rate is exactly at the threshold (50%)", async () => {
    // 5 invocations / 10 runs = 0.5 exactly — should NOT trigger (strictly > 0.5)
    const db = makeDb({
      heartbeatRunsCount: 10,
      invocations: [{ recipeId: RECIPE_A, companyId: COMPANY_A, count: 5 }],
    });
    const result = await detectRunawayRecipes(db, { companyId: COMPANY_A });
    expect(result).toHaveLength(0);
    expect(mockPauseRecipe).not.toHaveBeenCalled();
  });

  it("returns [] when activation rate is below threshold (40%)", async () => {
    const db = makeDb({
      heartbeatRunsCount: 10,
      invocations: [{ recipeId: RECIPE_A, companyId: COMPANY_A, count: 4 }],
    });
    const result = await detectRunawayRecipes(db, { companyId: COMPANY_A });
    expect(result).toHaveLength(0);
    expect(mockPauseRecipe).not.toHaveBeenCalled();
  });

  it("returns recipe ID and auto-pauses when activation rate exceeds 50%", async () => {
    // 7 invocations / 10 runs = 70% — runaway
    const db = makeDb({
      heartbeatRunsCount: 10,
      invocations: [{ recipeId: RECIPE_A, companyId: COMPANY_A, count: 7 }],
    });
    const result = await detectRunawayRecipes(db, { companyId: COMPANY_A });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(RECIPE_A);
    expect(mockPauseRecipe).toHaveBeenCalledWith(RECIPE_A, "system");
  });

  it("handles multiple companies and returns all runaway recipe IDs", async () => {
    // Two recipes, both runaway
    const db = makeDb({
      heartbeatRunsCount: 10,
      invocations: [
        { recipeId: RECIPE_A, companyId: COMPANY_A, count: 8 }, // 80%
        { recipeId: RECIPE_B, companyId: COMPANY_A, count: 9 }, // 90%
      ],
    });
    mockPauseRecipe.mockResolvedValue({ id: RECIPE_A, pausedAt: new Date() });

    const result = await detectRunawayRecipes(db, { companyId: COMPANY_A });
    expect(result).toHaveLength(2);
    expect(result).toContain(RECIPE_A);
    expect(result).toContain(RECIPE_B);
    expect(mockPauseRecipe).toHaveBeenCalledTimes(2);
  });

  it("skips the recipe when pauseRecipe throws, and returns remaining IDs", async () => {
    const db = makeDb({
      heartbeatRunsCount: 10,
      invocations: [
        { recipeId: RECIPE_A, companyId: COMPANY_A, count: 8 }, // runaway
        { recipeId: RECIPE_B, companyId: COMPANY_A, count: 7 }, // runaway
      ],
    });
    // First pause fails, second succeeds
    mockPauseRecipe
      .mockRejectedValueOnce(new Error("DB timeout"))
      .mockResolvedValueOnce({ id: RECIPE_B, pausedAt: new Date() });

    const result = await detectRunawayRecipes(db, { companyId: COMPANY_A });
    // Only RECIPE_B was successfully paused
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(RECIPE_B);
  });
});

// ── Cost overhead tests ───────────────────────────────────────────────────────

describe("checkCostOverhead", () => {
  // Cost denylist persists in module state between tests — use a fresh company
  // UUID for each describe block to avoid cross-test contamination.
  const COST_COMPANY = randomUUID();

  beforeEach(() => vi.clearAllMocks());

  it("returns shouldDisable=false when ratio is below threshold", async () => {
    // skill_loop = 10, agent_work = 200 → ratio = 0.05 (5%)
    const db = makeDb({
      costRows: [
        { billingCode: "skill_loop", totalCost: 10 },
        { billingCode: null, totalCost: 200 },
      ],
    });
    const result = await checkCostOverhead(db, COST_COMPANY);
    expect(result.shouldDisable).toBe(false);
    expect(result.ratio).toBeCloseTo(0.05);
    expect(result.skillLoopSpend).toBe(10);
    expect(result.agentWorkSpend).toBe(200);
  });

  it("returns shouldDisable=false when ratio is exactly at threshold (15%)", async () => {
    // 15% exactly ��� should NOT trigger (strictly > 0.15)
    const db = makeDb({
      costRows: [
        { billingCode: "skill_loop", totalCost: 15 },
        { billingCode: null, totalCost: 100 },
      ],
    });
    const result = await checkCostOverhead(db, COST_COMPANY);
    expect(result.shouldDisable).toBe(false);
  });

  it("returns shouldDisable=true when ratio exceeds threshold (>15%)", async () => {
    // skill_loop = 20, agent_work = 100 → ratio = 0.20 (20%)
    const freshCompany = randomUUID(); // fresh ID to avoid denylist from prior test
    const db = makeDb({
      costRows: [
        { billingCode: "skill_loop", totalCost: 20 },
        { billingCode: null, totalCost: 100 },
      ],
    });
    const result = await checkCostOverhead(db, freshCompany);
    expect(result.shouldDisable).toBe(true);
    expect(result.ratio).toBeCloseTo(0.2);
  });

  it("adds company to denylist when shouldDisable=true", async () => {
    const freshCompany = randomUUID();
    const db = makeDb({
      costRows: [
        { billingCode: "skill_loop", totalCost: 30 },
        { billingCode: "agent_work", totalCost: 100 },
      ],
    });
    await checkCostOverhead(db, freshCompany);
    expect(isSkillLoopCostDisabled(freshCompany)).toBe(true);
  });

  it("returns shouldDisable=false when agent_work spend is zero", async () => {
    // Zero denominator — can't compute a meaningful ratio, should not disable
    const freshCompany = randomUUID();
    const db = makeDb({
      costRows: [{ billingCode: "skill_loop", totalCost: 50 }],
    });
    const result = await checkCostOverhead(db, freshCompany);
    expect(result.shouldDisable).toBe(false);
    expect(result.ratio).toBe(0);
  });
});

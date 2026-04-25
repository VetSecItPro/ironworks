/**
 * Tests for the skill matching service (PR 4/6 of the skill loop).
 *
 * Coverage:
 *   1. Empty candidate list → returns [] without making an LLM call.
 *   2. LLM returns hallucinated recipe IDs → server-side filter removes them.
 *   3. Score threshold enforced: 0.6 dropped, 0.7 kept.
 *   4. Cap at 2 enforced even when more than 2 scores clear the threshold.
 *   5. Timeout (200 ms budget) → returns [] silently.
 *   6. formatSkillRecipesBlock renders the COMPANY PROCEDURES block correctly.
 *   7. injectSkillRecipes appends correctly to an existing agentInstructions field.
 *   8. injectSkillRecipes is a no-op when matched list is empty.
 */

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatSkillRecipesBlock, injectSkillRecipes } from "../services/agent-learning.js";
import { type MatchedRecipe, matchSkillsForRun } from "../services/skill-matching.js";

// ── Shared IDs ────────────────────────────────────────────────────────────────

const COMPANY_ID = "ec7708b1-11c8-4117-a2ff-02b4aebe9c76"; // Atlas Ops dogfood (skill loop on)
const AGENT_ID = randomUUID();
const ISSUE_ID = randomUUID();
const RECIPE_ID_A = randomUUID();
const RECIPE_ID_B = randomUUID();
const RECIPE_ID_C = randomUUID();

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../middleware/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockResolveProviderSecret = vi.hoisted(() => vi.fn());
vi.mock("../services/provider-secret-resolver.js", () => ({
  resolveProviderSecret: mockResolveProviderSecret,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal SkillRecipe row for test use. */
function makeRecipe(id: string, overrides: Partial<MatchedRecipe> = {}): MatchedRecipe {
  return {
    id,
    companyId: COMPANY_ID,
    sourceSkillId: null,
    proposedByAgentId: null,
    sourceIssueId: null,
    sourceRunId: null,
    title: `Recipe ${id.slice(0, 8)}`,
    triggerPattern: "When the issue label includes 'invoice'",
    procedureMarkdown: "1. Do step one\n2. Do step two",
    rationale: "Repeatable pattern",
    applicableRoleTitles: ["CFO"],
    status: "active",
    rejectionReason: null,
    confidence: 80,
    extractorModel: "openai/gpt-oss-120b:free",
    approvedByUserId: null,
    approvedAt: null,
    archivedAt: null,
    lastValidatedAt: new Date(),
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    matcherScore: 0.8,
    ...overrides,
  };
}

/** Build a minimal Drizzle-compatible mock DB. */
function makeMockDb(options: { candidates?: MatchedRecipe[]; issueExists?: boolean }) {
  const { candidates = [], issueExists = true } = options;

  // Chain builder that supports .where().limit() on a select
  const makeSelectChain = (rows: unknown[]) => {
    const chain = {
      from: () => chain,
      where: () => chain,
      innerJoin: () => chain,
      limit: () => Promise.resolve(rows),
      // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Drizzle chain mock
      then: (onFulfilled: (v: unknown[]) => unknown) => Promise.resolve(onFulfilled(rows)),
    };
    return chain;
  };

  return {
    select: (fields?: unknown) => {
      // Determine which table is being selected from by the shape of `fields`
      if (fields && typeof fields === "object") {
        const keys = Object.keys(fields as object);
        if (keys.includes("title") && keys.includes("description")) {
          // issues select
          return makeSelectChain(
            issueExists ? [{ title: "Invoice Q1 review", description: "Review invoices older than 30 days" }] : [],
          );
        }
        if (keys.includes("name") && !keys.includes("title")) {
          // labels select
          return makeSelectChain([{ name: "invoice" }]);
        }
      }
      // skillRecipes full-row select (fields is undefined or not matching above)
      return makeSelectChain(candidates);
    },
  } as unknown as import("@ironworksai/db").Db;
}

/** Fake a successful OpenRouter matcher response. */
function fakeMatcherResponse(matches: Array<{ id: string; score: number }>) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ matches }) } }],
    }),
    text: vi.fn().mockResolvedValue(""),
  } as unknown as Response;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("matchSkillsForRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveProviderSecret.mockResolvedValue({ apiKey: "test-key" });
  });

  it("returns [] without LLM call when there are no active candidates", async () => {
    const db = makeMockDb({ candidates: [] });

    const result = await matchSkillsForRun(db, {
      companyId: COMPANY_ID,
      agentId: AGENT_ID,
      issueId: ISSUE_ID,
      agentRoleTitle: "CFO",
    });

    expect(result).toEqual([]);
    // LLM must NOT be called — no candidates means no point spending the budget
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("filters out hallucinated recipe IDs returned by the LLM", async () => {
    const realRecipe = makeRecipe(RECIPE_ID_A);
    const db = makeMockDb({ candidates: [realRecipe] });

    // LLM returns the real ID plus a fake one
    mockFetch.mockResolvedValue(
      fakeMatcherResponse([
        { id: RECIPE_ID_A, score: 0.9 },
        { id: "00000000-0000-0000-0000-000000000000", score: 0.95 }, // hallucinated
      ]),
    );

    const result = await matchSkillsForRun(db, {
      companyId: COMPANY_ID,
      agentId: AGENT_ID,
      issueId: ISSUE_ID,
      agentRoleTitle: "CFO",
    });

    // Only the real ID should survive
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(RECIPE_ID_A);
  });

  it("enforces the 0.7 score threshold (0.6 dropped, 0.7 kept)", async () => {
    const recipeA = makeRecipe(RECIPE_ID_A);
    const recipeB = makeRecipe(RECIPE_ID_B);
    const db = makeMockDb({ candidates: [recipeA, recipeB] });

    mockFetch.mockResolvedValue(
      fakeMatcherResponse([
        { id: RECIPE_ID_A, score: 0.7 }, // exactly at threshold → kept
        { id: RECIPE_ID_B, score: 0.6 }, // below threshold → dropped
      ]),
    );

    const result = await matchSkillsForRun(db, {
      companyId: COMPANY_ID,
      agentId: AGENT_ID,
      issueId: ISSUE_ID,
      agentRoleTitle: "CFO",
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(RECIPE_ID_A);
  });

  it("caps at 2 matches even when more than 2 clear the threshold", async () => {
    const recipes = [makeRecipe(RECIPE_ID_A), makeRecipe(RECIPE_ID_B), makeRecipe(RECIPE_ID_C)];
    const db = makeMockDb({ candidates: recipes });

    mockFetch.mockResolvedValue(
      fakeMatcherResponse([
        { id: RECIPE_ID_A, score: 0.95 },
        { id: RECIPE_ID_B, score: 0.85 },
        { id: RECIPE_ID_C, score: 0.75 },
      ]),
    );

    const result = await matchSkillsForRun(db, {
      companyId: COMPANY_ID,
      agentId: AGENT_ID,
      issueId: ISSUE_ID,
      agentRoleTitle: "CFO",
    });

    expect(result).toHaveLength(2);
    // Top two by score
    expect(result[0].id).toBe(RECIPE_ID_A);
    expect(result[1].id).toBe(RECIPE_ID_B);
  });

  it("returns [] silently when the LLM fetch exceeds the 200 ms timeout", async () => {
    const recipes = [makeRecipe(RECIPE_ID_A)];
    const db = makeMockDb({ candidates: recipes });

    // Fetch that never resolves within the test execution window.
    // The timeout promise (200 ms) will fire first in matchSkillsForRun.
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          // Delay longer than MATCHER_TIMEOUT_MS (200 ms) to trigger the race
          setTimeout(() => resolve(fakeMatcherResponse([{ id: RECIPE_ID_A, score: 0.9 }])), 500);
        }),
    );

    const start = Date.now();
    const result = await matchSkillsForRun(db, {
      companyId: COMPANY_ID,
      agentId: AGENT_ID,
      issueId: ISSUE_ID,
      agentRoleTitle: "CFO",
    });
    const elapsed = Date.now() - start;

    expect(result).toEqual([]);
    // Should complete well under 400 ms (the 200 ms budget fires, then the
    // function returns immediately; allow generous slack for CI timing jitter)
    expect(elapsed).toBeLessThan(400);
  }, 1000);

  it("returns [] when issueId is null (no issue context available)", async () => {
    const db = makeMockDb({ candidates: [makeRecipe(RECIPE_ID_A)] });

    const result = await matchSkillsForRun(db, {
      companyId: COMPANY_ID,
      agentId: AGENT_ID,
      issueId: null,
      agentRoleTitle: "CFO",
    });

    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns [] for a company where the skill loop is disabled", async () => {
    const db = makeMockDb({ candidates: [makeRecipe(RECIPE_ID_A)] });

    const result = await matchSkillsForRun(db, {
      companyId: "00000000-0000-0000-0000-000000000001", // Not Atlas Ops, no env override
      agentId: AGENT_ID,
      issueId: ISSUE_ID,
      agentRoleTitle: "CFO",
    });

    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── formatSkillRecipesBlock ───────────────────────────────────────────────────

describe("formatSkillRecipesBlock", () => {
  it("returns empty string for an empty list", () => {
    expect(formatSkillRecipesBlock([])).toBe("");
  });

  it("renders the COMPANY PROCEDURES header and footer", () => {
    const recipe = makeRecipe(RECIPE_ID_A, {
      title: "Reconcile Invoice Over 30 Days",
      triggerPattern: "When an issue label includes 'invoice' and aging > 30d",
      procedureMarkdown: "1. Pull report\n2. Check history",
    });

    const block = formatSkillRecipesBlock([recipe]);

    expect(block).toContain("--- COMPANY PROCEDURES (matched to this task) ---");
    expect(block).toContain("--- END COMPANY PROCEDURES ---");
    expect(block).toContain("Reconcile Invoice Over 30 Days");
    expect(block).toContain("When an issue label includes 'invoice' and aging > 30d");
    expect(block).toContain("1. Pull report");
  });

  it("numbers multiple recipes sequentially", () => {
    const r1 = makeRecipe(RECIPE_ID_A, { title: "First Recipe" });
    const r2 = makeRecipe(RECIPE_ID_B, { title: "Second Recipe" });

    const block = formatSkillRecipesBlock([r1, r2]);

    expect(block).toContain("[1] First Recipe");
    expect(block).toContain("[2] Second Recipe");
  });
});

// ── injectSkillRecipes ────────────────────────────────────────────────────────

describe("injectSkillRecipes", () => {
  it("appends the COMPANY PROCEDURES block to an existing agentInstructions string", () => {
    const context: Record<string, unknown> = {
      agentInstructions: "You are the CFO agent.",
    };
    const recipe = makeRecipe(RECIPE_ID_A);

    injectSkillRecipes(context, [recipe]);

    expect(typeof context.agentInstructions).toBe("string");
    const instructions = context.agentInstructions as string;
    expect(instructions).toContain("You are the CFO agent.");
    expect(instructions).toContain("--- COMPANY PROCEDURES");
    expect(instructions).toContain("--- END COMPANY PROCEDURES ---");
  });

  it("sets agentInstructions to the block when the field was not previously set", () => {
    const context: Record<string, unknown> = {};
    const recipe = makeRecipe(RECIPE_ID_A);

    injectSkillRecipes(context, [recipe]);

    expect(typeof context.agentInstructions).toBe("string");
    expect(context.agentInstructions as string).toContain("--- COMPANY PROCEDURES");
  });

  it("also writes ironworksSkillRecipesBlock for test introspection", () => {
    const context: Record<string, unknown> = {};
    const recipe = makeRecipe(RECIPE_ID_A);

    injectSkillRecipes(context, [recipe]);

    expect(typeof context.ironworksSkillRecipesBlock).toBe("string");
    expect(context.ironworksSkillRecipesBlock as string).toContain("--- COMPANY PROCEDURES");
  });

  it("is a no-op when the matched list is empty", () => {
    const context: Record<string, unknown> = {
      agentInstructions: "You are the CFO agent.",
    };

    injectSkillRecipes(context, []);

    // Nothing should be added or changed
    expect(context.agentInstructions).toBe("You are the CFO agent.");
    expect(context.ironworksSkillRecipesBlock).toBeUndefined();
  });
});

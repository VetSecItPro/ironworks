/**
 * Tests for the skill extraction service (PR 2/6 of the skill loop).
 *
 * Coverage:
 *   1. sanitiseSkillBody: each PII category replaced with the correct placeholder.
 *   2. proposeSkillFromCompletedIssue returns null when LLM says reusable=false.
 *   3. proposeSkillFromCompletedIssue returns the inserted row on a valid recipe.
 *   4. proposeSkillFromCompletedIssue returns null when the feature is disabled.
 *
 * Cost-recording integration is stubbed — we verify it doesn't block the main
 * path but do not assert on cost_events rows.
 */

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sanitiseSkillBody } from "../services/skill-extraction.js";

// ── Shared IDs ───────────────────────────────────────────────────────────────

const COMPANY_ID = "ec7708b1-11c8-4117-a2ff-02b4aebe9c76"; // Atlas Ops dogfood (skill loop on by default)
const AGENT_ID = randomUUID();
const ISSUE_ID = randomUUID();
const RECIPE_ID = randomUUID();

// ── Mock: logger ──────────────────────────────────────────────────────────────

vi.mock("../middleware/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Mock: provider-secret-resolver ───────────────────────────────────────────

const mockResolveProviderSecret = vi.hoisted(() => vi.fn());

vi.mock("../services/provider-secret-resolver.js", () => ({
  resolveProviderSecret: mockResolveProviderSecret,
}));

// ── Mock: global fetch (OpenRouter call) ─────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fake a successful OpenRouter JSON response. */
function fakeOpenRouterResponse(body: unknown): Response {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(body) } }],
    }),
    text: vi.fn().mockResolvedValue(""),
  } as unknown as Response;
}

// ── sanitiseSkillBody ─────────────────────────────────────────────────────────

describe("sanitiseSkillBody", () => {
  it("replaces dollar amounts > $1000 with {{AMOUNT}}", () => {
    const input = "Invoice total was $5000 for the client.";
    expect(sanitiseSkillBody(input)).toBe("Invoice total was {{AMOUNT}} for the client.");
  });

  it("leaves dollar amounts <= $1000 intact", () => {
    const input = "Shipping cost was $500 and handling was $50.";
    expect(sanitiseSkillBody(input)).toBe("Shipping cost was $500 and handling was $50.");
  });

  it("replaces email addresses with {{EMAIL}}", () => {
    const input = "Contact john@example.com for approval.";
    expect(sanitiseSkillBody(input)).toBe("Contact {{EMAIL}} for approval.");
  });

  it("replaces US phone numbers with {{PHONE}}", () => {
    const input = "Call (555) 123-4567 for support.";
    expect(sanitiseSkillBody(input)).toBe("Call {{PHONE}} for support.");
  });

  it("replaces 8+ digit account numbers with {{ACCOUNT}}", () => {
    const input = "Account 1234567890 is overdue.";
    expect(sanitiseSkillBody(input)).toBe("Account {{ACCOUNT}} is overdue.");
  });

  it("replaces ISO dates with {{DATE}}", () => {
    const input = "Due by 2026-04-25.";
    expect(sanitiseSkillBody(input)).toBe("Due by {{DATE}}.");
  });

  it("replaces written dates like 'March 5 2026' with {{DATE}}", () => {
    const input = "Scheduled for March 5 2026 review.";
    expect(sanitiseSkillBody(input)).toBe("Scheduled for {{DATE}} review.");
  });

  it("handles a fixture with all PII types", () => {
    const fixture = "Invoice $5000 from john@example.com on 2026-04-25, account 1234567890, call (555) 123-4567.";
    const result = sanitiseSkillBody(fixture);
    expect(result).toContain("{{AMOUNT}}");
    expect(result).toContain("{{EMAIL}}");
    expect(result).toContain("{{DATE}}");
    expect(result).toContain("{{ACCOUNT}}");
    expect(result).toContain("{{PHONE}}");
    expect(result).not.toContain("5000");
    expect(result).not.toContain("john@example.com");
    expect(result).not.toContain("2026-04-25");
    expect(result).not.toContain("1234567890");
    expect(result).not.toContain("(555) 123-4567");
  });

  it("redacts known secret names when provided", () => {
    const input = "Use STRIPE_SECRET_KEY to authenticate with the billing API.";
    expect(sanitiseSkillBody(input, ["STRIPE_SECRET_KEY"])).toBe(
      "Use {{SECRET}} to authenticate with the billing API.",
    );
  });
});

// ── proposeSkillFromCompletedIssue ────────────────────────────────────────────

describe("proposeSkillFromCompletedIssue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveProviderSecret.mockResolvedValue({ apiKey: "test-key-abc" });
  });

  it("returns null when LLM responds with reusable=false", async () => {
    // DB returns enough data for context fetch to succeed
    const db = buildCompleteDb({ reusable: false });
    mockFetch.mockResolvedValueOnce(fakeOpenRouterResponse({ reusable: false }));

    const { proposeSkillFromCompletedIssue } = await import("../services/skill-extraction.js");
    const result = await proposeSkillFromCompletedIssue(db as never, {
      companyId: COMPANY_ID,
      issueId: ISSUE_ID,
      agentId: AGENT_ID,
    });

    expect(result).toBeNull();
  });

  it("returns the inserted row when LLM responds with a valid recipe", async () => {
    const mockRecipe = {
      id: RECIPE_ID,
      companyId: COMPANY_ID,
      proposedByAgentId: AGENT_ID,
      sourceIssueId: ISSUE_ID,
      sourceRunId: null,
      title: "Reconcile Overdue Invoices",
      triggerPattern: "When invoice label present and aging > 30 days",
      procedureMarkdown: "1. Pull aging report\n2. Check CRM\n3. Draft outreach",
      rationale: "Repeatable quarterly pattern",
      applicableRoleTitles: ["CFO"],
      status: "proposed" as const,
      rejectionReason: null,
      confidence: 80,
      extractorModel: "openai/gpt-oss-120b:free",
      approvedByUserId: null,
      approvedAt: null,
      archivedAt: null,
      lastValidatedAt: new Date(),
      sourceSkillId: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const validLlmPayload = {
      reusable: true,
      title: "Reconcile Overdue Invoices",
      trigger_pattern: "When invoice label present and aging > 30 days",
      applicable_roles: ["CFO"],
      procedure_markdown: "1. Pull aging report\n2. Check CRM\n3. Draft outreach",
      rationale: "Repeatable quarterly pattern",
      confidence: 80,
    };

    const db = buildCompleteDb({ reusable: true }, mockRecipe);
    mockFetch.mockResolvedValueOnce(fakeOpenRouterResponse(validLlmPayload));

    const { proposeSkillFromCompletedIssue } = await import("../services/skill-extraction.js");
    const result = await proposeSkillFromCompletedIssue(db as never, {
      companyId: COMPANY_ID,
      issueId: ISSUE_ID,
      agentId: AGENT_ID,
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe(RECIPE_ID);
    expect(result?.status).toBe("proposed");
    expect(result?.confidence).toBe(80);
  });

  it("returns null when the company is not in the enabled set", async () => {
    const randomCompanyId = randomUUID(); // Not Atlas Ops UUID
    const db = buildCompleteDb({ reusable: true });

    const { proposeSkillFromCompletedIssue } = await import("../services/skill-extraction.js");
    const result = await proposeSkillFromCompletedIssue(db as never, {
      companyId: randomCompanyId,
      issueId: ISSUE_ID,
      agentId: AGENT_ID,
    });

    // Feature flag not set, not Atlas Ops → should skip without calling LLM
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("falls back to secondary model when primary model call fails", async () => {
    const mockRecipe = {
      id: RECIPE_ID,
      companyId: COMPANY_ID,
      proposedByAgentId: AGENT_ID,
      sourceIssueId: ISSUE_ID,
      sourceRunId: null,
      title: "Handle Vendor Non-Response",
      triggerPattern: "When vendor issue is open > 7 days",
      procedureMarkdown: "1. Send follow-up\n2. Escalate to COO",
      rationale: "Repeatable escalation pattern",
      applicableRoleTitles: ["COO"],
      status: "proposed" as const,
      rejectionReason: null,
      confidence: 70,
      extractorModel: "nousresearch/hermes-3-llama-3.1-405b:free",
      approvedByUserId: null,
      approvedAt: null,
      archivedAt: null,
      lastValidatedAt: new Date(),
      sourceSkillId: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const validLlmPayload = {
      reusable: true,
      title: "Handle Vendor Non-Response",
      trigger_pattern: "When vendor issue is open > 7 days",
      applicable_roles: ["COO"],
      procedure_markdown: "1. Send follow-up\n2. Escalate to COO",
      rationale: "Repeatable escalation pattern",
      confidence: 70,
    };

    const db = buildCompleteDb({ reusable: true }, mockRecipe);
    // Primary fails, fallback succeeds
    mockFetch
      .mockRejectedValueOnce(new Error("primary rate limited"))
      .mockResolvedValueOnce(fakeOpenRouterResponse(validLlmPayload));

    const { proposeSkillFromCompletedIssue } = await import("../services/skill-extraction.js");
    const result = await proposeSkillFromCompletedIssue(db as never, {
      companyId: COMPANY_ID,
      issueId: ISSUE_ID,
      agentId: AGENT_ID,
    });

    expect(result).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ── DB factory ────────────────────────────────────────────────────────────────

/**
 * Build a DB mock wired up to return the minimum context rows that the
 * extraction service needs. Each select() call returns a new chainable that
 * always resolves with a rotating set of fixture rows so the parallel
 * Promise.all inside proposeSkillFromCompletedIssue gets sensible data
 * regardless of execution order.
 *
 * The mock uses a simple round-robin over a response pool instead of a strict
 * sequence counter because Promise.all fires DB queries concurrently and the
 * call order is not guaranteed.
 */
function buildCompleteDb(
  _llmHint: { reusable: boolean },
  insertedRecipe?: Record<string, unknown>,
): Record<string, unknown> {
  const RUN_ID = randomUUID();

  // Pool of response rows indexed by call number (mod pool.length)
  const responsePool = [
    // issues row
    [{ title: "Q1 Invoice Review", status: "done", description: "Review overdue invoices." }],
    // agents row
    [{ name: "CFO Agent", role: "CFO", title: "Chief Financial Officer" }],
    // heartbeat_runs list
    [{ id: RUN_ID }],
    // single run context (contextSnapshot)
    [{ contextSnapshot: { issueId: ISSUE_ID } }],
    // heartbeat_run_events
    [
      { message: "Pulled aging report", eventType: "text" },
      { message: "Reviewed CRM entries", eventType: "text" },
    ],
    // company_secrets (name only — empty is fine, no PII to strip)
    [],
  ];

  let callIdx = 0;

  function makeSelectChain(): Record<string, unknown> {
    const rows = responsePool[callIdx % responsePool.length] ?? [];
    callIdx++;
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "from", "where", "limit", "orderBy", "innerJoin", "leftJoin"]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    // biome-ignore lint/suspicious/noThenProperty: test mock drizzle thenable contract
    chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => unknown) => resolve(rows));
    return chain;
  }

  const insertChain: Record<string, unknown> = {};
  insertChain.returning = vi.fn().mockResolvedValue(insertedRecipe ? [insertedRecipe] : []);
  insertChain.values = vi.fn().mockReturnValue(insertChain);

  return {
    select: vi.fn().mockImplementation(() => makeSelectChain()),
    insert: vi.fn().mockReturnValue(insertChain),
  };
}

import { randomUUID } from "node:crypto";
import { companies, createDb, knowledgePages } from "@ironworksai/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../../__tests__/helpers/embedded-postgres.js";
import { type DecisionInput, emitDecisionNotes } from "../decision-notes.js";

const support = await getEmbeddedPostgresTestSupport();
const describeIfSupported = support.supported ? describe : describe.skip;

if (!support.supported) {
  console.warn(`Skipping decision-notes tests on this host: ${support.reason ?? "unsupported environment"}`);
}

function makeDecision(overrides: Partial<DecisionInput> & { decisionId: string; title: string }): DecisionInput {
  return {
    rationale: "Because performance.",
    status: "accepted",
    contextIssueSlug: "issue-42",
    decidedByAgentSlug: "architect",
    projectSlug: "rowan",
    alternatives: ["Option A", "Option B"],
    consequences: ["Cost goes up"],
    ...overrides,
  };
}

describeIfSupported("emitDecisionNotes", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("ironworks-decision-notes-");
    db = createDb(tempDb.connectionString);
    companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "decision-notes-test-co" });
  }, 60_000);

  afterEach(async () => {
    await db.delete(knowledgePages).where(eq(knowledgePages.companyId, companyId));
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("emits one page per decision (happy path with 3 decisions)", async () => {
    const decisions = [
      makeDecision({ decisionId: "d-001", title: "Adopt Postgres" }),
      makeDecision({ decisionId: "d-002", title: "Use vitest" }),
      makeDecision({ decisionId: "d-003", title: "Standardize on TS" }),
    ];
    const out = await emitDecisionNotes(db, { companyId, decisions });
    expect(out).toHaveLength(3);
    for (const r of out) {
      expect(r.pageId).toBeDefined();
      expect(r.error).toBeUndefined();
    }
    const pages = await db.select().from(knowledgePages).where(eq(knowledgePages.companyId, companyId));
    expect(pages).toHaveLength(3);
    const slugs = pages.map((p) => p.slug).sort();
    expect(slugs).toEqual(["decisions/d-001", "decisions/d-002", "decisions/d-003"]);

    const adopt = pages.find((p) => p.slug === "decisions/d-001");
    expect(adopt?.body).toContain("type: decision");
    expect(adopt?.body).toContain("# Decision `d-001`");
    expect(adopt?.body).toContain("[[issue-42]]");
    expect(adopt?.body).toContain("[[architect]]");
  });

  it("returns empty array and writes no rows when given an empty decisions list", async () => {
    const out = await emitDecisionNotes(db, { companyId, decisions: [] });
    expect(out).toEqual([]);
    const pages = await db.select().from(knowledgePages).where(eq(knowledgePages.companyId, companyId));
    expect(pages).toHaveLength(0);
  });

  it("is idempotent: re-running same decisions updates pages (revisionNumber bumps)", async () => {
    const decisions = [makeDecision({ decisionId: "d-100", title: "Initial title" })];
    const r1 = await emitDecisionNotes(db, { companyId, decisions });
    const r2 = await emitDecisionNotes(db, {
      companyId,
      decisions: [makeDecision({ decisionId: "d-100", title: "Updated title", rationale: "New reason" })],
    });
    expect(r2[0].pageId).toBe(r1[0].pageId);
    const [page] = await db.select().from(knowledgePages).where(eq(knowledgePages.id, r1[0].pageId!)).limit(1);
    expect(page.revisionNumber).toBe(2);
    expect(page.title).toBe("Updated title");
    expect(page.body).toContain("New reason");
  });

  it("isolates failures: one bad decision still allows others to emit", async () => {
    // Pre-create a page at decisions/d-collide with body whose update will succeed
    // - to actually trigger a failure, we mock by making the title empty (which
    // slugify-rejects) ... but slug is overridden, so empty title is the only
    // path that breaks the create (title NOT NULL). We use an oversized body
    // (>100KB) on the middle decision to force a controlled failure.
    const big = "x".repeat(110_000);
    const decisions: DecisionInput[] = [
      makeDecision({ decisionId: "d-good-1", title: "Good 1" }),
      makeDecision({ decisionId: "d-bad", title: "Bad", rationale: big }),
      makeDecision({ decisionId: "d-good-2", title: "Good 2" }),
    ];
    const out = await emitDecisionNotes(db, { companyId, decisions });
    expect(out).toHaveLength(3);
    expect(out[0].error).toBeUndefined();
    expect(out[0].pageId).toBeDefined();
    expect(out[1].error).toBeDefined();
    expect(out[1].pageId).toBeUndefined();
    expect(out[2].error).toBeUndefined();
    expect(out[2].pageId).toBeDefined();

    const pages = await db.select().from(knowledgePages).where(eq(knowledgePages.companyId, companyId));
    expect(pages).toHaveLength(2);
  });
});

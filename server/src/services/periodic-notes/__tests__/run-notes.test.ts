import { randomUUID } from "node:crypto";
import { agents, companies, createDb, knowledgePages } from "@ironworksai/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../../__tests__/helpers/embedded-postgres.js";
import { emitRunNote } from "../run-notes.js";

const support = await getEmbeddedPostgresTestSupport();
const describeIfSupported = support.supported ? describe : describe.skip;

if (!support.supported) {
  console.warn(`Skipping run-notes tests on this host: ${support.reason ?? "unsupported environment"}`);
}

describeIfSupported("emitRunNote", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId!: string;
  let agentId!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("ironworks-run-notes-");
    db = createDb(tempDb.connectionString);
    companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "run-notes-test-co" });
    const [agent] = await db
      .insert(agents)
      .values({ companyId, name: "Code Reviewer", title: "Code Reviewer" })
      .returning();
    agentId = agent.id;
  }, 60_000);

  afterEach(async () => {
    await db.delete(knowledgePages).where(eq(knowledgePages.companyId, companyId));
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  const baseInput = () => ({
    companyId,
    agentId,
    agentSlug: "code-reviewer",
    agentTitle: "Code Reviewer",
    runId: "run_abc12345xyz",
    status: "succeeded" as const,
    startedAt: new Date("2026-05-08T12:00:00.000Z"),
    completedAt: new Date("2026-05-08T12:05:30.000Z"),
    costUsd: 0.42,
    linkedIssueRef: "ABC-123",
    linkedIssueSlug: "abc-123-fix-login",
    summary: "Fixed the broken login flow.",
  });

  it("creates a run page with correct slug, frontmatter, and body (happy path)", async () => {
    const result = await emitRunNote(db, baseInput());
    expect(result.pageId).toMatch(/^[0-9a-f-]{36}$/);

    const [page] = await db.select().from(knowledgePages).where(eq(knowledgePages.id, result.pageId)).limit(1);
    expect(page).toBeDefined();
    expect(page.slug).toBe("agents/code-reviewer/runs/2026-05-08/runabc12");
    expect(page.title).toContain("Run runabc12");
    expect(page.title).toContain("Code Reviewer");
    expect(page.title).toContain("(succeeded)");
    expect(page.body).toContain("type: run");
    expect(page.body).toContain("[[code-reviewer|Code Reviewer]]");
    expect(page.body).toContain("- **Result:** succeeded");
    expect(page.body).toContain("Fixed the broken login flow.");
    expect(page.revisionNumber).toBe(1);
  });

  it("is idempotent: re-emitting the same runId updates the existing page", async () => {
    const r1 = await emitRunNote(db, baseInput());
    const r2 = await emitRunNote(db, { ...baseInput(), summary: "Updated summary text" });
    expect(r2.pageId).toBe(r1.pageId);

    const [page] = await db.select().from(knowledgePages).where(eq(knowledgePages.id, r1.pageId)).limit(1);
    expect(page.revisionNumber).toBe(2);
    expect(page.body).toContain("Updated summary text");
  });

  it("falls back to `_unknown` agent slug when agentSlug is null", async () => {
    const result = await emitRunNote(db, { ...baseInput(), agentSlug: null });
    const [page] = await db.select().from(knowledgePages).where(eq(knowledgePages.id, result.pageId)).limit(1);
    expect(page.slug.startsWith("agents/_unknown/runs/")).toBe(true);
  });

  it("renders status variants (failed, cancelled, timed_out)", async () => {
    for (const status of ["failed", "cancelled", "timed_out"] as const) {
      const result = await emitRunNote(db, {
        ...baseInput(),
        runId: `run_${status}_111`,
        status,
      });
      const [page] = await db.select().from(knowledgePages).where(eq(knowledgePages.id, result.pageId)).limit(1);
      expect(page.title).toContain(`(${status})`);
      expect(page.body).toContain(`- **Result:** ${status}`);
    }
  });

  it("omits the cost section when costUsd is null and includes it when populated", async () => {
    const r1 = await emitRunNote(db, { ...baseInput(), runId: "run_costnull1", costUsd: null });
    const [p1] = await db.select().from(knowledgePages).where(eq(knowledgePages.id, r1.pageId)).limit(1);
    expect(p1.body).not.toContain("## Cost");

    const r2 = await emitRunNote(db, { ...baseInput(), runId: "run_costset12", costUsd: 1.23 });
    const [p2] = await db.select().from(knowledgePages).where(eq(knowledgePages.id, r2.pageId)).limit(1);
    expect(p2.body).toContain("## Cost");
    expect(p2.body).toContain("$1.23");
  });
});

import { randomUUID } from "node:crypto";
import { agents, companies, costRollupDaily, createDb, knowledgePages } from "@ironworksai/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../../__tests__/helpers/embedded-postgres.js";
import { emitMonthlyCostRollup, emitWeeklyCostRollup } from "../cost-rollups.js";

const support = await getEmbeddedPostgresTestSupport();
const describeIfSupported = support.supported ? describe : describe.skip;

if (!support.supported) {
  console.warn(`Skipping cost-rollup tests on this host: ${support.reason ?? "unsupported environment"}`);
}

// Convert dollars to micro-USD (1e6 micro = $1).
const usdToMicro = (usd: number): number => Math.round(usd * 1_000_000);

describeIfSupported("cost-rollup emitters", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("ironworks-cost-rollups-");
    db = createDb(tempDb.connectionString);
  }, 60_000);

  afterEach(async () => {
    await db.delete(costRollupDaily);
    await db.delete(knowledgePages);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  let prefixCounter = 0;
  async function seedCompany(name: string): Promise<{ companyId: string; agentA: string; agentB: string }> {
    const companyId = randomUUID();
    // issue_prefix has a unique index; bump per-company so multi-company tests don't collide.
    prefixCounter++;
    const issuePrefix = `T${prefixCounter.toString().padStart(2, "0")}`;
    await db.insert(companies).values({ id: companyId, name, issuePrefix });
    const [a] = await db.insert(agents).values({ companyId, name: "Agent Alpha" }).returning();
    const [b] = await db.insert(agents).values({ companyId, name: "Agent Beta" }).returning();
    return { companyId, agentA: a.id, agentB: b.id };
  }

  it("emitWeeklyCostRollup: aggregates 5 daily rows for 2 agents into one page per company", async () => {
    const { companyId, agentA, agentB } = await seedCompany("weekly-co");
    // now = Wed 2026-05-13 in CT → prior ISO week = 2026-W19 (Mon 2026-05-04 .. Sun 2026-05-10)
    const now = new Date("2026-05-13T18:00:00.000Z");
    const days = ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08"];
    for (const day of days) {
      await db.insert(costRollupDaily).values({
        day,
        companyId,
        agentId: agentA,
        provider: "anthropic",
        source: "agent",
        callCount: 1,
        costUsdMicro: usdToMicro(0.5),
      });
    }
    await db.insert(costRollupDaily).values({
      day: "2026-05-06",
      companyId,
      agentId: agentB,
      provider: "openai",
      source: "agent",
      callCount: 1,
      costUsdMicro: usdToMicro(1.25),
    });

    const result = await emitWeeklyCostRollup(db, { now });
    expect(result.pagesEmitted).toBe(1);

    const [page] = await db.select().from(knowledgePages).where(eq(knowledgePages.companyId, companyId));
    expect(page.slug).toBe("finance/cost-rollups/weekly/2026-W19");
    expect(page.body).toContain("granularity: weekly");
    expect(page.body).toContain("period_start: '2026-05-04'");
    expect(page.body).toContain("period_end: '2026-05-10'");
    expect(page.body).toContain("[[agent-alpha]]");
    expect(page.body).toContain("$2.50"); // 5 × $0.50
    expect(page.body).toContain("$1.25");
    expect(page.body).toContain("**Total:** $3.75");
  });

  it("emitMonthlyCostRollup: rolls up the previous calendar month", async () => {
    const { companyId, agentA } = await seedCompany("monthly-co");
    // now = 2026-06-01 in CT → prior month = 2026-05 (May)
    const now = new Date("2026-06-01T15:00:00.000Z");
    await db.insert(costRollupDaily).values({
      day: "2026-05-15",
      companyId,
      agentId: agentA,
      provider: "anthropic",
      source: "agent",
      callCount: 1,
      costUsdMicro: usdToMicro(7.5),
    });
    // Out of range: April → must NOT be included.
    await db.insert(costRollupDaily).values({
      day: "2026-04-30",
      companyId,
      agentId: agentA,
      provider: "anthropic",
      source: "agent",
      callCount: 1,
      costUsdMicro: usdToMicro(99),
    });

    const result = await emitMonthlyCostRollup(db, { now });
    expect(result.pagesEmitted).toBe(1);
    const [page] = await db.select().from(knowledgePages).where(eq(knowledgePages.companyId, companyId));
    expect(page.slug).toBe("finance/cost-rollups/monthly/2026-05");
    expect(page.body).toContain("period_start: '2026-05-01'");
    expect(page.body).toContain("period_end: '2026-05-31'");
    expect(page.body).toContain("$7.50");
    expect(page.body).not.toContain("$99");
  });

  it("emits a zero-total page for a company with no costs in the period", async () => {
    const { companyId } = await seedCompany("no-costs-co");
    const now = new Date("2026-05-13T18:00:00.000Z");
    const result = await emitWeeklyCostRollup(db, { now });
    expect(result.pagesEmitted).toBe(1);
    const [page] = await db.select().from(knowledgePages).where(eq(knowledgePages.companyId, companyId));
    expect(page.body).toContain("total_usd: 0");
    expect(page.body).toContain("No costs recorded for this period.");
  });

  it("is idempotent: re-running with the same `now` updates the existing page", async () => {
    const { companyId, agentA } = await seedCompany("idem-co");
    const now = new Date("2026-05-13T18:00:00.000Z");
    await db.insert(costRollupDaily).values({
      day: "2026-05-05",
      companyId,
      agentId: agentA,
      provider: "anthropic",
      source: "agent",
      callCount: 1,
      costUsdMicro: usdToMicro(2),
    });

    await emitWeeklyCostRollup(db, { now });
    await emitWeeklyCostRollup(db, { now });

    const pages = await db.select().from(knowledgePages).where(eq(knowledgePages.companyId, companyId));
    expect(pages).toHaveLength(1);
    expect(pages[0].revisionNumber).toBe(2);
  });

  it("emits one page per company when multiple companies exist", async () => {
    const c1 = await seedCompany("multi-co-1");
    const c2 = await seedCompany("multi-co-2");
    const now = new Date("2026-05-13T18:00:00.000Z");
    await db.insert(costRollupDaily).values({
      day: "2026-05-05",
      companyId: c1.companyId,
      agentId: c1.agentA,
      provider: "anthropic",
      source: "agent",
      callCount: 1,
      costUsdMicro: usdToMicro(1),
    });
    await db.insert(costRollupDaily).values({
      day: "2026-05-06",
      companyId: c2.companyId,
      agentId: c2.agentA,
      provider: "openai",
      source: "agent",
      callCount: 1,
      costUsdMicro: usdToMicro(2),
    });

    const result = await emitWeeklyCostRollup(db, { now });
    expect(result.pagesEmitted).toBe(2);

    const p1 = await db.select().from(knowledgePages).where(eq(knowledgePages.companyId, c1.companyId));
    const p2 = await db.select().from(knowledgePages).where(eq(knowledgePages.companyId, c2.companyId));
    expect(p1).toHaveLength(1);
    expect(p2).toHaveLength(1);
    expect(p1[0].body).toContain("$1.00");
    expect(p2[0].body).toContain("$2.00");
    expect(p1[0].body).not.toContain("$2.00");
  });
});

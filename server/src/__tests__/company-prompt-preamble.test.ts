/**
 * SEC-PROMPT-001 regression: per-company prompt preamble.
 *
 * The instance-level preamble used to be a single singleton row prepended to
 * every tenant's agent system prompt — meaning Tenant A's preamble bled into
 * Tenant B's agents in any multi-tenant deployment. The fix adds a
 * `companies.prompt_preamble` column read at heartbeat time, with the
 * instance-level preamble retained as a backwards-compatible fallback when
 * the per-company column is null/empty.
 *
 * Tests pin three contracts:
 *   1. The schema column exists and accepts a string value.
 *   2. The Zod validator on PATCH /companies/:id accepts promptPreamble.
 *   3. Two companies with different promptPreamble values are independent.
 */

import { companies, createDb } from "@ironworksai/db";
import { updateCompanySchema } from "@ironworksai/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres prompt-preamble tests: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describe("SEC-PROMPT-001 validator", () => {
  it("accepts a string promptPreamble", () => {
    const parsed = updateCompanySchema.safeParse({ promptPreamble: "Tenant-specific preamble" });
    expect(parsed.success).toBe(true);
  });

  it("accepts null promptPreamble (clears the override)", () => {
    const parsed = updateCompanySchema.safeParse({ promptPreamble: null });
    expect(parsed.success).toBe(true);
  });

  it("rejects promptPreamble exceeding 4000 chars", () => {
    const parsed = updateCompanySchema.safeParse({ promptPreamble: "a".repeat(4001) });
    expect(parsed.success).toBe(false);
  });
});

describeEmbeddedPostgres("SEC-PROMPT-001 per-company preamble persistence", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("ironworks-prompt-preamble-");
    db = createDb(tempDb.connectionString);
  }, 30_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("two companies in the same instance keep independent preamble values", async () => {
    // Each tenant gets its own preamble — there is no shared write path.
    await db.execute(sql`TRUNCATE TABLE companies RESTART IDENTITY CASCADE`);

    const [c1] = await db
      .insert(companies)
      .values({ name: "Tenant A", issuePrefix: "TNA", promptPreamble: "You are an Atlas Ops agent." })
      .returning();
    const [c2] = await db
      .insert(companies)
      .values({ name: "Tenant B", issuePrefix: "TNB", promptPreamble: "You are a SteelMotion agent." })
      .returning();

    const aRow = await db
      .select({ id: companies.id, promptPreamble: companies.promptPreamble })
      .from(companies)
      .where(eq(companies.id, c1!.id))
      .then((r) => r[0]);
    const bRow = await db
      .select({ id: companies.id, promptPreamble: companies.promptPreamble })
      .from(companies)
      .where(eq(companies.id, c2!.id))
      .then((r) => r[0]);

    expect(aRow?.promptPreamble).toBe("You are an Atlas Ops agent.");
    expect(bRow?.promptPreamble).toBe("You are a SteelMotion agent.");
    expect(aRow?.promptPreamble).not.toBe(bRow?.promptPreamble);
  });

  it("null promptPreamble is the default and signals fallback to instance-level", async () => {
    // Backwards compatibility: a fresh company has no override and the
    // heartbeat layer falls back to the instance-level value.
    await db.execute(sql`TRUNCATE TABLE companies RESTART IDENTITY CASCADE`);
    const [created] = await db.insert(companies).values({ name: "Tenant C", issuePrefix: "TNC" }).returning();
    const row = await db
      .select({ promptPreamble: companies.promptPreamble })
      .from(companies)
      .where(eq(companies.id, created!.id))
      .then((r) => r[0]);
    expect(row?.promptPreamble).toBeNull();
  });
});

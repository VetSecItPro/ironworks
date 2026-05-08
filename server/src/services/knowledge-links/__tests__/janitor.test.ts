import { randomUUID } from "node:crypto";
import { companies, createDb, knowledgePageLinks, knowledgePages } from "@ironworksai/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../../__tests__/helpers/embedded-postgres.js";
import { rebindUnresolvedLinks } from "../janitor.js";

const support = await getEmbeddedPostgresTestSupport();
const describeIfSupported = support.supported ? describe : describe.skip;

if (!support.supported) {
  console.warn(`Skipping janitor tests: ${support.reason ?? "unsupported"}`);
}

describeIfSupported("rebindUnresolvedLinks", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyA!: string;
  let companyB!: string;
  let fromPageA1!: string;
  let fromPageA2!: string;
  let fromPageB!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("ironworks-knowlinks-janitor-");
    db = createDb(tempDb.connectionString);
    companyA = randomUUID();
    companyB = randomUUID();
    fromPageA1 = randomUUID();
    fromPageA2 = randomUUID();
    fromPageB = randomUUID();

    await db.insert(companies).values([
      { id: companyA, name: "co-a", issuePrefix: `JA${randomUUID().slice(0, 4)}` },
      { id: companyB, name: "co-b", issuePrefix: `JB${randomUUID().slice(0, 4)}` },
    ]);
    await db.insert(knowledgePages).values([
      { id: fromPageA1, companyId: companyA, slug: "from-a-1", title: "a1" },
      { id: fromPageA2, companyId: companyA, slug: "from-a-2", title: "a2" },
      { id: fromPageB, companyId: companyB, slug: "from-b", title: "b" },
    ]);
  }, 60_000);

  afterEach(async () => {
    await db.delete(knowledgePageLinks);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("rebinds unresolved rows whose slug matches the new page's slug", async () => {
    const newPageId = randomUUID();
    await db.insert(knowledgePages).values({
      id: newPageId,
      companyId: companyA,
      slug: "newly-created",
      title: "newly-created",
    });

    // 3 rows reference the new slug; 2 reference an unrelated slug.
    await db.insert(knowledgePageLinks).values([
      { fromId: fromPageA1, companyId: companyA, unresolvedSlug: "newly-created", anchor: null },
      { fromId: fromPageA1, companyId: companyA, unresolvedSlug: "newly-created", anchor: "x" },
      { fromId: fromPageA2, companyId: companyA, unresolvedSlug: "newly-created", anchor: null },
      { fromId: fromPageA1, companyId: companyA, unresolvedSlug: "different", anchor: null },
      { fromId: fromPageA2, companyId: companyA, unresolvedSlug: "another", anchor: null },
    ]);

    const count = await rebindUnresolvedLinks(db, {
      pageId: newPageId,
      companyId: companyA,
      slug: "newly-created",
      aliases: [],
    });
    expect(count).toBe(3);

    const rebound = await db.select().from(knowledgePageLinks).where(eq(knowledgePageLinks.toId, newPageId));
    expect(rebound).toHaveLength(3);
    for (const row of rebound) {
      expect(row.unresolvedSlug).toBeNull();
      expect(row.toId).toBe(newPageId);
    }

    const stillUnresolved = await db
      .select()
      .from(knowledgePageLinks)
      .where(eq(knowledgePageLinks.companyId, companyA));
    const unresolvedSlugs = stillUnresolved
      .filter((r) => r.toId === null)
      .map((r) => r.unresolvedSlug)
      .sort();
    expect(unresolvedSlugs).toEqual(["another", "different"]);
  });

  it("rebinds via alias even when slug doesn't match", async () => {
    const newPageId = randomUUID();
    await db.insert(knowledgePages).values({
      id: newPageId,
      companyId: companyA,
      slug: "canonical-slug",
      title: "canon",
      aliases: ["pet-name", "another-alias"],
    });

    await db.insert(knowledgePageLinks).values([
      { fromId: fromPageA1, companyId: companyA, unresolvedSlug: "pet-name", anchor: null },
      { fromId: fromPageA2, companyId: companyA, unresolvedSlug: "another-alias", anchor: null },
      { fromId: fromPageA1, companyId: companyA, unresolvedSlug: "untouched", anchor: null },
    ]);

    const count = await rebindUnresolvedLinks(db, {
      pageId: newPageId,
      companyId: companyA,
      slug: "canonical-slug",
      aliases: ["pet-name", "another-alias"],
    });
    expect(count).toBe(2);
  });

  it("does not touch matching slugs in other companies", async () => {
    const newPageId = randomUUID();
    await db.insert(knowledgePages).values({
      id: newPageId,
      companyId: companyA,
      slug: "shared-slug-name",
      title: "shared",
    });

    await db.insert(knowledgePageLinks).values([
      { fromId: fromPageA1, companyId: companyA, unresolvedSlug: "shared-slug-name", anchor: null },
      { fromId: fromPageB, companyId: companyB, unresolvedSlug: "shared-slug-name", anchor: null },
    ]);

    const count = await rebindUnresolvedLinks(db, {
      pageId: newPageId,
      companyId: companyA,
      slug: "shared-slug-name",
      aliases: [],
    });
    expect(count).toBe(1);

    // companyB's row stays unresolved.
    const tenantBRows = await db.select().from(knowledgePageLinks).where(eq(knowledgePageLinks.companyId, companyB));
    expect(tenantBRows).toHaveLength(1);
    expect(tenantBRows[0]?.toId).toBeNull();
    expect(tenantBRows[0]?.unresolvedSlug).toBe("shared-slug-name");
  });

  it("returns 0 when no unresolved rows match", async () => {
    const newPageId = randomUUID();
    await db.insert(knowledgePages).values({
      id: newPageId,
      companyId: companyA,
      slug: "no-matches-slug",
      title: "nm",
    });
    await db
      .insert(knowledgePageLinks)
      .values([{ fromId: fromPageA1, companyId: companyA, unresolvedSlug: "different", anchor: null }]);

    const count = await rebindUnresolvedLinks(db, {
      pageId: newPageId,
      companyId: companyA,
      slug: "no-matches-slug",
      aliases: [],
    });
    expect(count).toBe(0);
  });
});

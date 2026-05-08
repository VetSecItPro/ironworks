/**
 * Integration test for `backfillKnowledgeLinks` testable core.
 *
 * Seeds three pages where:
 *   - Page A's body links to `[[B]]` and `[[future]]` (1 resolved + 1 unresolved)
 *   - Page B exists but has no wikilinks
 *   - Page C's body links to `[[A]]` (1 resolved)
 *
 * Asserts after one run: 2 resolved + 1 unresolved row in knowledge_page_links.
 * Asserts a second run is a no-op (zero ops on the diff).
 *
 * Also covers: dry-run skips writes, frontmatter `aliases` round-trip,
 * parseArgs CLI surface.
 */

import { randomUUID } from "node:crypto";
import {
  companies,
  createDb,
  getEmbeddedPostgresTestSupport,
  knowledgePageLinks,
  knowledgePages,
  startEmbeddedPostgresTestDatabase,
} from "@ironworksai/db";
import { eq, isNotNull, isNull } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { backfillKnowledgeLinks, parseArgs } from "../../../scripts/backfill-knowledge-links.js";

const support = await getEmbeddedPostgresTestSupport();
const describeIfSupported = support.supported ? describe : describe.skip;

if (!support.supported) {
  console.warn(`Skipping backfill-knowledge-links integration test: ${support.reason ?? "unsupported"}`);
}

describeIfSupported("backfill-knowledge-links (integration)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("ironworks-backfill-links-");
    db = createDb(tempDb.connectionString);
    companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "backfill-links-co" });
  }, 120_000);

  afterEach(async () => {
    await db.delete(knowledgePageLinks);
    await db.delete(knowledgePages);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seed(): Promise<{ pageAId: string; pageBId: string; pageCId: string }> {
    const pageAId = randomUUID();
    const pageBId = randomUUID();
    const pageCId = randomUUID();

    await db.insert(knowledgePages).values([
      {
        id: pageAId,
        companyId,
        slug: "a",
        title: "Page A",
        body: "Links to [[b]] and [[future]] target.",
      },
      {
        id: pageBId,
        companyId,
        slug: "b",
        title: "Page B",
        body: "No links here.",
      },
      {
        id: pageCId,
        companyId,
        slug: "c",
        title: "Page C",
        body: "Refers back to [[a]].",
      },
    ]);

    return { pageAId, pageBId, pageCId };
  }

  it("populates resolved + unresolved edges and is idempotent on re-run", async () => {
    const { pageAId, pageCId } = await seed();

    const stats1 = await backfillKnowledgeLinks(db, { batchSize: 50 });

    expect(stats1.pagesProcessed).toBe(3);
    expect(stats1.linksInserted).toBe(3);
    expect(stats1.linksDeleted).toBe(0);

    const allLinks = await db.select().from(knowledgePageLinks);
    expect(allLinks).toHaveLength(3);

    const resolved = await db.select().from(knowledgePageLinks).where(isNotNull(knowledgePageLinks.toId));
    expect(resolved).toHaveLength(2);

    const unresolved = await db.select().from(knowledgePageLinks).where(isNull(knowledgePageLinks.toId));
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]!.unresolvedSlug).toBe("future");
    expect(unresolved[0]!.fromId).toBe(pageAId);

    // Page C → Page A edge resolved.
    const cLinks = await db.select().from(knowledgePageLinks).where(eq(knowledgePageLinks.fromId, pageCId));
    expect(cLinks).toHaveLength(1);
    expect(cLinks[0]!.toId).not.toBeNull();

    // Re-run: zero ops.
    const stats2 = await backfillKnowledgeLinks(db, { batchSize: 50 });
    expect(stats2.pagesProcessed).toBe(3);
    expect(stats2.linksInserted).toBe(0);
    expect(stats2.linksDeleted).toBe(0);

    const allLinks2 = await db.select().from(knowledgePageLinks);
    expect(allLinks2).toHaveLength(3);
  });

  it("persists frontmatter aliases into knowledge_pages.aliases and is idempotent", async () => {
    const pageId = randomUUID();
    await db.insert(knowledgePages).values({
      id: pageId,
      companyId,
      slug: "with-aliases",
      title: "With Aliases",
      body: "---\naliases:\n  - alt-name\n  - legacy-slug\n---\nbody text [[a]]\n",
    });
    // Also seed page "a" so the wikilink resolves (sanity).
    await db.insert(knowledgePages).values({
      id: randomUUID(),
      companyId,
      slug: "a",
      title: "A",
      body: "",
    });

    const stats1 = await backfillKnowledgeLinks(db, {});
    expect(stats1.aliasesUpdated).toBe(1);

    const [row] = await db.select().from(knowledgePages).where(eq(knowledgePages.id, pageId));
    expect(row!.aliases).toEqual(["alt-name", "legacy-slug"]);

    // Re-run is a no-op for aliases too.
    const stats2 = await backfillKnowledgeLinks(db, {});
    expect(stats2.aliasesUpdated).toBe(0);
  });

  it("dry-run reports counts but writes nothing", async () => {
    await seed();

    const stats = await backfillKnowledgeLinks(db, { dryRun: true });
    expect(stats.pagesProcessed).toBe(3);
    expect(stats.linksInserted).toBeGreaterThan(0); // would-be inserts

    const allLinks = await db.select().from(knowledgePageLinks);
    expect(allLinks).toHaveLength(0);
  });

  it("respects custom batch sizes", async () => {
    await seed();

    const stats = await backfillKnowledgeLinks(db, { batchSize: 1 });
    expect(stats.pagesProcessed).toBe(3);
    expect(stats.linksInserted).toBe(3);
  });
});

// ── pure CLI parsing (no DB needed) ──────────────────────────────────────

describe("backfill-knowledge-links parseArgs", () => {
  it("defaults to batch-size=50 and dry-run=false", () => {
    const opts = parseArgs([]);
    expect(opts.batchSize).toBe(50);
    expect(opts.dryRun).toBe(false);
  });

  it("parses both flags", () => {
    const opts = parseArgs(["--batch-size=25", "--dry-run"]);
    expect(opts.batchSize).toBe(25);
    expect(opts.dryRun).toBe(true);
  });

  it("rejects unknown args", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown argument/);
  });

  it("rejects non-positive batch-size", () => {
    expect(() => parseArgs(["--batch-size=0"])).toThrow(/Invalid --batch-size/);
    expect(() => parseArgs(["--batch-size=abc"])).toThrow(/Invalid --batch-size/);
  });
});

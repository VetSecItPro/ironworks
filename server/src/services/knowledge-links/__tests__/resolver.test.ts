import { randomUUID } from "node:crypto";
import { companies, createDb, knowledgePages } from "@ironworksai/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../../__tests__/helpers/embedded-postgres.js";
import { resolveLinks } from "../resolver.js";

const support = await getEmbeddedPostgresTestSupport();
const describeIfSupported = support.supported ? describe : describe.skip;

if (!support.supported) {
  console.warn(`Skipping resolver tests: ${support.reason ?? "unsupported"}`);
}

describeIfSupported("resolveLinks", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId!: string;
  let otherCompanyId!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("ironworks-knowlinks-resolver-");
    db = createDb(tempDb.connectionString);
    companyId = randomUUID();
    otherCompanyId = randomUUID();
    await db.insert(companies).values([
      { id: companyId, name: "co-a", issuePrefix: `RA${randomUUID().slice(0, 4)}` },
      { id: otherCompanyId, name: "co-b", issuePrefix: `RB${randomUUID().slice(0, 4)}` },
    ]);
  }, 60_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function insertPage(args: {
    companyId: string;
    slug: string;
    aliases?: string[];
    createdAt?: Date;
  }): Promise<string> {
    const id = randomUUID();
    await db.insert(knowledgePages).values({
      id,
      companyId: args.companyId,
      slug: args.slug,
      title: args.slug,
      aliases: args.aliases ?? [],
      ...(args.createdAt ? { createdAt: args.createdAt, updatedAt: args.createdAt } : {}),
    });
    return id;
  }

  it("returns empty for empty input", async () => {
    const result = await resolveLinks(db, companyId, []);
    expect(result).toEqual([]);
  });

  it("resolves a single slug match", async () => {
    const id = await insertPage({ companyId, slug: `single-${randomUUID()}` });
    const slug = (await db.select().from(knowledgePages))[0]; // existence check
    expect(slug).toBeDefined();

    const result = await resolveLinks(db, companyId, [{ slug: `nonexistent-${randomUUID()}`, anchor: null }]);
    expect(result[0]?.toId).toBeNull();

    const pageRows = await db.select({ slug: knowledgePages.slug }).from(knowledgePages);
    const targetSlug = pageRows.find((r) => r.slug.startsWith("single-"))?.slug;
    expect(targetSlug).toBeDefined();

    const hit = await resolveLinks(db, companyId, [{ slug: targetSlug as string, anchor: null }]);
    expect(hit).toEqual([{ slug: targetSlug, anchor: null, toId: id }]);
  });

  it("resolves via aliases", async () => {
    const aliasName = `alias-${randomUUID()}`;
    const id = await insertPage({
      companyId,
      slug: `aliased-${randomUUID()}`,
      aliases: [aliasName, "altname"],
    });
    const result = await resolveLinks(db, companyId, [{ slug: aliasName, anchor: "intro" }]);
    expect(result).toEqual([{ slug: aliasName, anchor: "intro", toId: id }]);
  });

  it("returns null toId for misses but preserves slug + anchor", async () => {
    const result = await resolveLinks(db, companyId, [
      { slug: `gone-${randomUUID()}`, anchor: null },
      { slug: `also-gone-${randomUUID()}`, anchor: "section" },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]?.toId).toBeNull();
    expect(result[1]?.toId).toBeNull();
    expect(result[1]?.anchor).toBe("section");
  });

  it("multi-alias collision: first-created page wins", async () => {
    const sharedAlias = `shared-${randomUUID()}`;
    const old = new Date("2020-01-01T00:00:00Z");
    const recent = new Date("2024-01-01T00:00:00Z");

    const winnerId = await insertPage({
      companyId,
      slug: `winner-${randomUUID()}`,
      aliases: [sharedAlias],
      createdAt: old,
    });
    await insertPage({
      companyId,
      slug: `loser-${randomUUID()}`,
      aliases: [sharedAlias],
      createdAt: recent,
    });

    const result = await resolveLinks(db, companyId, [{ slug: sharedAlias, anchor: null }]);
    expect(result[0]?.toId).toBe(winnerId);
  });

  it("excludes cross-tenant matches", async () => {
    const slug = `tenant-${randomUUID()}`;
    await insertPage({ companyId: otherCompanyId, slug });

    const result = await resolveLinks(db, companyId, [{ slug, anchor: null }]);
    expect(result[0]?.toId).toBeNull();
  });

  it("preserves order and anchor variants for the same slug", async () => {
    const slug = `multi-anchor-${randomUUID()}`;
    const id = await insertPage({ companyId, slug });

    const result = await resolveLinks(db, companyId, [
      { slug, anchor: null },
      { slug, anchor: "first" },
      { slug, anchor: "second" },
    ]);
    expect(result.map((r) => ({ anchor: r.anchor, toId: r.toId }))).toEqual([
      { anchor: null, toId: id },
      { anchor: "first", toId: id },
      { anchor: "second", toId: id },
    ]);
  });
});

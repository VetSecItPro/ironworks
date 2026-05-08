import { randomUUID } from "node:crypto";
import { companies, createDb, knowledgePageLinks, knowledgePages } from "@ironworksai/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../../__tests__/helpers/embedded-postgres.js";
import { getBacklinks, getNeighborhood } from "../queries.js";

const support = await getEmbeddedPostgresTestSupport();
const describeIfSupported = support.supported ? describe : describe.skip;

if (!support.supported) {
  console.warn(`Skipping queries tests: ${support.reason ?? "unsupported"}`);
}

describeIfSupported("knowledge-links queries", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("ironworks-knowlinks-queries-");
    db = createDb(tempDb.connectionString);
  }, 60_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  // Each test creates its own company namespace + clears state at end via DELETE.
  // Counter ensures unique issue_prefix (3 chars uppercased, unique per company).
  let coCounter = 0;
  function nextPrefix(): string {
    // Generate a 3-letter prefix from incrementing counter; 26^3 = 17576 unique.
    const n = coCounter++;
    const a = String.fromCharCode(65 + (Math.floor(n / 676) % 26));
    const b = String.fromCharCode(65 + (Math.floor(n / 26) % 26));
    const c = String.fromCharCode(65 + (n % 26));
    return `${a}${b}${c}`;
  }

  async function setup() {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: `co-${companyId.slice(0, 8)}`,
      issuePrefix: nextPrefix(),
    });
    return { companyId };
  }

  async function makePage(args: {
    companyId: string;
    slug: string;
    title?: string;
    documentType?: string | null;
    updatedAt?: Date;
  }) {
    const id = randomUUID();
    await db.insert(knowledgePages).values({
      id,
      companyId: args.companyId,
      slug: args.slug,
      title: args.title ?? args.slug,
      documentType: args.documentType ?? null,
      ...(args.updatedAt ? { updatedAt: args.updatedAt } : {}),
    });
    return id;
  }

  async function link(args: {
    companyId: string;
    fromId: string;
    toId?: string | null;
    unresolvedSlug?: string | null;
    anchor?: string | null;
  }) {
    await db.insert(knowledgePageLinks).values({
      companyId: args.companyId,
      fromId: args.fromId,
      toId: args.toId ?? null,
      unresolvedSlug: args.unresolvedSlug ?? null,
      anchor: args.anchor ?? null,
    });
  }

  describe("getBacklinks", () => {
    it("returns empty when no inbound links", async () => {
      const { companyId } = await setup();
      const target = await makePage({ companyId, slug: "lonely" });
      const result = await getBacklinks(db, { pageId: target, companyId });
      expect(result).toEqual([]);
    });

    it("returns 3 inbound links ordered by source updatedAt desc", async () => {
      const { companyId } = await setup();
      const target = await makePage({ companyId, slug: "target" });

      const oldest = await makePage({
        companyId,
        slug: "src-old",
        updatedAt: new Date("2025-01-01T00:00:00Z"),
      });
      const middle = await makePage({
        companyId,
        slug: "src-mid",
        updatedAt: new Date("2025-06-01T00:00:00Z"),
      });
      const newest = await makePage({
        companyId,
        slug: "src-new",
        documentType: "report",
        updatedAt: new Date("2025-12-01T00:00:00Z"),
      });

      await link({ companyId, fromId: oldest, toId: target });
      await link({ companyId, fromId: middle, toId: target });
      await link({ companyId, fromId: newest, toId: target, anchor: "intro" });

      const rows = await getBacklinks(db, { pageId: target, companyId });
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.pageId)).toEqual([newest, middle, oldest]);
      expect(rows[0]?.anchor).toBe("intro");
      expect(rows[0]?.documentType).toBe("report");
      expect(rows[0]?.slug).toBe("src-new");
    });

    it("excludes inbound links from a different company (cross-tenant)", async () => {
      const { companyId } = await setup();
      const { companyId: otherCo } = await setup();

      const target = await makePage({ companyId, slug: "shared-name" });
      const ownSrc = await makePage({ companyId, slug: "own-src" });
      const otherSrc = await makePage({ companyId: otherCo, slug: "other-src" });

      await link({ companyId, fromId: ownSrc, toId: target });
      // A row in another tenant whose to_id happens to point at the same UUID
      // would violate FK, so simulate cross-tenant by linking to an unrelated
      // page in their own tenant; backlinks for `target` should still be 1.
      const otherTarget = await makePage({ companyId: otherCo, slug: "other-target" });
      await link({ companyId: otherCo, fromId: otherSrc, toId: otherTarget });

      const rows = await getBacklinks(db, { pageId: target, companyId });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.pageId).toBe(ownSrc);
    });
  });

  describe("getNeighborhood", () => {
    it("hops=0 returns only the current node", async () => {
      const { companyId } = await setup();
      const a = await makePage({ companyId, slug: "a", documentType: "note" });
      const b = await makePage({ companyId, slug: "b" });
      await link({ companyId, fromId: a, toId: b });

      const result = await getNeighborhood(db, { pageId: a, companyId, hops: 0 });
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0]).toMatchObject({ id: a, isCurrent: true, documentType: "note" });
      expect(result.edges).toEqual([]);
    });

    it("hops=1 returns immediate in/out neighbors only", async () => {
      const { companyId } = await setup();
      const center = await makePage({ companyId, slug: "center" });
      const out = await makePage({ companyId, slug: "out" });
      const inbound = await makePage({ companyId, slug: "in" });
      const far = await makePage({ companyId, slug: "far" });

      await link({ companyId, fromId: center, toId: out });
      await link({ companyId, fromId: inbound, toId: center });
      // 2-hop edge that should NOT bring `far` in at hops=1.
      await link({ companyId, fromId: out, toId: far });

      const result = await getNeighborhood(db, { pageId: center, companyId, hops: 1 });
      const ids = result.nodes.map((n) => n.id).sort();
      expect(ids).toEqual([center, out, inbound].sort());
      expect(result.nodes.find((n) => n.id === center)?.isCurrent).toBe(true);
      // Edges only between nodes in the set.
      const edgeKeys = result.edges.map((e) => `${e.fromId}->${e.toId}`).sort();
      expect(edgeKeys).toEqual([`${center}->${out}`, `${inbound}->${center}`].sort());
    });

    it("hops=2 expands and dedupes nodes reached via multiple paths", async () => {
      const { companyId } = await setup();
      const center = await makePage({ companyId, slug: "center" });
      const mid1 = await makePage({ companyId, slug: "mid1" });
      const mid2 = await makePage({ companyId, slug: "mid2" });
      const far = await makePage({ companyId, slug: "far" });

      await link({ companyId, fromId: center, toId: mid1 });
      await link({ companyId, fromId: center, toId: mid2 });
      // far is reachable from BOTH mid1 and mid2 -- should appear once.
      await link({ companyId, fromId: mid1, toId: far });
      await link({ companyId, fromId: mid2, toId: far });

      const result = await getNeighborhood(db, { pageId: center, companyId, hops: 2 });
      const ids = result.nodes.map((n) => n.id).sort();
      expect(ids).toEqual([center, mid1, mid2, far].sort());
      expect(result.nodes.filter((n) => n.id === far)).toHaveLength(1);
    });

    it("includes unresolved outbound edges from current node only", async () => {
      const { companyId } = await setup();
      const center = await makePage({ companyId, slug: "center" });
      const neighbor = await makePage({ companyId, slug: "neighbor" });

      await link({ companyId, fromId: center, toId: neighbor });
      // Unresolved edge from CURRENT -- should appear.
      await link({ companyId, fromId: center, unresolvedSlug: "ghost-from-center" });
      // Unresolved edge from NEIGHBOR -- must NOT appear.
      await link({ companyId, fromId: neighbor, unresolvedSlug: "ghost-from-neighbor" });

      const result = await getNeighborhood(db, { pageId: center, companyId, hops: 1 });
      const unresolvedSlugs = result.edges.filter((e) => e.unresolvedSlug !== null).map((e) => e.unresolvedSlug);
      expect(unresolvedSlugs).toEqual(["ghost-from-center"]);
    });

    it("excludes nodes/edges from a different company", async () => {
      const { companyId } = await setup();
      const { companyId: otherCo } = await setup();

      const center = await makePage({ companyId, slug: "center" });
      const ownNeighbor = await makePage({ companyId, slug: "own-neighbor" });
      await link({ companyId, fromId: center, toId: ownNeighbor });

      // Other tenant chatter that must not bleed in.
      const otherCenter = await makePage({ companyId: otherCo, slug: "other-center" });
      const otherNeighbor = await makePage({ companyId: otherCo, slug: "other-neighbor" });
      await link({ companyId: otherCo, fromId: otherCenter, toId: otherNeighbor });

      const result = await getNeighborhood(db, { pageId: center, companyId, hops: 2 });
      const ids = result.nodes.map((n) => n.id).sort();
      expect(ids).toEqual([center, ownNeighbor].sort());
    });

    it("returns just self when page has no links at all", async () => {
      const { companyId } = await setup();
      const lone = await makePage({ companyId, slug: "lone" });
      const result = await getNeighborhood(db, { pageId: lone, companyId, hops: 2 });
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0]?.id).toBe(lone);
      expect(result.edges).toEqual([]);
    });

    it("caps neighborhood at 100 nodes and warns", async () => {
      const { companyId } = await setup();
      const center = await makePage({ companyId, slug: "cap-center" });

      // Wire 150 outbound 1-hop neighbors.
      const neighborIds: string[] = [];
      for (let i = 0; i < 150; i++) {
        const id = await makePage({ companyId, slug: `cap-n-${i}` });
        neighborIds.push(id);
        await link({ companyId, fromId: center, toId: id });
      }

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await getNeighborhood(db, { pageId: center, companyId, hops: 1 });
      expect(result.nodes).toHaveLength(100);
      // current is hop-0, so it's always included first.
      expect(result.nodes.find((n) => n.id === center)?.isCurrent).toBe(true);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("throws notFound for missing page", async () => {
      const { companyId } = await setup();
      const ghost = randomUUID();
      await expect(getNeighborhood(db, { pageId: ghost, companyId, hops: 1 })).rejects.toThrow(/not found/i);
    });

    it("throws notFound when page exists in a different tenant", async () => {
      const { companyId } = await setup();
      const { companyId: otherCo } = await setup();
      const otherPage = await makePage({ companyId: otherCo, slug: "elsewhere" });
      await expect(getNeighborhood(db, { pageId: otherPage, companyId, hops: 1 })).rejects.toThrow(/not found/i);
    });
  });
});

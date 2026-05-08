import { randomUUID } from "node:crypto";
import { companies, createDb, knowledgePageLinks, knowledgePages } from "@ironworksai/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../../__tests__/helpers/embedded-postgres.js";
import type { ResolvedLink } from "../resolver.js";
import { syncPageLinks } from "../sync.js";

const support = await getEmbeddedPostgresTestSupport();
const describeIfSupported = support.supported ? describe : describe.skip;

if (!support.supported) {
  console.warn(`Skipping sync tests: ${support.reason ?? "unsupported"}`);
}

describeIfSupported("syncPageLinks", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId!: string;
  let fromPageId!: string;
  let target1Id!: string;
  let target2Id!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("ironworks-knowlinks-sync-");
    db = createDb(tempDb.connectionString);
    companyId = randomUUID();
    fromPageId = randomUUID();
    target1Id = randomUUID();
    target2Id = randomUUID();

    await db.insert(companies).values({ id: companyId, name: "sync-co" });
    await db.insert(knowledgePages).values([
      { id: fromPageId, companyId, slug: "from", title: "from" },
      { id: target1Id, companyId, slug: "target-1", title: "target-1" },
      { id: target2Id, companyId, slug: "target-2", title: "target-2" },
    ]);
  }, 60_000);

  afterEach(async () => {
    await db.delete(knowledgePageLinks);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function listLinks() {
    return await db.select().from(knowledgePageLinks).where(eq(knowledgePageLinks.fromId, fromPageId));
  }

  it("inserts new links from empty state", async () => {
    const resolved: ResolvedLink[] = [
      { toId: target1Id, slug: "target-1", anchor: null },
      { toId: null, slug: "missing", anchor: null },
    ];
    const result = await syncPageLinks(db, { fromPageId, companyId, resolved });
    expect(result).toEqual({ inserted: 2, deleted: 0, unchanged: 0 });

    const rows = await listLinks();
    expect(rows).toHaveLength(2);

    const resolvedRow = rows.find((r) => r.toId !== null);
    expect(resolvedRow?.toId).toBe(target1Id);
    expect(resolvedRow?.unresolvedSlug).toBeNull();

    const unresolvedRow = rows.find((r) => r.toId === null);
    expect(unresolvedRow?.unresolvedSlug).toBe("missing");
  });

  it("deletes removed links", async () => {
    await syncPageLinks(db, {
      fromPageId,
      companyId,
      resolved: [
        { toId: target1Id, slug: "target-1", anchor: null },
        { toId: target2Id, slug: "target-2", anchor: null },
      ],
    });

    const result = await syncPageLinks(db, {
      fromPageId,
      companyId,
      resolved: [{ toId: target1Id, slug: "target-1", anchor: null }],
    });
    expect(result).toEqual({ inserted: 0, deleted: 1, unchanged: 1 });

    const rows = await listLinks();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.toId).toBe(target1Id);
  });

  it("rerun with same input is idempotent (no inserts, no deletes)", async () => {
    const resolved: ResolvedLink[] = [
      { toId: target1Id, slug: "target-1", anchor: null },
      { toId: target1Id, slug: "target-1", anchor: "intro" },
      { toId: null, slug: "ghost", anchor: null },
    ];
    await syncPageLinks(db, { fromPageId, companyId, resolved });
    const second = await syncPageLinks(db, { fromPageId, companyId, resolved });

    expect(second).toEqual({ inserted: 0, deleted: 0, unchanged: 3 });
    const rows = await listLinks();
    expect(rows).toHaveLength(3);
  });

  it("updates a mix of resolved + unresolved across runs", async () => {
    await syncPageLinks(db, {
      fromPageId,
      companyId,
      resolved: [
        { toId: target1Id, slug: "target-1", anchor: null },
        { toId: null, slug: "ghost", anchor: null },
      ],
    });

    // Replace ghost with target-2; keep target-1.
    const result = await syncPageLinks(db, {
      fromPageId,
      companyId,
      resolved: [
        { toId: target1Id, slug: "target-1", anchor: null },
        { toId: target2Id, slug: "target-2", anchor: null },
      ],
    });
    expect(result).toEqual({ inserted: 1, deleted: 1, unchanged: 1 });

    const rows = await listLinks();
    const ids = rows.map((r) => r.toId).sort();
    expect(ids).toEqual([target1Id, target2Id].sort());
  });

  it("treats anchor variants as distinct edges", async () => {
    const resolved: ResolvedLink[] = [
      { toId: target1Id, slug: "target-1", anchor: null },
      { toId: target1Id, slug: "target-1", anchor: "a" },
      { toId: target1Id, slug: "target-1", anchor: "b" },
    ];
    const result = await syncPageLinks(db, { fromPageId, companyId, resolved });
    expect(result.inserted).toBe(3);

    const rows = await listLinks();
    const anchors = rows.map((r) => r.anchor).sort((a, b) => String(a).localeCompare(String(b)));
    expect(anchors).toEqual([null, "a", "b"].sort((a, b) => String(a).localeCompare(String(b))));
  });

  it("handles empty resolved input by clearing existing links", async () => {
    await syncPageLinks(db, {
      fromPageId,
      companyId,
      resolved: [{ toId: target1Id, slug: "target-1", anchor: null }],
    });

    const result = await syncPageLinks(db, {
      fromPageId,
      companyId,
      resolved: [],
    });
    expect(result).toEqual({ inserted: 0, deleted: 1, unchanged: 0 });
    expect(await listLinks()).toHaveLength(0);
  });
});

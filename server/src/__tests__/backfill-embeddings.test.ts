/**
 * Integration test for the backfill script's testable core.
 *
 * Spins up an embedded postgres, seeds memory entries (some with embeddings,
 * some archived) and knowledge pages (some with embedded chunks already), then
 * asserts that backfillEmbeddings enqueues exactly the expected jobs and is
 * idempotent on re-run.
 */

import { randomUUID } from "node:crypto";
import {
  agentMemoryEntries,
  agents,
  chunkingJobs,
  companies,
  createDb,
  embeddingJobs,
  getEmbeddedPostgresTestSupport,
  knowledgeChunks,
  knowledgePages,
  startEmbeddedPostgresTestDatabase,
} from "@ironworksai/db";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { backfillEmbeddings, parseArgs } from "../../../scripts/backfill-embeddings.js";

const support = await getEmbeddedPostgresTestSupport();
const describeIfSupported = support.supported ? describe : describe.skip;

if (!support.supported) {
  console.warn(`Skipping backfill integration test on this host: ${support.reason ?? "unsupported environment"}`);
}

describeIfSupported("backfill-embeddings (integration)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId!: string;
  let agentId!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("ironworks-backfill-");
    db = createDb(tempDb.connectionString);
    companyId = randomUUID();
    agentId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "backfill-test-co" });
    await db.insert(agents).values({ id: agentId, companyId, name: "memory-backfill-agent" });
  }, 120_000);

  afterEach(async () => {
    await db.delete(embeddingJobs);
    await db.delete(chunkingJobs);
    await db.delete(knowledgeChunks);
    await db.delete(knowledgePages);
    await db.delete(agentMemoryEntries);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  // ── seeding helpers ────────────────────────────────────────────────────

  async function seedFixture(): Promise<{ pendingPageIds: string[] }> {
    // 5 memory entries:
    //   - 2 with embeddings already (should be SKIPPED)
    //   - 1 archived (should be SKIPPED)
    //   - 2 nullable + non-archived (should be ENQUEUED)
    const fakeEmbedding = new Array<number>(1536).fill(0.001);

    await db.insert(agentMemoryEntries).values([
      {
        id: randomUUID(),
        agentId,
        companyId,
        content: "embedded memory 1",
        embedding: fakeEmbedding,
      },
      {
        id: randomUUID(),
        agentId,
        companyId,
        content: "embedded memory 2",
        embedding: fakeEmbedding,
      },
      {
        id: randomUUID(),
        agentId,
        companyId,
        content: "archived nullable memory",
        archivedAt: new Date(),
      },
      { id: randomUUID(), agentId, companyId, content: "pending memory 1" },
      { id: randomUUID(), agentId, companyId, content: "pending memory 2" },
    ]);

    // 3 knowledge pages:
    //   - 1 with an embedded chunk already (should be SKIPPED)
    //   - 2 with no chunks (should be ENQUEUED)
    const pageWithChunkId = randomUUID();
    const pendingPageIds = [randomUUID(), randomUUID()];
    await db.insert(knowledgePages).values([
      { id: pageWithChunkId, companyId, slug: "with-chunks", title: "With Chunks", body: "x" },
      {
        id: pendingPageIds[0]!,
        companyId,
        slug: "pending-1",
        title: "Pending 1",
        body: "x",
      },
      {
        id: pendingPageIds[1]!,
        companyId,
        slug: "pending-2",
        title: "Pending 2",
        body: "x",
      },
    ]);

    // Pre-existing embedded chunk for the first page so the NOT EXISTS clause
    // skips it. Use a 768-d vector to match the column type.
    await db.insert(knowledgeChunks).values({
      id: randomUUID(),
      pageId: pageWithChunkId,
      companyId,
      anchor: "#section",
      heading: "Section",
      headingPath: "Page > Section",
      body: "section body",
      tokenCount: 10,
      orderNum: 1,
      sourceRevision: 1,
      embedding: new Array<number>(768).fill(0.001),
    });

    return { pendingPageIds };
  }

  // ── tests ──────────────────────────────────────────────────────────────

  it("enqueues only nullable + non-archived memories", async () => {
    await seedFixture();

    const stats = await backfillEmbeddings(db, {
      target: "memory",
      batchSize: 50,
      dryRun: false,
    });

    expect(stats.memoryEnqueued).toBe(2);
    expect(stats.chunksEnqueued).toBe(0);

    const jobs = await db.select().from(embeddingJobs);
    expect(jobs).toHaveLength(2);
    for (const job of jobs) {
      expect(job.targetType).toBe("memory");
      expect(job.status).toBe("pending");
      expect(job.companyId).toBe(companyId);
    }
  });

  it("enqueues only pages whose chunks are missing/unembedded", async () => {
    const { pendingPageIds } = await seedFixture();

    const stats = await backfillEmbeddings(db, {
      target: "chunks",
      batchSize: 50,
      dryRun: false,
    });

    expect(stats.chunksEnqueued).toBe(2);
    expect(stats.memoryEnqueued).toBe(0);

    const jobs = await db.select().from(chunkingJobs);
    expect(jobs).toHaveLength(2);
    const targetIds = jobs.map((j) => j.targetId).sort();
    expect(targetIds).toEqual([...pendingPageIds].sort());
  });

  it("target=both processes both queues in one pass", async () => {
    await seedFixture();

    const stats = await backfillEmbeddings(db, {
      target: "both",
      batchSize: 50,
      dryRun: false,
    });

    expect(stats.memoryEnqueued).toBe(2);
    expect(stats.chunksEnqueued).toBe(2);

    const eJobs = await db.select().from(embeddingJobs);
    const cJobs = await db.select().from(chunkingJobs);
    expect(eJobs).toHaveLength(2);
    expect(cJobs).toHaveLength(2);
  });

  it("is idempotent: re-running creates no duplicate job rows", async () => {
    await seedFixture();

    await backfillEmbeddings(db, { target: "both", batchSize: 50, dryRun: false });
    await backfillEmbeddings(db, { target: "both", batchSize: 50, dryRun: false });

    // Unique index on (target_type, target_id) means re-enqueue is a noop on
    // row count — the existing pending row is just reset in place.
    const eJobs = await db.select().from(embeddingJobs);
    const cJobs = await db.select().from(chunkingJobs);
    expect(eJobs).toHaveLength(2);
    expect(cJobs).toHaveLength(2);
    for (const job of [...eJobs, ...cJobs]) {
      expect(job.status).toBe("pending");
      expect(job.attempts).toBe(0);
    }
  });

  it("dry-run reports counts but enqueues nothing", async () => {
    await seedFixture();

    const stats = await backfillEmbeddings(db, {
      target: "both",
      batchSize: 50,
      dryRun: true,
    });

    expect(stats.dryRun).toBe(true);
    expect(stats.memoryEnqueued).toBe(2);
    expect(stats.chunksEnqueued).toBe(2);

    const eJobs = await db.select().from(embeddingJobs);
    const cJobs = await db.select().from(chunkingJobs);
    expect(eJobs).toHaveLength(0);
    expect(cJobs).toHaveLength(0);
  });

  it("respects custom batch sizes (correctness, not just defaults)", async () => {
    await seedFixture();

    // batchSize=1 forces multiple loop iterations; the result should be the
    // same set of enqueued rows.
    const stats = await backfillEmbeddings(db, {
      target: "memory",
      batchSize: 1,
      dryRun: false,
    });
    expect(stats.memoryEnqueued).toBe(2);

    const eJobs = await db.select().from(embeddingJobs);
    expect(eJobs).toHaveLength(2);
  });
});

// ── pure CLI parsing (no DB needed) ──────────────────────────────────────

describe("backfill-embeddings parseArgs", () => {
  it("defaults to target=both, batch-size=50, dry-run=false", () => {
    const opts = parseArgs([]);
    expect(opts.target).toBe("both");
    expect(opts.batchSize).toBe(50);
    expect(opts.dryRun).toBe(false);
  });

  it("parses all three flags", () => {
    const opts = parseArgs(["--target=memory", "--batch-size=25", "--dry-run"]);
    expect(opts.target).toBe("memory");
    expect(opts.batchSize).toBe(25);
    expect(opts.dryRun).toBe(true);
  });

  it("rejects unknown args", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown argument/);
  });

  it("rejects invalid target", () => {
    expect(() => parseArgs(["--target=garbage"])).toThrow(/Invalid --target/);
  });

  it("rejects non-positive batch-size", () => {
    expect(() => parseArgs(["--batch-size=0"])).toThrow(/Invalid --batch-size/);
    expect(() => parseArgs(["--batch-size=abc"])).toThrow(/Invalid --batch-size/);
  });
});

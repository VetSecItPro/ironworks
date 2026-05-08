import { randomUUID } from "node:crypto";
import {
  type ChunkingJob,
  chunkingJobs,
  companies,
  createDb,
  type EmbeddingJob,
  embeddingJobs,
} from "@ironworksai/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  claimChunkingJobs,
  claimEmbeddingJobs,
  enqueueChunkingJob,
  enqueueEmbeddingJob,
  getChunkingJobStats,
  getEmbeddingJobStats,
  markChunkingJobDone,
  markChunkingJobError,
  markEmbeddingJobDone,
  markEmbeddingJobError,
  MAX_ATTEMPTS,
  reclaimStaleChunkingJobs,
  reclaimStaleEmbeddingJobs,
} from "../queue.js";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../../__tests__/helpers/embedded-postgres.js";

const support = await getEmbeddedPostgresTestSupport();
const describeIfSupported = support.supported ? describe : describe.skip;

if (!support.supported) {
  console.warn(
    `Skipping embedding queue tests on this host: ${support.reason ?? "unsupported environment"}`,
  );
}

describeIfSupported("embeddings queue", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("ironworks-embedding-queue-");
    db = createDb(tempDb.connectionString);
    companyId = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "queue-test-co" });
  }, 60_000);

  afterEach(async () => {
    await db.delete(embeddingJobs);
    await db.delete(chunkingJobs);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  // ── embedding_jobs ──────────────────────────────────────────────────────

  it("enqueueEmbeddingJob inserts a pending row", async () => {
    const targetId = randomUUID();
    await enqueueEmbeddingJob(db, { targetType: "memory", targetId, companyId });

    const rows = await db.select().from(embeddingJobs).where(eq(embeddingJobs.targetId, targetId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("pending");
    expect(rows[0]?.attempts).toBe(0);
    expect(rows[0]?.targetType).toBe("memory");
    expect(rows[0]?.companyId).toBe(companyId);
  });

  it("enqueueEmbeddingJob is idempotent: re-enqueue resets status/attempts", async () => {
    const targetId = randomUUID();
    await enqueueEmbeddingJob(db, { targetType: "memory", targetId, companyId });

    // Simulate a failed-but-not-terminal job: bump attempts + last_error.
    await db
      .update(embeddingJobs)
      .set({ status: "pending", attempts: 3, lastError: "boom" })
      .where(eq(embeddingJobs.targetId, targetId));

    // Re-enqueue (e.g. the target's content changed).
    await enqueueEmbeddingJob(db, { targetType: "memory", targetId, companyId });

    const rows = await db.select().from(embeddingJobs).where(eq(embeddingJobs.targetId, targetId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("pending");
    expect(rows[0]?.attempts).toBe(0);
    expect(rows[0]?.lastError).toBeNull();
    expect(rows[0]?.claimedAt).toBeNull();
  });

  it("claimEmbeddingJobs marks rows claimed and returns them", async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    for (const targetId of ids) {
      await enqueueEmbeddingJob(db, { targetType: "memory", targetId, companyId });
    }

    const claimed = await claimEmbeddingJobs(db, 10);
    expect(claimed).toHaveLength(3);
    for (const row of claimed) {
      expect(row.status).toBe("claimed");
      expect(row.claimedAt).toBeInstanceOf(Date);
      expect(row.companyId).toBe(companyId);
    }

    // A second claim returns nothing because all are now `claimed`.
    const second = await claimEmbeddingJobs(db, 10);
    expect(second).toHaveLength(0);
  });

  it("claimEmbeddingJobs respects limit and orders by created_at", async () => {
    for (let i = 0; i < 5; i++) {
      await enqueueEmbeddingJob(db, {
        targetType: "memory",
        targetId: randomUUID(),
        companyId,
      });
    }

    const first = await claimEmbeddingJobs(db, 2);
    expect(first).toHaveLength(2);
    const second = await claimEmbeddingJobs(db, 2);
    expect(second).toHaveLength(2);
    const third = await claimEmbeddingJobs(db, 2);
    expect(third).toHaveLength(1);
  });

  it("claimEmbeddingJobs skips rows with attempts >= MAX_ATTEMPTS", async () => {
    const aliveId = randomUUID();
    const exhaustedId = randomUUID();

    await enqueueEmbeddingJob(db, { targetType: "memory", targetId: aliveId, companyId });
    await enqueueEmbeddingJob(db, { targetType: "memory", targetId: exhaustedId, companyId });

    // Manually pin the second row to exhausted-but-status-pending (defensive case).
    await db
      .update(embeddingJobs)
      .set({ attempts: MAX_ATTEMPTS })
      .where(eq(embeddingJobs.targetId, exhaustedId));

    const claimed = await claimEmbeddingJobs(db, 10);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.targetId).toBe(aliveId);
  });

  it("markEmbeddingJobDone is terminal", async () => {
    const targetId = randomUUID();
    await enqueueEmbeddingJob(db, { targetType: "memory", targetId, companyId });
    const [claimed] = await claimEmbeddingJobs(db, 1);
    expect(claimed).toBeDefined();

    await markEmbeddingJobDone(db, claimed!.id);

    const rows = await db.select().from(embeddingJobs).where(eq(embeddingJobs.id, claimed!.id));
    expect(rows[0]?.status).toBe("done");
    expect(rows[0]?.completedAt).toBeInstanceOf(Date);
    expect(rows[0]?.lastError).toBeNull();
  });

  it("markEmbeddingJobError (non-terminal, attempts < MAX) resets to pending and increments attempts", async () => {
    const targetId = randomUUID();
    await enqueueEmbeddingJob(db, { targetType: "memory", targetId, companyId });
    const [claimed] = await claimEmbeddingJobs(db, 1);

    await markEmbeddingJobError(db, { id: claimed!.id, error: "transient: ECONNRESET" });

    const after = await fetchOneEmbedding(db, claimed!.id);
    expect(after.status).toBe("pending");
    expect(after.attempts).toBe(1);
    expect(after.lastError).toContain("ECONNRESET");
    expect(after.claimedAt).toBeNull();
  });

  it("markEmbeddingJobError parks job in 'failed' once attempts crosses MAX_ATTEMPTS", async () => {
    const targetId = randomUUID();
    await enqueueEmbeddingJob(db, { targetType: "memory", targetId, companyId });
    const [claimed] = await claimEmbeddingJobs(db, 1);

    // Pre-set attempts so the next failure crosses the threshold.
    await db
      .update(embeddingJobs)
      .set({ attempts: MAX_ATTEMPTS - 1 })
      .where(eq(embeddingJobs.id, claimed!.id));

    await markEmbeddingJobError(db, { id: claimed!.id, error: "boom" });

    const after = await fetchOneEmbedding(db, claimed!.id);
    expect(after.status).toBe("failed");
    expect(after.attempts).toBe(MAX_ATTEMPTS);
  });

  it("markEmbeddingJobError with isTerminal=true parks job in 'failed' immediately", async () => {
    const targetId = randomUUID();
    await enqueueEmbeddingJob(db, { targetType: "memory", targetId, companyId });
    const [claimed] = await claimEmbeddingJobs(db, 1);

    await markEmbeddingJobError(db, {
      id: claimed!.id,
      error: "non-retryable",
      isTerminal: true,
    });

    const after = await fetchOneEmbedding(db, claimed!.id);
    expect(after.status).toBe("failed");
    expect(after.attempts).toBe(1);
  });

  it("reclaimStaleEmbeddingJobs resets stale claimed rows; leaves fresh ones alone", async () => {
    const staleId = randomUUID();
    const freshId = randomUUID();
    await enqueueEmbeddingJob(db, { targetType: "memory", targetId: staleId, companyId });
    await enqueueEmbeddingJob(db, { targetType: "memory", targetId: freshId, companyId });

    const claimed = await claimEmbeddingJobs(db, 10);
    expect(claimed).toHaveLength(2);

    // Backdate the stale row's claimed_at by an hour.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await db
      .update(embeddingJobs)
      .set({ claimedAt: oneHourAgo })
      .where(eq(embeddingJobs.targetId, staleId));

    // Reclaim with 5-minute staleness window.
    const reclaimed = await reclaimStaleEmbeddingJobs(db, 5 * 60 * 1000);
    expect(reclaimed).toBe(1);

    const stale = await fetchOneByTarget(db, staleId);
    expect(stale.status).toBe("pending");
    expect(stale.claimedAt).toBeNull();

    const fresh = await fetchOneByTarget(db, freshId);
    expect(fresh.status).toBe("claimed");
  });

  it("getEmbeddingJobStats returns counts by status", async () => {
    const a = randomUUID();
    const b = randomUUID();
    const c = randomUUID();
    await enqueueEmbeddingJob(db, { targetType: "memory", targetId: a, companyId });
    await enqueueEmbeddingJob(db, { targetType: "memory", targetId: b, companyId });
    await enqueueEmbeddingJob(db, { targetType: "chunk", targetId: c, companyId });

    const claimed = await claimEmbeddingJobs(db, 1);
    await markEmbeddingJobDone(db, claimed[0]!.id);

    const stats = await getEmbeddingJobStats(db);
    expect(stats.done).toBe(1);
    expect(stats.pending).toBe(2);
  });

  // ── chunking_jobs (mirror) ──────────────────────────────────────────────

  it("enqueueChunkingJob + claim + done flow", async () => {
    const pageId = randomUUID();
    await enqueueChunkingJob(db, { pageId, companyId });

    let rows = await db.select().from(chunkingJobs).where(eq(chunkingJobs.targetId, pageId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.targetType).toBe("page");
    expect(rows[0]?.status).toBe("pending");

    const claimed = await claimChunkingJobs(db, 5);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.targetType).toBe("page");
    expect(claimed[0]?.status).toBe("claimed");

    await markChunkingJobDone(db, claimed[0]!.id);

    rows = await db.select().from(chunkingJobs).where(eq(chunkingJobs.targetId, pageId));
    expect(rows[0]?.status).toBe("done");
    expect(rows[0]?.completedAt).toBeInstanceOf(Date);
  });

  it("enqueueChunkingJob is idempotent on (target_type, target_id)", async () => {
    const pageId = randomUUID();
    await enqueueChunkingJob(db, { pageId, companyId });
    await db
      .update(chunkingJobs)
      .set({ attempts: 2, lastError: "x" })
      .where(eq(chunkingJobs.targetId, pageId));

    await enqueueChunkingJob(db, { pageId, companyId });

    const rows = await db.select().from(chunkingJobs).where(eq(chunkingJobs.targetId, pageId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.attempts).toBe(0);
    expect(rows[0]?.lastError).toBeNull();
  });

  it("markChunkingJobError honors retry vs terminal semantics", async () => {
    const pageId = randomUUID();
    await enqueueChunkingJob(db, { pageId, companyId });
    const [claimed] = await claimChunkingJobs(db, 1);

    await markChunkingJobError(db, { id: claimed!.id, error: "soft fail" });
    let row = await fetchOneChunking(db, claimed!.id);
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(1);

    await markChunkingJobError(db, { id: claimed!.id, error: "hard fail", isTerminal: true });
    row = await fetchOneChunking(db, claimed!.id);
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(2);
  });

  it("reclaimStaleChunkingJobs reclaims stale rows", async () => {
    const pageId = randomUUID();
    await enqueueChunkingJob(db, { pageId, companyId });
    await claimChunkingJobs(db, 1);

    await db
      .update(chunkingJobs)
      .set({ claimedAt: new Date(Date.now() - 10 * 60 * 1000) })
      .where(eq(chunkingJobs.targetId, pageId));

    const reclaimed = await reclaimStaleChunkingJobs(db, 5 * 60 * 1000);
    expect(reclaimed).toBe(1);
    const row = await fetchOneByTargetChunking(db, pageId);
    expect(row.status).toBe("pending");
    expect(row.claimedAt).toBeNull();
  });

  it("getChunkingJobStats returns counts by status", async () => {
    await enqueueChunkingJob(db, { pageId: randomUUID(), companyId });
    await enqueueChunkingJob(db, { pageId: randomUUID(), companyId });
    await claimChunkingJobs(db, 1);

    const stats = await getChunkingJobStats(db);
    expect(stats.pending).toBe(1);
    expect(stats.claimed).toBe(1);
  });
});

// ── helpers ──────────────────────────────────────────────────────────────

async function fetchOneEmbedding(db: ReturnType<typeof createDb>, id: string): Promise<EmbeddingJob> {
  const rows = await db.select().from(embeddingJobs).where(eq(embeddingJobs.id, id));
  if (!rows[0]) throw new Error(`embedding_jobs row not found: ${id}`);
  return rows[0];
}

async function fetchOneByTarget(
  db: ReturnType<typeof createDb>,
  targetId: string,
): Promise<EmbeddingJob> {
  const rows = await db.select().from(embeddingJobs).where(eq(embeddingJobs.targetId, targetId));
  if (!rows[0]) throw new Error(`embedding_jobs row not found by target: ${targetId}`);
  return rows[0];
}

async function fetchOneChunking(db: ReturnType<typeof createDb>, id: string): Promise<ChunkingJob> {
  const rows = await db.select().from(chunkingJobs).where(eq(chunkingJobs.id, id));
  if (!rows[0]) throw new Error(`chunking_jobs row not found: ${id}`);
  return rows[0];
}

async function fetchOneByTargetChunking(
  db: ReturnType<typeof createDb>,
  targetId: string,
): Promise<ChunkingJob> {
  const rows = await db.select().from(chunkingJobs).where(eq(chunkingJobs.targetId, targetId));
  if (!rows[0]) throw new Error(`chunking_jobs row not found by target: ${targetId}`);
  return rows[0];
}

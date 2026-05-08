/**
 * Durable embedding + chunking job queue.
 *
 * Backed by `embedding_jobs` and `chunking_jobs` tables (see
 * packages/db/src/schema/{embedding_jobs,chunking_jobs}.ts).
 *
 * Status lifecycle (mirrors the schema comment):
 *
 *   pending -> claimed -> done | failed
 *                      \-> pending_provider (soft retry; provider unreachable)
 *
 * Concurrency: `claim*` uses `FOR UPDATE SKIP LOCKED` so multiple worker
 * processes can poll the same queue without stepping on each other.
 *
 * Idempotent enqueue: the unique index on (target_type, target_id) means
 * re-enqueueing a target whose content changed simply resets the existing
 * job to `pending` with attempts=0. The worker will re-process it.
 *
 * Retries: a job that fails non-terminally is reset to `pending` with
 * `attempts++`. Once attempts crosses MAX_ATTEMPTS the job is parked in
 * the terminal `failed` state and stops being claimed.
 */

import { chunkingJobs, type Db, embeddingJobs } from "@ironworksai/db";
import { and, eq, lt, sql } from "drizzle-orm";

export type EmbeddingJobTarget = "memory" | "chunk";

export type EmbeddingJobRow = typeof embeddingJobs.$inferSelect;
export type ChunkingJobRow = typeof chunkingJobs.$inferSelect;

/** Maximum retry attempts before a job is parked in terminal `failed`. */
export const MAX_ATTEMPTS = 5;

/** Default staleness window for a `claimed` row whose worker died. */
const DEFAULT_STALE_MS = 5 * 60 * 1000;

// ── enqueue ────────────────────────────────────────────────────────────────

/**
 * Enqueue an embedding job. Idempotent on (target_type, target_id):
 * re-enqueueing an existing job resets it to `pending` with `attempts=0`,
 * `last_error=NULL`, `claimed_at=NULL`. This is the path used when a
 * memory or chunk's content is updated and embedding must be regenerated.
 */
export async function enqueueEmbeddingJob(
  db: Db,
  args: { targetType: EmbeddingJobTarget; targetId: string; companyId: string },
): Promise<void> {
  await db
    .insert(embeddingJobs)
    .values({
      targetType: args.targetType,
      targetId: args.targetId,
      companyId: args.companyId,
      status: "pending",
      attempts: 0,
    })
    .onConflictDoUpdate({
      // Matches the unique index `embedding_jobs_target_uq` on (target_type, target_id).
      target: [embeddingJobs.targetType, embeddingJobs.targetId],
      set: {
        status: "pending",
        attempts: 0,
        lastError: null,
        claimedAt: null,
        completedAt: null,
        // companyId is intentionally not overwritten on re-enqueue; the
        // (target_type, target_id) tuple already resolves to a single
        // tenant via the underlying row, so the original companyId is
        // authoritative.
      },
    });
}

/**
 * Enqueue a chunking job. Mirrors enqueueEmbeddingJob but for
 * `knowledge_pages` rows. `targetType` is always `'page'` today; we keep
 * the column for symmetry with embedding_jobs and to make future target
 * kinds (e.g. `'document'`) cheap.
 */
export async function enqueueChunkingJob(db: Db, args: { pageId: string; companyId: string }): Promise<void> {
  await db
    .insert(chunkingJobs)
    .values({
      targetType: "page",
      targetId: args.pageId,
      companyId: args.companyId,
      status: "pending",
      attempts: 0,
    })
    .onConflictDoUpdate({
      target: [chunkingJobs.targetType, chunkingJobs.targetId],
      set: {
        status: "pending",
        attempts: 0,
        lastError: null,
        claimedAt: null,
        completedAt: null,
      },
    });
}

// ── claim ──────────────────────────────────────────────────────────────────

/**
 * Atomically claim up to `limit` pending embedding jobs. Uses
 * `FOR UPDATE SKIP LOCKED` so concurrent workers never claim the same row.
 * Sets status='claimed', claimed_at=now() on the returned rows.
 *
 * Jobs whose attempts have already crossed MAX_ATTEMPTS are skipped - they
 * should already be in status='failed', but we filter defensively in case
 * the markError path was bypassed.
 */
export async function claimEmbeddingJobs(db: Db, limit: number): Promise<EmbeddingJobRow[]> {
  if (limit <= 0) return [];
  const result = await db.execute(sql`
    UPDATE embedding_jobs
    SET status = 'claimed', claimed_at = now()
    WHERE id IN (
      SELECT id FROM embedding_jobs
      WHERE status = 'pending' AND attempts < ${MAX_ATTEMPTS}
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
  return mapEmbeddingRows(result);
}

export async function claimChunkingJobs(db: Db, limit: number): Promise<ChunkingJobRow[]> {
  if (limit <= 0) return [];
  const result = await db.execute(sql`
    UPDATE chunking_jobs
    SET status = 'claimed', claimed_at = now()
    WHERE id IN (
      SELECT id FROM chunking_jobs
      WHERE status = 'pending' AND attempts < ${MAX_ATTEMPTS}
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
  return mapChunkingRows(result);
}

// ── done ───────────────────────────────────────────────────────────────────

export async function markEmbeddingJobDone(db: Db, id: string): Promise<void> {
  await db
    .update(embeddingJobs)
    .set({
      status: "done",
      completedAt: new Date(),
      lastError: null,
    })
    .where(eq(embeddingJobs.id, id));
}

export async function markChunkingJobDone(db: Db, id: string): Promise<void> {
  await db
    .update(chunkingJobs)
    .set({
      status: "done",
      completedAt: new Date(),
      lastError: null,
    })
    .where(eq(chunkingJobs.id, id));
}

// ── error ──────────────────────────────────────────────────────────────────

/**
 * Mark a job failed. If `isTerminal` is true OR the incremented attempt
 * count has reached MAX_ATTEMPTS, the job is parked in `failed` (terminal).
 * Otherwise it is reset to `pending` so the next claim can pick it up.
 *
 * The attempts counter is always incremented - a terminal-flag failure
 * still consumes an attempt so ops can read attempts as "tries before
 * we gave up".
 */
export async function markEmbeddingJobError(
  db: Db,
  args: { id: string; error: string; isTerminal?: boolean },
): Promise<void> {
  const truncated = truncateError(args.error);
  await db.execute(sql`
    UPDATE embedding_jobs
    SET
      attempts = attempts + 1,
      last_error = ${truncated},
      claimed_at = NULL,
      status = CASE
        WHEN ${args.isTerminal ?? false} THEN 'failed'
        WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN 'failed'
        ELSE 'pending'
      END
    WHERE id = ${args.id}
  `);
}

export async function markChunkingJobError(
  db: Db,
  args: { id: string; error: string; isTerminal?: boolean },
): Promise<void> {
  const truncated = truncateError(args.error);
  await db.execute(sql`
    UPDATE chunking_jobs
    SET
      attempts = attempts + 1,
      last_error = ${truncated},
      claimed_at = NULL,
      status = CASE
        WHEN ${args.isTerminal ?? false} THEN 'failed'
        WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN 'failed'
        ELSE 'pending'
      END
    WHERE id = ${args.id}
  `);
}

// ── reclaim stale ──────────────────────────────────────────────────────────

/**
 * Reset `claimed` jobs whose worker died (claimed_at older than `staleMs`)
 * back to `pending` so they can be re-claimed. Called once per worker tick
 * before claim. Returns the count of reclaimed rows.
 */
export async function reclaimStaleEmbeddingJobs(db: Db, staleMs: number = DEFAULT_STALE_MS): Promise<number> {
  const cutoff = new Date(Date.now() - staleMs);
  const result = await db
    .update(embeddingJobs)
    .set({ status: "pending", claimedAt: null })
    .where(and(eq(embeddingJobs.status, "claimed"), lt(embeddingJobs.claimedAt, cutoff)))
    .returning({ id: embeddingJobs.id });
  return result.length;
}

export async function reclaimStaleChunkingJobs(db: Db, staleMs: number = DEFAULT_STALE_MS): Promise<number> {
  const cutoff = new Date(Date.now() - staleMs);
  const result = await db
    .update(chunkingJobs)
    .set({ status: "pending", claimedAt: null })
    .where(and(eq(chunkingJobs.status, "claimed"), lt(chunkingJobs.claimedAt, cutoff)))
    .returning({ id: chunkingJobs.id });
  return result.length;
}

// ── stats ──────────────────────────────────────────────────────────────────

/**
 * Counts of jobs grouped by status. Used by /metrics + ops queries.
 * Returns a plain `{ status: count }` map. Statuses with zero rows are
 * omitted (callers should default missing keys to 0).
 */
export async function getEmbeddingJobStats(db: Db): Promise<Record<string, number>> {
  const rows = await db
    .select({
      status: embeddingJobs.status,
      count: sql<number>`count(*)::int`,
    })
    .from(embeddingJobs)
    .groupBy(embeddingJobs.status);
  return collectStats(rows);
}

export async function getChunkingJobStats(db: Db): Promise<Record<string, number>> {
  const rows = await db
    .select({
      status: chunkingJobs.status,
      count: sql<number>`count(*)::int`,
    })
    .from(chunkingJobs)
    .groupBy(chunkingJobs.status);
  return collectStats(rows);
}

// ── helpers ────────────────────────────────────────────────────────────────

function collectStats(rows: ReadonlyArray<{ status: string; count: number }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    out[row.status] = Number(row.count);
  }
  return out;
}

/** Cap free-text errors so a runaway stack trace can't blow the row size. */
function truncateError(message: string): string {
  const MAX = 2000;
  return message.length > MAX ? `${message.slice(0, MAX)}…` : message;
}

/**
 * `db.execute(sql\`...RETURNING *\`)` returns a driver-shaped row set
 * (snake_case columns). Coerce to the camelCased schema row type.
 */
type RawEmbeddingRow = {
  id: string;
  target_type: string;
  target_id: string;
  company_id: string;
  status: string;
  attempts: number;
  last_error: string | null;
  claimed_at: Date | string | null;
  completed_at: Date | string | null;
  created_at: Date | string;
};

type RawChunkingRow = RawEmbeddingRow;

function mapEmbeddingRows(result: unknown): EmbeddingJobRow[] {
  const rows = extractRows(result);
  return rows.map((r): EmbeddingJobRow => {
    const raw = r as RawEmbeddingRow;
    return {
      id: raw.id,
      targetType: raw.target_type,
      targetId: raw.target_id,
      companyId: raw.company_id,
      status: raw.status,
      attempts: Number(raw.attempts),
      lastError: raw.last_error,
      claimedAt: toDate(raw.claimed_at),
      completedAt: toDate(raw.completed_at),
      createdAt: toDate(raw.created_at) ?? new Date(0),
    };
  });
}

function mapChunkingRows(result: unknown): ChunkingJobRow[] {
  const rows = extractRows(result);
  return rows.map((r): ChunkingJobRow => {
    const raw = r as RawChunkingRow;
    return {
      id: raw.id,
      targetType: raw.target_type,
      targetId: raw.target_id,
      companyId: raw.company_id,
      status: raw.status,
      attempts: Number(raw.attempts),
      lastError: raw.last_error,
      claimedAt: toDate(raw.claimed_at),
      completedAt: toDate(raw.completed_at),
      createdAt: toDate(raw.created_at) ?? new Date(0),
    };
  });
}

/**
 * `db.execute()` returns different shapes across drivers (node-postgres
 * returns `{ rows: [...] }`; some drivers return the array directly).
 * Normalize both shapes here.
 */
function extractRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: unknown[] }).rows;
  }
  return [];
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

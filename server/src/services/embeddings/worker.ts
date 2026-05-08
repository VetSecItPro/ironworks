/**
 * Embedding worker - drains the embedding_jobs + chunking_jobs queues.
 *
 * Single tick (`tickEmbeddingWorker`):
 *   1. Reclaim stale `claimed` rows (worker died mid-flight).
 *   2. If memory provider is NoOp, log warn-once and skip the memory queue
 *      (chunking is independent and may still be configured).
 *   3. Claim a batch of memory jobs; load source rows from
 *      `agent_memory_entries`; mark missing targets terminal-failed
 *      (`target_gone`); embed-batch the survivors; on success persist the
 *      vector + mark the job done; on provider error mark each job failed
 *      with retryable vs terminal classification driven by error text.
 *   4. Same for chunking jobs, but the source is a `knowledge_pages` row
 *      whose body we re-parse via `parsePlaybook` (the existing playbook
 *      chunker - see ./playbook-chunker.ts) and re-insert into
 *      `knowledge_chunks` (DELETE-then-INSERT for idempotency).
 *
 * The worker is intentionally stateless - the only mutable state lives on
 * the queue rows themselves. This makes it safe to run multiple worker
 * processes (the queue uses `FOR UPDATE SKIP LOCKED` to avoid double-claim)
 * and trivial to restart on crash.
 */

import { type Db, agentMemoryEntries, knowledgeChunks, knowledgePages } from "@ironworksai/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "../../middleware/logger.js";
import {
  embeddingJobsFailedTotal,
  embeddingProviderErrorsTotal,
  embeddingProviderLatency,
} from "../../observability/metrics.js";
import { parsePlaybook } from "../playbook-chunker.js";
import { getChunkProvider, getMemoryProvider } from "./factory.js";
import type { EmbeddingProvider } from "./provider.js";
import {
  type ChunkingJobRow,
  claimChunkingJobs,
  claimEmbeddingJobs,
  type EmbeddingJobRow,
  markChunkingJobDone,
  markChunkingJobError,
  markEmbeddingJobDone,
  markEmbeddingJobError,
  reclaimStaleChunkingJobs,
  reclaimStaleEmbeddingJobs,
} from "./queue.js";

const DEFAULT_BATCH_SIZE = 25;

export interface WorkerConfig {
  /** Jobs claimed per tick per queue. Default 25. */
  batchSize?: number;
  /** Memory provider override (default: getMemoryProvider()). */
  memoryProvider?: EmbeddingProvider;
  /** Chunk provider override (default: getChunkProvider()). */
  chunkProvider?: EmbeddingProvider;
}

export interface WorkerTickResult {
  memoryDone: number;
  memoryFailed: number;
  chunkDone: number;
  chunkFailed: number;
  reclaimed: number;
}

// Warn-once dedupe for noop-provider skips (separate per-call-site). Module-level
// so test harnesses can reset it if needed.
const noopWarned = new Set<string>();

/** Test-only: clear the warn-once memo. */
export function __resetWorkerNoopWarnings(): void {
  noopWarned.clear();
}

/**
 * Run a single tick across both queues. Returns counts so callers (the
 * scheduler / tests / metrics) can observe progress.
 */
export async function tickEmbeddingWorker(
  db: Db,
  config: WorkerConfig = {},
): Promise<WorkerTickResult> {
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
  const memoryProvider = config.memoryProvider ?? getMemoryProvider();
  const chunkProvider = config.chunkProvider ?? getChunkProvider();

  // 1. Reclaim stale rows on both queues so dead-worker jobs come back into play.
  const reclaimedMem = await reclaimStaleEmbeddingJobs(db).catch((err) => {
    logger.error({ err }, "embeddings worker: reclaim stale embedding jobs failed");
    return 0;
  });
  const reclaimedChunk = await reclaimStaleChunkingJobs(db).catch((err) => {
    logger.error({ err }, "embeddings worker: reclaim stale chunking jobs failed");
    return 0;
  });

  // 2. Memory queue.
  const memResult = await processMemoryQueue(db, memoryProvider, batchSize);

  // 3. Chunking queue (independent - runs even if memory provider is noop).
  const chunkResult = await processChunkingQueue(db, chunkProvider, batchSize);

  return {
    memoryDone: memResult.done,
    memoryFailed: memResult.failed,
    chunkDone: chunkResult.done,
    chunkFailed: chunkResult.failed,
    reclaimed: reclaimedMem + reclaimedChunk,
  };
}

// ── memory queue ──────────────────────────────────────────────────────────

async function processMemoryQueue(
  db: Db,
  provider: EmbeddingProvider,
  batchSize: number,
): Promise<{ done: number; failed: number }> {
  if (provider.name === "noop") {
    warnOnce("memory", "embeddings worker: memory provider is noop - skipping memory queue");
    return { done: 0, failed: 0 };
  }

  const claimed = await claimEmbeddingJobs(db, batchSize).catch((err) => {
    logger.error({ err }, "embeddings worker: claim memory jobs failed");
    return [] as EmbeddingJobRow[];
  });
  if (claimed.length === 0) return { done: 0, failed: 0 };

  // Only `target_type='memory'` is expected on this queue today; defensively
  // scope the source-row fetch to memory targets.
  const memoryJobs = claimed.filter((j) => j.targetType === "memory");
  const otherJobs = claimed.filter((j) => j.targetType !== "memory");

  let done = 0;
  let failed = 0;

  // Mark unexpected target types terminal-failed so they don't re-loop forever.
  for (const job of otherJobs) {
    await markEmbeddingJobError(db, {
      id: job.id,
      error: `unsupported target_type for embedding queue: ${job.targetType}`,
      isTerminal: true,
    });
    embeddingJobsFailedTotal.inc({ target_type: job.targetType });
    failed += 1;
  }

  if (memoryJobs.length === 0) return { done, failed };

  const targetIds = memoryJobs.map((j) => j.targetId);
  const sourceRows = await db
    .select({ id: agentMemoryEntries.id, content: agentMemoryEntries.content })
    .from(agentMemoryEntries)
    .where(inArray(agentMemoryEntries.id, targetIds));
  const sourceById = new Map(sourceRows.map((r) => [r.id, r.content]));

  // Partition into "still exists" vs "target gone since enqueue".
  const live: { job: EmbeddingJobRow; content: string }[] = [];
  for (const job of memoryJobs) {
    const content = sourceById.get(job.targetId);
    if (content === undefined) {
      await markEmbeddingJobError(db, { id: job.id, error: "target_gone", isTerminal: true });
      embeddingJobsFailedTotal.inc({ target_type: "memory" });
      failed += 1;
      continue;
    }
    live.push({ job, content });
  }

  if (live.length === 0) return { done, failed };

  const texts = live.map((x) => x.content);
  let embeddings: number[][];
  try {
    embeddings = await timeProvider(provider, "embedBatch", () => provider.embedBatch(texts));
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    const errorClass = classifyError(message);
    embeddingProviderErrorsTotal.inc({
      provider: provider.name,
      model: provider.model,
      error_class: errorClass,
    });
    const isTerminal = isTerminalErrorClass(errorClass);
    logger.warn(
      { err: message, jobCount: live.length, errorClass, provider: provider.name },
      "embeddings worker: memory batch failed",
    );
    for (const { job } of live) {
      await markEmbeddingJobError(db, { id: job.id, error: message, isTerminal });
      if (isTerminal) embeddingJobsFailedTotal.inc({ target_type: "memory" });
      failed += 1;
    }
    return { done, failed };
  }

  if (embeddings.length !== live.length) {
    // Provider returned a mismatched batch - treat the whole batch as a soft fail.
    const msg = `embedBatch returned ${embeddings.length} vectors for ${live.length} inputs`;
    embeddingProviderErrorsTotal.inc({
      provider: provider.name,
      model: provider.model,
      error_class: "other",
    });
    for (const { job } of live) {
      await markEmbeddingJobError(db, { id: job.id, error: msg });
      failed += 1;
    }
    return { done, failed };
  }

  // Persist embeddings + mark each job done. We update each row individually
  // (the alternative would be a giant CASE-WHEN UPDATE) - the per-row UPDATEs
  // are cheap relative to the embed call we just made.
  for (let i = 0; i < live.length; i++) {
    const { job } = live[i];
    const vec = embeddings[i];
    try {
      await db
        .update(agentMemoryEntries)
        .set({ embedding: vec })
        .where(eq(agentMemoryEntries.id, job.targetId));
      await markEmbeddingJobDone(db, job.id);
      done += 1;
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      logger.error({ err: message, jobId: job.id }, "embeddings worker: persist memory embedding failed");
      await markEmbeddingJobError(db, { id: job.id, error: `persist failed: ${message}` });
      failed += 1;
    }
  }

  return { done, failed };
}

// ── chunking queue ────────────────────────────────────────────────────────

async function processChunkingQueue(
  db: Db,
  provider: EmbeddingProvider,
  batchSize: number,
): Promise<{ done: number; failed: number }> {
  // Chunking always runs (even if provider is noop); the chunk rows still
  // get inserted, embeddings just stay null and FTS handles retrieval.
  const claimed = await claimChunkingJobs(db, batchSize).catch((err) => {
    logger.error({ err }, "embeddings worker: claim chunking jobs failed");
    return [] as ChunkingJobRow[];
  });
  if (claimed.length === 0) return { done: 0, failed: 0 };

  let done = 0;
  let failed = 0;

  for (const job of claimed) {
    try {
      await processOneChunkingJob(db, provider, job);
      await markChunkingJobDone(db, job.id);
      done += 1;
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      // 'target_gone' is terminal; everything else is retryable (the queue
      // will park it terminal once attempts crosses MAX).
      const isTerminal = message === "target_gone";
      if (!isTerminal) {
        const errorClass = classifyError(message);
        embeddingProviderErrorsTotal.inc({
          provider: provider.name,
          model: provider.model,
          error_class: errorClass,
        });
      }
      logger.warn(
        { err: message, jobId: job.id, pageId: job.targetId },
        "embeddings worker: chunking job failed",
      );
      await markChunkingJobError(db, { id: job.id, error: message, isTerminal });
      if (isTerminal) embeddingJobsFailedTotal.inc({ target_type: "page" });
      failed += 1;
    }
  }

  return { done, failed };
}

/**
 * Re-chunk one knowledge_pages row: delete prior chunks → parse → insert
 * fresh chunks → embed each chunk (best-effort; embedding failures throw
 * to surface as a job error).
 *
 * Reuses the existing `parsePlaybook` splitter from playbook-chunker.ts so
 * worker output stays format-compatible with the legacy reindex path.
 */
async function processOneChunkingJob(
  db: Db,
  provider: EmbeddingProvider,
  job: ChunkingJobRow,
): Promise<void> {
  const [page] = await db
    .select()
    .from(knowledgePages)
    .where(eq(knowledgePages.id, job.targetId))
    .limit(1);
  if (!page) {
    throw new Error("target_gone");
  }

  const parsed = parsePlaybook(page.body);

  // Repeatable: drop prior chunks first.
  await db.delete(knowledgeChunks).where(eq(knowledgeChunks.pageId, page.id));

  if (parsed.chunks.length === 0) {
    // Page has no H2 sections - nothing to insert; still a success.
    return;
  }

  const fm = parsed.frontmatter;
  const baseRows = parsed.chunks.map((chunk) => ({
    pageId: page.id,
    companyId: page.companyId,
    department: (typeof fm.department === "string" ? fm.department : null) ?? page.department ?? null,
    ownerRole: typeof fm.owner_role === "string" ? fm.owner_role : null,
    audience: typeof fm.audience === "string" ? fm.audience : null,
    documentType:
      (typeof fm.document_type === "string" ? fm.document_type : null) ?? page.documentType ?? null,
    anchor: chunk.anchor,
    heading: chunk.heading,
    headingPath: chunk.headingPath,
    body: chunk.body,
    tokenCount: chunk.tokenCount,
    orderNum: chunk.orderNum,
    sourceRevision: page.revisionNumber,
  }));

  // Insert chunk rows first (without embeddings); then embed and update each
  // - matches the legacy reindexPage shape so partial failures still leave
  // FTS-searchable rows behind.
  const inserted = await db
    .insert(knowledgeChunks)
    .values(baseRows)
    .returning({ id: knowledgeChunks.id });

  if (provider.name === "noop") {
    // No embedding backend; chunks-only is acceptable, FTS will still serve.
    return;
  }

  const texts = baseRows.map((r) => `${r.heading}\n\n${r.body}`);
  let embeddings: number[][];
  try {
    embeddings = await timeProvider(provider, "embedBatch", () => provider.embedBatch(texts));
  } catch (err) {
    // Re-throw so the job is marked failed; provider error counters are
    // incremented in the caller.
    throw err;
  }

  if (embeddings.length !== inserted.length) {
    throw new Error(
      `embedBatch returned ${embeddings.length} vectors for ${inserted.length} chunks`,
    );
  }

  for (let i = 0; i < inserted.length; i++) {
    await db
      .update(knowledgeChunks)
      .set({ embedding: embeddings[i], updatedAt: new Date() })
      .where(eq(knowledgeChunks.id, inserted[i].id));
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

async function timeProvider<T>(
  provider: EmbeddingProvider,
  operation: "embed" | "embedBatch",
  fn: () => Promise<T>,
): Promise<T> {
  const end = embeddingProviderLatency.startTimer({
    provider: provider.name,
    model: provider.model,
    operation,
  });
  try {
    return await fn();
  } finally {
    end();
  }
}

function warnOnce(key: string, msg: string): void {
  if (noopWarned.has(key)) return;
  noopWarned.add(key);
  logger.warn(msg);
}

/**
 * Map a provider error message to a coarse `error_class` label for metrics.
 * The underlying http-retry helper formats messages as e.g.
 *   "openai 429 rate-limited after 5 attempts: ..."
 *   "openai 502 after 5 attempts: ..."
 *   "openai 400: ..."
 *   "openai request timed out after 5 attempts ..."
 *   "openai: embedding dim mismatch - got 1024, expected 1536 ..."
 * This is a best-effort string match; the cardinality is deliberately small.
 */
export type EmbeddingErrorClass =
  | "rate_limit"
  | "server_error"
  | "client_error"
  | "timeout"
  | "dim_mismatch"
  | "other";

export function classifyError(message: string): EmbeddingErrorClass {
  const m = message.toLowerCase();
  if (m.includes("dim mismatch") || m.includes("dimension mismatch")) return "dim_mismatch";
  if (m.includes("timed out") || m.includes("timeout")) return "timeout";
  if (m.includes("429") || m.includes("rate-limit") || m.includes("rate limit")) return "rate_limit";
  if (/\b5\d{2}\b/.test(m)) return "server_error";
  if (/\b4\d{2}\b/.test(m)) return "client_error";
  return "other";
}

function isTerminalErrorClass(cls: EmbeddingErrorClass): boolean {
  // 4xx (other than rate_limit) and dim mismatch are non-recoverable -
  // retrying won't change the outcome. Everything else is retryable.
  return cls === "client_error" || cls === "dim_mismatch";
}

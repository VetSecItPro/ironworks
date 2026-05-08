/**
 * One-shot backfill: enqueue embedding/chunking jobs for every row that's
 * missing an embedding (memory entries) or chunks (knowledge pages).
 *
 * Idempotent by design — both `enqueueEmbeddingJob` and `enqueueChunkingJob`
 * upsert on (target_type, target_id), and the SELECT statements skip rows
 * that already satisfy the desired post-state. Safe to run repeatedly; safe
 * to run while the worker is draining (the worker just sees a larger queue).
 *
 * CLI:
 *   tsx scripts/backfill-embeddings.ts [--target=memory|chunks|both]
 *                                      [--batch-size=N]
 *                                      [--dry-run]
 *
 * Defaults: --target=both, --batch-size=50, no dry-run.
 *
 * Exit codes: 0 success, 1 on error.
 */

import { and, isNotNull, isNull, sql } from "drizzle-orm";
// NOTE: Imports use relative paths into the workspace packages because this
// script lives at the repo root (outside any pnpm workspace package.json) and
// therefore has no node_modules entry to resolve `@ironworksai/db` against.
// Tests import this module from inside a workspace where the `@ironworksai/*`
// alias does resolve, but Node ESM resolves the importer's specifiers relative
// to the importer's URL — so we keep these specifiers root-relative.
import { agentMemoryEntries, createDb, type Db, knowledgeChunks, knowledgePages } from "../packages/db/src/index.js";
import { logger } from "../server/src/middleware/logger.js";
import { enqueueChunkingJob, enqueueEmbeddingJob } from "../server/src/services/embeddings/queue.js";

export type BackfillTarget = "memory" | "chunks" | "both";

export interface BackfillOptions {
  target: BackfillTarget;
  batchSize: number;
  dryRun: boolean;
}

export interface BackfillStats {
  memoryEnqueued: number;
  memoryScanned: number;
  chunksEnqueued: number;
  chunksScanned: number;
  dryRun: boolean;
}

const DEFAULT_BATCH_SIZE = 50;
const PROGRESS_INTERVAL = 100;

// ── core (testable) ───────────────────────────────────────────────────────

export async function backfillEmbeddings(db: Db, opts: BackfillOptions): Promise<BackfillStats> {
  const stats: BackfillStats = {
    memoryEnqueued: 0,
    memoryScanned: 0,
    chunksEnqueued: 0,
    chunksScanned: 0,
    dryRun: opts.dryRun,
  };

  if (opts.target === "memory" || opts.target === "both") {
    await backfillMemory(db, opts, stats);
  }

  if (opts.target === "chunks" || opts.target === "both") {
    await backfillChunks(db, opts, stats);
  }

  return stats;
}

async function backfillMemory(db: Db, opts: BackfillOptions, stats: BackfillStats): Promise<void> {
  // Stream nullable-embedding, non-archived rows. We materialize the id+company
  // list once because mid-iteration the worker may flip embeddings to non-null,
  // and re-querying would skip them inconsistently. The list is bounded by the
  // operator's data volume — a single pass is fine for backfill scale.
  const rows = await db
    .select({ id: agentMemoryEntries.id, companyId: agentMemoryEntries.companyId })
    .from(agentMemoryEntries)
    .where(and(isNull(agentMemoryEntries.embedding), isNull(agentMemoryEntries.archivedAt)));

  for (let i = 0; i < rows.length; i += opts.batchSize) {
    const batch = rows.slice(i, i + opts.batchSize);
    for (const row of batch) {
      stats.memoryScanned++;
      if (!opts.dryRun) {
        await enqueueEmbeddingJob(db, {
          targetType: "memory",
          targetId: row.id,
          companyId: row.companyId,
        });
      }
      stats.memoryEnqueued++;
      if (stats.memoryEnqueued % PROGRESS_INTERVAL === 0) {
        logger.info({ processed: stats.memoryEnqueued, total: rows.length, target: "memory" }, "backfill progress");
      }
    }
  }

  logger.info(
    {
      enqueued: stats.memoryEnqueued,
      total: rows.length,
      target: "memory",
      dryRun: opts.dryRun,
    },
    "backfill memory complete",
  );
}

async function backfillChunks(db: Db, opts: BackfillOptions, stats: BackfillStats): Promise<void> {
  // Pages with zero embedded chunks. Re-chunking always replaces prior chunks
  // (knowledge service truncates and rewrites by page_id), so any page with no
  // embedded chunks is the conservative re-enqueue set: pages that have never
  // been chunked AND pages whose chunks are missing embeddings (e.g. provider
  // was unreachable when they were inserted). NOT EXISTS handles both.
  const rows = await db
    .select({ id: knowledgePages.id, companyId: knowledgePages.companyId })
    .from(knowledgePages)
    .where(
      sql`NOT EXISTS (
        SELECT 1 FROM ${knowledgeChunks} kc
        WHERE kc.page_id = ${knowledgePages.id}
          AND kc.embedding IS NOT NULL
      )`,
    );

  for (let i = 0; i < rows.length; i += opts.batchSize) {
    const batch = rows.slice(i, i + opts.batchSize);
    for (const row of batch) {
      stats.chunksScanned++;
      if (!opts.dryRun) {
        await enqueueChunkingJob(db, {
          pageId: row.id,
          companyId: row.companyId,
        });
      }
      stats.chunksEnqueued++;
      if (stats.chunksEnqueued % PROGRESS_INTERVAL === 0) {
        logger.info({ processed: stats.chunksEnqueued, total: rows.length, target: "chunks" }, "backfill progress");
      }
    }
  }

  logger.info(
    {
      enqueued: stats.chunksEnqueued,
      total: rows.length,
      target: "chunks",
      dryRun: opts.dryRun,
    },
    "backfill chunks complete",
  );

  // Use isNotNull to keep the import live for type-tooling parity with other
  // queue-side helpers; harmless no-op at runtime. (Keeps tree-shakers honest.)
  void isNotNull;
}

// ── CLI ───────────────────────────────────────────────────────────────────

export function parseArgs(argv: string[]): BackfillOptions {
  let target: BackfillTarget = "both";
  let batchSize = DEFAULT_BATCH_SIZE;
  let dryRun = false;

  for (const arg of argv) {
    if (arg.startsWith("--target=")) {
      const v = arg.slice("--target=".length);
      if (v !== "memory" && v !== "chunks" && v !== "both") {
        throw new Error(`Invalid --target=${v}; expected memory|chunks|both`);
      }
      target = v;
    } else if (arg.startsWith("--batch-size=")) {
      const n = Number.parseInt(arg.slice("--batch-size=".length), 10);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`Invalid --batch-size; expected a positive integer`);
      }
      batchSize = n;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      // Caller can decide to print and exit; we just return defaults.
      // Fall through; the main() wrapper handles --help.
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { target, batchSize, dryRun };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      "Usage: tsx scripts/backfill-embeddings.ts " + "[--target=memory|chunks|both] [--batch-size=N] [--dry-run]\n",
    );
    process.exit(0);
  }

  const opts = parseArgs(args);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    logger.error("DATABASE_URL is required");
    process.exit(1);
  }

  const db = createDb(dbUrl);
  try {
    const stats = await backfillEmbeddings(db, opts);
    logger.info(stats, "backfill complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, "backfill failed");
    process.exit(1);
  }
}

// ESM entrypoint guard. Tests import the module without triggering main().
const isDirectInvocation = (() => {
  if (typeof process === "undefined" || !process.argv[1]) return false;
  const invokedHref = `file://${process.argv[1]}`;
  return import.meta.url === invokedHref;
})();

if (isDirectInvocation) {
  void main();
}

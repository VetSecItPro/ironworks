/**
 * One-shot backfill: parse `[[wikilinks]]` in every existing `knowledge_pages`
 * row, populate `knowledge_page_links` graph edges, and persist
 * frontmatter-declared `aliases` into `knowledge_pages.aliases`.
 *
 * Idempotent by design - `syncPageLinks` diffs the desired edge set against
 * existing rows and emits zero ops when nothing changed. Aliases are written
 * only when they differ from the stored value. Safe to run repeatedly.
 *
 * CLI:
 *   tsx scripts/backfill-knowledge-links.ts [--batch-size=N] [--dry-run]
 *
 * Defaults: --batch-size=50, no dry-run.
 *
 * Exit codes: 0 success, 1 on error.
 */

import { eq } from "drizzle-orm";
// NOTE: relative paths (see backfill-embeddings.ts for rationale - script lives
// outside any pnpm workspace so cannot resolve `@ironworksai/*` aliases).
import { createDb, type Db, knowledgePages } from "../packages/db/src/index.js";
import { parseFrontmatter } from "../packages/shared/src/index.js";
import { logger } from "../server/src/middleware/logger.js";
import { extractWikilinks } from "../server/src/services/knowledge-links/parser.js";
import { resolveLinks } from "../server/src/services/knowledge-links/resolver.js";
import { syncPageLinks } from "../server/src/services/knowledge-links/sync.js";

export interface BackfillLinksOptions {
  batchSize?: number;
  dryRun?: boolean;
}

export interface BackfillLinksStats {
  pagesProcessed: number;
  linksInserted: number;
  linksDeleted: number;
  aliasesUpdated: number;
}

const DEFAULT_BATCH_SIZE = 50;
const PROGRESS_INTERVAL = 100;

/**
 * Mirror of knowledge.ts `extractAliases` - kept local to avoid pulling
 * the full service module (which transitively imports queue + worker code we
 * don't want active during a backfill). Same defensive shape: missing FM,
 * non-array `aliases`, or non-string entries all degrade to `[]`.
 */
function extractAliases(body: string): string[] {
  const { fm } = parseFrontmatter(body) as { fm: { aliases?: unknown } | null };
  if (!fm || !Array.isArray(fm.aliases)) return [];
  return fm.aliases.filter((a): a is string => typeof a === "string");
}

function aliasesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ── core (testable) ───────────────────────────────────────────────────────

export async function backfillKnowledgeLinks(db: Db, opts: BackfillLinksOptions = {}): Promise<BackfillLinksStats> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const dryRun = opts.dryRun ?? false;

  const stats: BackfillLinksStats = {
    pagesProcessed: 0,
    linksInserted: 0,
    linksDeleted: 0,
    aliasesUpdated: 0,
  };

  // Materialize the full page list once. Backfill scale is bounded by operator
  // data volume; a single SELECT keeps the iteration deterministic even if
  // concurrent writes happen during the run (we'd just process slightly stale
  // bodies - the next save re-syncs).
  const rows = await db
    .select({
      id: knowledgePages.id,
      companyId: knowledgePages.companyId,
      body: knowledgePages.body,
      aliases: knowledgePages.aliases,
    })
    .from(knowledgePages);

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    for (const row of batch) {
      const body = row.body ?? "";

      // 1) Frontmatter aliases - write only when they actually differ from
      //    what's stored, so a no-op re-run reports 0 alias updates.
      const desiredAliases = extractAliases(body);
      const storedAliases = (row.aliases ?? []) as string[];
      if (!aliasesEqual(desiredAliases, storedAliases)) {
        if (!dryRun) {
          await db.update(knowledgePages).set({ aliases: desiredAliases }).where(eq(knowledgePages.id, row.id));
        }
        stats.aliasesUpdated++;
      }

      // 2) Wikilink extraction → resolution → diff-and-apply sync.
      //    syncPageLinks runs its own transaction; on dry-run we resolve
      //    (read-only) but skip the sync so no edges are written.
      const parsed = extractWikilinks(body);
      const resolved = await resolveLinks(db, row.companyId, parsed);

      if (!dryRun) {
        const result = await syncPageLinks(db, {
          fromPageId: row.id,
          companyId: row.companyId,
          resolved,
        });
        stats.linksInserted += result.inserted;
        stats.linksDeleted += result.deleted;
      } else {
        // Best-effort dry-run accounting: count the resolved edges as
        // would-be inserts. On a re-run this overstates (some are unchanged),
        // but operators reading the dry-run want a ceiling, not a precise diff.
        stats.linksInserted += resolved.length;
      }

      stats.pagesProcessed++;

      if (stats.pagesProcessed % PROGRESS_INTERVAL === 0) {
        logger.info({ processed: stats.pagesProcessed, total: rows.length }, "knowledge-links backfill progress");
      }
    }
  }

  logger.info({ ...stats, dryRun, total: rows.length }, "knowledge-links backfill complete");

  return stats;
}

// ── CLI ───────────────────────────────────────────────────────────────────

export function parseArgs(argv: string[]): { batchSize: number; dryRun: boolean } {
  let batchSize = DEFAULT_BATCH_SIZE;
  let dryRun = false;

  for (const arg of argv) {
    if (arg.startsWith("--batch-size=")) {
      const n = Number.parseInt(arg.slice("--batch-size=".length), 10);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`Invalid --batch-size; expected a positive integer`);
      }
      batchSize = n;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      // main() handles --help.
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { batchSize, dryRun };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write("Usage: tsx scripts/backfill-knowledge-links.ts [--batch-size=N] [--dry-run]\n");
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
    const stats = await backfillKnowledgeLinks(db, opts);
    logger.info(stats, "knowledge-links backfill complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, "knowledge-links backfill failed");
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

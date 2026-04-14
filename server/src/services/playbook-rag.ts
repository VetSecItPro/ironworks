import { and, eq, sql, desc } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { knowledgePages, knowledgeChunks } from "@ironworksai/db";
import { parsePlaybook } from "./playbook-chunker.js";
import { embedBatch } from "./ollama-embed.js";
import { logger } from "../middleware/logger.js";

/**
 * RAG over playbooks: chunk, embed, lookup.
 *
 * === EMBEDDING STORAGE ===
 * The production postgres image lacks pgvector, so embeddings are stored
 * as JSON-encoded text in the `embedding` column. When the postgres image
 * is upgraded, migration 0082 alters the column to vector(768) and the
 * service switches to cosine-similarity search.
 *
 * Until then, semantic search is disabled and lookup uses Postgres FTS
 * (tsvector GIN index on heading_path + body). FTS is a weaker retriever
 * than embeddings, but still beats loading a full 50k-token playbook
 * into every prompt.
 */

// Feature flag: is the `embedding` column usable as a pgvector vector?
// Checked once per process at startup; flipped when migration 0082 runs.
// For now always false (text column).
const EMBEDDING_MODE: "text" | "vector" = "text";

function encodeEmbedding(vec: number[]): string {
  return JSON.stringify(vec);
}

/**
 * Reindex one playbook page: parse, chunk, optionally embed, upsert.
 *
 * Returns the number of chunks inserted. Safe to call repeatedly; drops
 * and rebuilds all chunks for the page.
 */
export async function reindexPage(db: Db, pageId: string): Promise<number> {
  const [page] = await db.select().from(knowledgePages).where(eq(knowledgePages.id, pageId)).limit(1);
  if (!page) {
    throw new Error(`knowledge_pages row not found: ${pageId}`);
  }

  const parsed = parsePlaybook(page.body);
  if (parsed.chunks.length === 0) {
    logger.warn({ pageId, slug: page.slug }, "playbook-rag: page produced zero chunks, skipping");
    return 0;
  }

  // Delete existing chunks for this page (simpler than diff/update)
  await db.delete(knowledgeChunks).where(eq(knowledgeChunks.pageId, pageId));

  const fm = parsed.frontmatter;
  const rows = parsed.chunks.map((chunk) => ({
    pageId: page.id,
    companyId: page.companyId,
    department: (fm.department as string) ?? page.department ?? null,
    ownerRole: (fm.owner_role as string) ?? null,
    audience: (fm.audience as string) ?? null,
    documentType: (fm.document_type as string) ?? page.documentType ?? null,
    anchor: chunk.anchor,
    heading: chunk.heading,
    headingPath: chunk.headingPath,
    body: chunk.body,
    tokenCount: chunk.tokenCount,
    orderNum: chunk.orderNum,
    sourceRevision: page.revisionNumber,
    embedding: null as string | null,
  }));

  const inserted = await db.insert(knowledgeChunks).values(rows).returning({ id: knowledgeChunks.id });

  // Embed in batches. Failure here is non-fatal: chunks still exist and
  // FTS fallback covers retrieval.
  const BATCH_SIZE = 16;
  const bodies = rows.map((r) => `${r.heading}\n\n${r.body}`);
  let embedded = 0;

  for (let i = 0; i < bodies.length; i += BATCH_SIZE) {
    const batch = bodies.slice(i, i + BATCH_SIZE);
    const batchIds = inserted.slice(i, i + BATCH_SIZE);
    try {
      const results = await embedBatch(batch);
      for (let j = 0; j < results.length; j++) {
        await db
          .update(knowledgeChunks)
          .set({ embedding: encodeEmbedding(results[j].embedding), updatedAt: new Date() })
          .where(eq(knowledgeChunks.id, batchIds[j].id));
        embedded += 1;
      }
    } catch (err) {
      logger.warn(
        { err: (err as Error).message, pageId, slug: page.slug, batchStart: i },
        "playbook-rag: embedding batch failed; chunks inserted without embeddings (FTS fallback active)",
      );
    }
  }

  logger.info(
    { pageId, slug: page.slug, chunks: rows.length, embedded, mode: EMBEDDING_MODE },
    "playbook-rag: reindexed page",
  );

  return rows.length;
}

/**
 * Reindex all playbook pages for a company.
 */
export async function reindexAllPlaybooks(db: Db, companyId: string): Promise<{ pages: number; chunks: number }> {
  const pages = await db
    .select({ id: knowledgePages.id, slug: knowledgePages.slug })
    .from(knowledgePages)
    .where(and(eq(knowledgePages.companyId, companyId), eq(knowledgePages.documentType, "playbook")));

  let totalChunks = 0;
  for (const page of pages) {
    try {
      totalChunks += await reindexPage(db, page.id);
    } catch (err) {
      logger.error({ err: (err as Error).message, pageId: page.id, slug: page.slug }, "playbook-rag: page reindex failed");
    }
  }

  return { pages: pages.length, chunks: totalChunks };
}

/**
 * Semantic lookup over a company's playbook chunks.
 *
 * Returns top-K most relevant chunks. In text mode, uses Postgres FTS
 * (tsvector/tsquery) over heading_path + body. In vector mode (post-0082),
 * uses cosine similarity over the embedding column.
 */
export interface LookupOptions {
  companyId: string;
  query: string;
  department?: string;
  ownerRole?: string;
  documentType?: string;
  topK?: number;
}

export interface LookupResult {
  chunkId: string;
  pageId: string;
  anchor: string;
  heading: string;
  headingPath: string;
  body: string;
  tokenCount: number;
  department: string | null;
  ownerRole: string | null;
  score: number; // FTS rank or (1 - cosine distance); higher is better
  mode: "fts" | "vector";
}

export async function lookupPlaybook(db: Db, opts: LookupOptions): Promise<LookupResult[]> {
  const topK = Math.min(Math.max(opts.topK ?? 3, 1), 10);
  const { companyId, query, department, ownerRole, documentType } = opts;

  // Text mode (current production): Postgres FTS with ts_rank.
  // Sanitize query to tsquery-safe terms: strip punctuation, OR-join words.
  const terms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && t.length <= 32)
    .slice(0, 20);

  if (terms.length === 0) {
    return [];
  }

  const tsquery = terms.map((t) => `${t}:*`).join(" | ");

  const filters = [eq(knowledgeChunks.companyId, companyId)];
  if (department) filters.push(eq(knowledgeChunks.department, department));
  if (documentType) filters.push(eq(knowledgeChunks.documentType, documentType));
  if (ownerRole) filters.push(sql`${knowledgeChunks.ownerRole} ILIKE ${"%" + ownerRole + "%"}`);

  const rows = await db
    .select({
      chunkId: knowledgeChunks.id,
      pageId: knowledgeChunks.pageId,
      anchor: knowledgeChunks.anchor,
      heading: knowledgeChunks.heading,
      headingPath: knowledgeChunks.headingPath,
      body: knowledgeChunks.body,
      tokenCount: knowledgeChunks.tokenCount,
      department: knowledgeChunks.department,
      ownerRole: knowledgeChunks.ownerRole,
      score: sql<number>`ts_rank(to_tsvector('english', ${knowledgeChunks.headingPath} || ' ' || ${knowledgeChunks.body}), to_tsquery('english', ${tsquery}))`,
    })
    .from(knowledgeChunks)
    .where(
      and(
        ...filters,
        sql`to_tsvector('english', ${knowledgeChunks.headingPath} || ' ' || ${knowledgeChunks.body}) @@ to_tsquery('english', ${tsquery})`,
      ),
    )
    .orderBy(desc(sql`ts_rank(to_tsvector('english', ${knowledgeChunks.headingPath} || ' ' || ${knowledgeChunks.body}), to_tsquery('english', ${tsquery}))`))
    .limit(topK);

  return rows.map((r) => ({
    ...r,
    score: Number(r.score),
    mode: "fts" as const,
  }));
}

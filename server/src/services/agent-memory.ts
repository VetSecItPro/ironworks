import type { Db } from "@ironworksai/db";
import { agentMemoryEntries } from "@ironworksai/db";
import { and, asc, desc, eq, gt, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import { logger } from "../middleware/logger.js";
import { getMemoryProvider } from "./embeddings/factory.js";
import type { EmbeddingProvider } from "./embeddings/provider.js";
import { enqueueEmbeddingJob } from "./embeddings/queue.js";

// Re-export AgentMemoryEntry type for callers (without embedding - optional pgvector column)
export type AgentMemoryEntry = Omit<typeof agentMemoryEntries.$inferSelect, "embedding">;

// Select all columns except `embedding` (pgvector column may not exist on all deployments)
const memoryColumns = {
  id: agentMemoryEntries.id,
  agentId: agentMemoryEntries.agentId,
  companyId: agentMemoryEntries.companyId,
  memoryType: agentMemoryEntries.memoryType,
  category: agentMemoryEntries.category,
  content: agentMemoryEntries.content,
  sourceIssueId: agentMemoryEntries.sourceIssueId,
  sourceProjectId: agentMemoryEntries.sourceProjectId,
  confidence: agentMemoryEntries.confidence,
  accessCount: agentMemoryEntries.accessCount,
  lastAccessedAt: agentMemoryEntries.lastAccessedAt,
  expiresAt: agentMemoryEntries.expiresAt,
  archivedAt: agentMemoryEntries.archivedAt,
  createdAt: agentMemoryEntries.createdAt,
};

// ── Agent Memory Services ───────────────────────────────────────────────────
//
// Memory lifecycle for FTE agents:
//   - extractMemoriesFromIssue: creates episodic entries when an issue completes
//   - consolidateMemories: weekly merge of episodic entries into semantic
//   - decayStaleMemories: daily confidence reduction on unaccessed entries
//   - enforceMemoryCap: keeps active entries per agent under a configurable cap

const DEFAULT_MEMORY_CAP = 500;

// ── Role-Specific Memory Categories ────────────────────────────────────────
const ROLE_MEMORY_CATEGORIES: Record<string, string[]> = {
  ceo: ["strategic_decision", "company_direction", "board_decision"],
  cto: ["architecture_decision", "technical_standard", "tech_debt_note"],
  cfo: ["financial_insight", "budget_decision", "cost_optimization"],
  cmo: ["campaign_result", "brand_insight", "content_strategy"],
  vphr: ["hiring_decision", "performance_insight", "org_change"],
  vp_hr: ["hiring_decision", "performance_insight", "org_change"],
  compliancedirector: ["compliance_finding", "regulatory_update", "audit_note"],
  compliance_director: ["compliance_finding", "regulatory_update", "audit_note"],
  legalcounsel: ["legal_risk", "contract_review", "regulatory_opinion"],
  legal_counsel: ["legal_risk", "contract_review", "regulatory_opinion"],
  seniorengineer: ["code_decision", "project_retrospective", "technical_learning"],
  senior_engineer: ["code_decision", "project_retrospective", "technical_learning"],
  devopsengineer: ["infra_decision", "deployment_note", "reliability_learning"],
  devops_engineer: ["infra_decision", "deployment_note", "reliability_learning"],
  securityengineer: ["security_finding", "threat_assessment", "hardening_note"],
  security_engineer: ["security_finding", "threat_assessment", "hardening_note"],
  uxdesigner: ["design_decision", "user_insight", "accessibility_note"],
  ux_designer: ["design_decision", "user_insight", "accessibility_note"],
  contentmarketer: ["content_performance", "audience_insight", "style_decision"],
  content_marketer: ["content_performance", "audience_insight", "style_decision"],
};

/**
 * Resolve memory categories for an agent role. Falls back to generic
 * task_history / technical_decision if the role is not recognized.
 */
function resolveRoleCategoriesForTaskHistory(role: string): string {
  const normalized = role.toLowerCase().replace(/[\s-]+/g, "_");
  const categories = ROLE_MEMORY_CATEGORIES[normalized];
  if (categories && categories.length > 0) {
    return categories[0]!; // Primary category for the role
  }
  // Also try without underscores
  const noUnderscores = normalized.replace(/_/g, "");
  const altCategories = ROLE_MEMORY_CATEGORIES[noUnderscores];
  if (altCategories && altCategories.length > 0) {
    return altCategories[0]!;
  }
  return "task_history";
}

function resolveRoleCategoriesForTechnical(role: string): string {
  const normalized = role.toLowerCase().replace(/[\s-]+/g, "_");
  const categories = ROLE_MEMORY_CATEGORIES[normalized];
  if (categories && categories.length > 1) {
    return categories[1]!; // Secondary category for the role
  }
  const noUnderscores = normalized.replace(/_/g, "");
  const altCategories = ROLE_MEMORY_CATEGORIES[noUnderscores];
  if (altCategories && altCategories.length > 1) {
    return altCategories[1]!;
  }
  return "technical_decision";
}

/**
 * Extract memories from a completed issue and store as episodic entries.
 *
 * Creates 1-2 entries:
 *   - One entry summarizing the task outcome (category: task_history)
 *   - One entry for technical decisions (category: technical_decision),
 *     only when the issue description contains technical terms
 */
export async function extractMemoriesFromIssue(
  db: Db,
  agentId: string,
  companyId: string,
  issueId: string,
  issueTitle: string,
  issueOutcome: string,
  agentRole?: string,
): Promise<void> {
  const now = new Date();
  const role = agentRole ?? "general";

  // Always create a task history entry with role-specific category
  const taskCategory = resolveRoleCategoriesForTaskHistory(role);
  const [taskInserted] = await db
    .insert(agentMemoryEntries)
    .values({
      agentId,
      companyId,
      memoryType: "episodic",
      category: taskCategory,
      content: `Completed: ${issueTitle}. Outcome: ${issueOutcome}`,
      sourceIssueId: issueId,
      confidence: 80,
      lastAccessedAt: now,
    })
    .returning({ id: agentMemoryEntries.id, companyId: agentMemoryEntries.companyId });
  if (taskInserted) {
    await enqueueEmbeddingJob(db, {
      targetType: "memory",
      targetId: taskInserted.id,
      companyId: taskInserted.companyId,
    });
  }

  // Create a secondary entry if the description suggests domain-specific work
  const technicalTerms = [
    "api",
    "database",
    "migration",
    "schema",
    "deploy",
    "config",
    "endpoint",
    "query",
    "index",
    "cache",
    "auth",
    "token",
    "service",
    "middleware",
    "webhook",
    "cron",
    "pipeline",
    "refactor",
    "performance",
    "security",
    "test",
    "ci/cd",
  ];

  const lowerOutcome = (issueOutcome ?? "").toLowerCase();
  const lowerTitle = (issueTitle ?? "").toLowerCase();
  const hasTechnicalContent = technicalTerms.some((term) => lowerOutcome.includes(term) || lowerTitle.includes(term));

  if (hasTechnicalContent) {
    const techCategory = resolveRoleCategoriesForTechnical(role);
    const [techInserted] = await db
      .insert(agentMemoryEntries)
      .values({
        agentId,
        companyId,
        memoryType: "episodic",
        category: techCategory,
        content: `Technical work on: ${issueTitle}. Details: ${issueOutcome}`,
        sourceIssueId: issueId,
        confidence: 75,
        lastAccessedAt: now,
      })
      .returning({ id: agentMemoryEntries.id, companyId: agentMemoryEntries.companyId });
    if (techInserted) {
      await enqueueEmbeddingJob(db, {
        targetType: "memory",
        targetId: techInserted.id,
        companyId: techInserted.companyId,
      });
    }
  }

  logger.info({ agentId, issueId, hasTechnicalContent, taskCategory }, "extracted memories from completed issue");
}

/**
 * Summarize a batch of memory entries using LLM.
 * Falls back to concatenation if the API is unavailable.
 */
async function summarizeWithLLM(entries: Array<{ content: string }>, category: string): Promise<string> {
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey || entries.length < 2) {
    // Fallback: simple concatenation
    const joined = entries.map((e) => e.content).join(" | ");
    return joined.length > 2000 ? `${joined.slice(0, 2000)}...` : joined;
  }

  const contents = entries.map((e, i) => `${i + 1}. ${e.content}`).join("\n");
  const prompt = `Summarize these ${entries.length} memory entries from the "${category}" category into a concise paragraph. Preserve key facts, decisions, and lessons learned. Be specific - keep names, dates, and numbers. Do not add opinions.\n\nEntries:\n${contents.slice(0, 6000)}`;

  try {
    const res = await fetch("https://ollama.com/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "qwen3.5:397b",
        messages: [{ role: "user", content: prompt }],
        stream: false,
        options: { num_predict: 500 },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      logger.debug({ status: res.status }, "memory consolidation LLM call failed, falling back to concatenation");
      const joined = entries.map((e) => e.content).join(" | ");
      return joined.length > 2000 ? `${joined.slice(0, 2000)}...` : joined;
    }

    const data = (await res.json()) as { message?: { content?: string } };
    const summary = data.message?.content?.trim();
    if (summary && summary.length > 10) return summary;
  } catch (err) {
    logger.debug({ err }, "memory consolidation LLM call error, falling back to concatenation");
  }

  // Fallback
  const joined = entries.map((e) => e.content).join(" | ");
  return joined.length > 2000 ? `${joined.slice(0, 2000)}...` : joined;
}

/**
 * Consolidate episodic memories older than 7 days into semantic summaries.
 *
 * Groups episodic entries by category, creates a single semantic entry per
 * category summarizing the group, then archives the originals.
 * Uses LLM-powered summarization when Ollama Cloud is available,
 * falls back to concatenation otherwise.
 */
export async function consolidateMemories(db: Db, agentId: string): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const now = new Date();

  // Find episodic entries older than 7 days
  const oldEpisodic = await db
    .select({
      id: agentMemoryEntries.id,
      companyId: agentMemoryEntries.companyId,
      category: agentMemoryEntries.category,
      content: agentMemoryEntries.content,
    })
    .from(agentMemoryEntries)
    .where(
      and(
        eq(agentMemoryEntries.agentId, agentId),
        eq(agentMemoryEntries.memoryType, "episodic"),
        isNull(agentMemoryEntries.archivedAt),
        lt(agentMemoryEntries.createdAt, sevenDaysAgo),
      ),
    );

  if (oldEpisodic.length === 0) return;

  // Group by category
  const groups = new Map<string, typeof oldEpisodic>();
  for (const entry of oldEpisodic) {
    const cat = entry.category ?? "uncategorized";
    const group = groups.get(cat) ?? [];
    group.push(entry);
    groups.set(cat, group);
  }

  const companyId = oldEpisodic[0]!.companyId;

  // Collect ids of newly-consolidated semantic entries so we can enqueue
  // their embedding jobs after the transaction commits. Enqueueing inside
  // the transaction would require the embedding-jobs queue to accept a
  // tx-scoped db handle, which it does not (the queue takes a top-level
  // Db). Idempotent enqueue (per T4) means a missed enqueue can be
  // retried safely; doing it post-commit keeps the consolidation
  // transaction lean.
  const consolidatedIds: Array<{ id: string; companyId: string }> = [];

  await db.transaction(async (tx) => {
    for (const [category, entries] of groups) {
      if (entries.length === 0) continue;

      // Create consolidated semantic entry using LLM summarization (or fallback)
      const summary = await summarizeWithLLM(entries, category);

      const [consolidatedInserted] = await tx
        .insert(agentMemoryEntries)
        .values({
          agentId,
          companyId,
          memoryType: "semantic",
          category,
          content: `[Consolidated from ${entries.length} entries] ${summary}`,
          confidence: 70,
          lastAccessedAt: now,
        })
        .returning({ id: agentMemoryEntries.id, companyId: agentMemoryEntries.companyId });
      if (consolidatedInserted) {
        consolidatedIds.push(consolidatedInserted);
      }

      // Archive the originals
      const entryIds = entries.map((e) => e.id);
      for (const entryId of entryIds) {
        await tx.update(agentMemoryEntries).set({ archivedAt: now }).where(eq(agentMemoryEntries.id, entryId));
      }
    }
  });

  // Post-commit: enqueue embedding jobs for the new semantic entries.
  for (const row of consolidatedIds) {
    await enqueueEmbeddingJob(db, {
      targetType: "memory",
      targetId: row.id,
      companyId: row.companyId,
    });
  }

  logger.info(
    { agentId, consolidatedCategories: groups.size, totalEntries: oldEpisodic.length },
    "consolidated episodic memories into semantic entries",
  );
}

/**
 * Decay confidence on stale memory entries.
 *
 * Runs daily across all agents:
 *   - Entries not accessed in 30+ days: confidence reduced by 10 (minimum 10)
 *   - Entries not accessed in 90+ days: confidence reduced by 20 (minimum 5)
 */
export async function decayStaleMemories(db: Db): Promise<void> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // 90+ day decay first (stronger reduction, lower floor)
  const ninetyDayResult = await db
    .update(agentMemoryEntries)
    .set({
      confidence: sql`greatest(5, ${agentMemoryEntries.confidence} - 20)`,
    })
    .where(and(isNull(agentMemoryEntries.archivedAt), lte(agentMemoryEntries.lastAccessedAt, ninetyDaysAgo)))
    .returning({ id: agentMemoryEntries.id });

  // 30-90 day decay (milder reduction)
  const thirtyDayResult = await db
    .update(agentMemoryEntries)
    .set({
      confidence: sql`greatest(10, ${agentMemoryEntries.confidence} - 10)`,
    })
    .where(
      and(
        isNull(agentMemoryEntries.archivedAt),
        lte(agentMemoryEntries.lastAccessedAt, thirtyDaysAgo),
        // Exclude entries already decayed in the 90-day pass above
        gt(agentMemoryEntries.lastAccessedAt, ninetyDaysAgo),
      ),
    )
    .returning({ id: agentMemoryEntries.id });

  const totalDecayed = ninetyDayResult.length + thirtyDayResult.length;
  if (totalDecayed > 0) {
    logger.info(
      {
        decayed30d: thirtyDayResult.length,
        decayed90d: ninetyDayResult.length,
        totalDecayed,
      },
      "decayed stale memory entries",
    );
  }
}

// ── Memory Health ───────────────────────────────────────────────────────────

export interface MemoryHealthResult {
  totalEntries: number;
  activeEntries: number;
  archivedEntries: number;
  avgConfidence: number;
  staleCount: number;
  coverageGaps: string[];
}

/**
 * Assess the health of an agent's memory store.
 *
 * Reports:
 *   - Active vs archived entry counts
 *   - Average confidence score
 *   - Stale entries (not accessed in 30+ days)
 *   - Coverage gaps (categories with fewer than 3 active entries)
 */
export async function getMemoryHealth(db: Db, agentId: string): Promise<MemoryHealthResult> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Total entries
  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentMemoryEntries)
    .where(eq(agentMemoryEntries.agentId, agentId));
  const totalEntries = Number(totalRow?.count ?? 0);

  // Active entries (not archived)
  const [activeRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
      avgConfidence: sql<number>`coalesce(avg(${agentMemoryEntries.confidence}), 0)::int`,
    })
    .from(agentMemoryEntries)
    .where(and(eq(agentMemoryEntries.agentId, agentId), isNull(agentMemoryEntries.archivedAt)));
  const activeEntries = Number(activeRow?.count ?? 0);
  const avgConfidence = Number(activeRow?.avgConfidence ?? 0);
  const archivedEntries = totalEntries - activeEntries;

  // Stale: active entries not accessed in 30+ days
  const [staleRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentMemoryEntries)
    .where(
      and(
        eq(agentMemoryEntries.agentId, agentId),
        isNull(agentMemoryEntries.archivedAt),
        isNotNull(agentMemoryEntries.lastAccessedAt),
        lte(agentMemoryEntries.lastAccessedAt, thirtyDaysAgo),
      ),
    );
  const staleCount = Number(staleRow?.count ?? 0);

  // Coverage gaps: categories with < 3 active entries
  const categoryCounts = await db
    .select({
      category: agentMemoryEntries.category,
      count: sql<number>`count(*)::int`,
    })
    .from(agentMemoryEntries)
    .where(and(eq(agentMemoryEntries.agentId, agentId), isNull(agentMemoryEntries.archivedAt)))
    .groupBy(agentMemoryEntries.category);

  const coverageGaps: string[] = [];
  for (const row of categoryCounts) {
    if (Number(row.count) < 3 && row.category) {
      coverageGaps.push(row.category);
    }
  }

  return {
    totalEntries,
    activeEntries,
    archivedEntries,
    avgConfidence,
    staleCount,
    coverageGaps,
  };
}

/**
 * Enforce a cap on active (non-archived) memory entries per agent.
 *
 * If the agent has more than `maxEntries` active entries, the entries with
 * the lowest confidence and oldest last_accessed_at are archived first.
 */
export async function enforceMemoryCap(
  db: Db,
  agentId: string,
  maxEntries: number = DEFAULT_MEMORY_CAP,
): Promise<void> {
  // Count active entries
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentMemoryEntries)
    .where(and(eq(agentMemoryEntries.agentId, agentId), isNull(agentMemoryEntries.archivedAt)));

  const activeCount = Number(countResult[0]?.count ?? 0);
  if (activeCount <= maxEntries) return;

  const excess = activeCount - maxEntries;
  const now = new Date();

  // Find the entries to archive: lowest confidence, then oldest access
  const toArchive = await db
    .select({ id: agentMemoryEntries.id })
    .from(agentMemoryEntries)
    .where(and(eq(agentMemoryEntries.agentId, agentId), isNull(agentMemoryEntries.archivedAt)))
    .orderBy(asc(agentMemoryEntries.confidence), asc(agentMemoryEntries.lastAccessedAt))
    .limit(excess);

  if (toArchive.length > 0) {
    for (const entry of toArchive) {
      await db.update(agentMemoryEntries).set({ archivedAt: now }).where(eq(agentMemoryEntries.id, entry.id));
    }

    logger.info(
      { agentId, archived: toArchive.length, activeCount, maxEntries },
      "enforced memory cap by archiving low-confidence entries",
    );
  }
}

// ── Vector-Aware Memory Retrieval ───────────────────────────────────────────

/**
 * Check whether the pgvector extension is installed on the current database.
 * Returns false on any error so callers degrade gracefully.
 */
async function isPgvectorAvailable(db: Db): Promise<boolean> {
  try {
    const rows = await db.execute(sql`SELECT 1 FROM pg_extension WHERE extname = 'vector'`);
    return (rows as unknown[]).length > 0;
  } catch {
    return false;
  }
}

/**
 * Format a number[] embedding for pgvector's text input syntax: `[v1,v2,...]`.
 * Used when binding a query vector as a SQL parameter for the `<=>` operator.
 *
 * Mirrors the format used by the schema's `vectorColumn.toDriver`. We can't
 * reuse that helper directly because Drizzle invokes it on writes only —
 * for raw `sql\`...\`` reads we have to format explicitly.
 */
function formatVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/**
 * Generate an embedding for the query text using the configured memory
 * provider. Returns:
 *   - the vector on success
 *   - null when provider is NoOp (caller should skip vector path)
 *   - null on any provider error (caller falls back to FTS)
 *
 * Errors are logged at debug level — provider misconfiguration already
 * warn-once'd at the factory layer; we don't want every read to re-shout.
 */
async function embedQueryText(
  provider: EmbeddingProvider,
  queryText: string,
): Promise<number[] | null> {
  if (provider.name === "noop") return null;
  try {
    const vec = await provider.embed(queryText);
    if (!Array.isArray(vec) || vec.length === 0) return null;
    return vec;
  } catch (err) {
    logger.debug({ err, provider: provider.name }, "vector retrieval: query embed failed, falling back to FTS");
    return null;
  }
}

/**
 * Cosine-similarity retrieval against `agent_memory_entries.embedding`.
 *
 * Uses pgvector's `<=>` operator (cosine distance: lower = more similar).
 * Caller is responsible for ensuring pgvector is available + the query
 * vector was generated successfully.
 *
 * Defines a local projection (NOT `memoryColumns`) so we can include the
 * cosine-distance score for ordering. The returned `AgentMemoryEntry`
 * shape strips the score before handing back to callers — embedding column
 * itself is also not returned (matches `memoryColumns` contract).
 */
async function findRelevantMemoriesByVector(
  db: Db,
  agentId: string,
  queryVec: number[],
  limit: number,
): Promise<AgentMemoryEntry[]> {
  const vectorLiteral = formatVectorLiteral(queryVec);

  try {
    const rows = await db
      .select({
        id: agentMemoryEntries.id,
        agentId: agentMemoryEntries.agentId,
        companyId: agentMemoryEntries.companyId,
        memoryType: agentMemoryEntries.memoryType,
        category: agentMemoryEntries.category,
        content: agentMemoryEntries.content,
        sourceIssueId: agentMemoryEntries.sourceIssueId,
        sourceProjectId: agentMemoryEntries.sourceProjectId,
        confidence: agentMemoryEntries.confidence,
        accessCount: agentMemoryEntries.accessCount,
        lastAccessedAt: agentMemoryEntries.lastAccessedAt,
        expiresAt: agentMemoryEntries.expiresAt,
        archivedAt: agentMemoryEntries.archivedAt,
        createdAt: agentMemoryEntries.createdAt,
        // Cosine distance: 0 = identical, 2 = opposite. Lower is better.
        distance: sql<number>`${agentMemoryEntries.embedding} <=> ${vectorLiteral}::vector`.as("distance"),
      })
      .from(agentMemoryEntries)
      .where(
        and(
          eq(agentMemoryEntries.agentId, agentId),
          isNull(agentMemoryEntries.archivedAt),
          sql`${agentMemoryEntries.embedding} IS NOT NULL`,
        ),
      )
      .orderBy(sql`distance ASC`)
      .limit(limit);

    return rows.map(({ distance: _distance, ...entry }) => entry);
  } catch (err) {
    logger.debug({ err, agentId }, "vector similarity query failed, returning empty");
    return [];
  }
}

/**
 * Count how many active entries for this agent have a non-null embedding.
 * Centralized so we don't run the same probe twice per request.
 */
async function countAgentEmbeddings(db: Db, agentId: string): Promise<number> {
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentMemoryEntries)
      .where(
        and(
          eq(agentMemoryEntries.agentId, agentId),
          isNull(agentMemoryEntries.archivedAt),
          sql`${agentMemoryEntries.embedding} IS NOT NULL`,
        ),
      );
    return Number(row?.count ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Find memory entries relevant to a query using either pgvector cosine
 * similarity (when available + provider configured) or Postgres full-text
 * search as fallback.
 *
 * Vector path is taken when ALL of these hold:
 *   - pgvector extension installed
 *   - memory provider is configured (not NoOp)
 *   - query embedding generation succeeds
 *   - at least one row for this agent has a populated embedding
 *
 * Otherwise: FTS. The `provider` arg is for DI in tests; production callers
 * leave it undefined and the factory resolves from env.
 */
export async function findRelevantMemories(
  db: Db,
  agentId: string,
  queryText: string,
  limit = 5,
  provider?: EmbeddingProvider,
): Promise<AgentMemoryEntry[]> {
  const vectorAvailable = await isPgvectorAvailable(db);

  if (vectorAvailable) {
    const resolvedProvider = provider ?? getMemoryProvider();
    if (resolvedProvider.name !== "noop") {
      const embeddingCount = await countAgentEmbeddings(db, agentId);
      if (embeddingCount > 0) {
        const queryVec = await embedQueryText(resolvedProvider, queryText);
        if (queryVec !== null) {
          const vectorRows = await findRelevantMemoriesByVector(db, agentId, queryVec, limit);
          if (vectorRows.length > 0) return vectorRows;
        }
      }
    }
  }

  // Full-text search fallback (also the primary path until embeddings exist)
  return findRelevantMemoriesByFts(db, agentId, queryText, limit);
}

/**
 * Find relevant memories using Postgres full-text search (ts_rank).
 * Extracts significant keywords from the query, builds a tsquery, and
 * ranks active entries by relevance.
 */
async function findRelevantMemoriesByFts(
  db: Db,
  agentId: string,
  queryText: string,
  limit: number,
): Promise<AgentMemoryEntry[]> {
  // Strip common English stop words and short tokens to build a tsquery
  const STOP_WORDS = new Set([
    "a",
    "an",
    "the",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "from",
    "is",
    "was",
    "are",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "shall",
    "can",
    "not",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "as",
    "if",
    "so",
    "up",
    "out",
  ]);

  const keywords = queryText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    .slice(0, 10); // cap to avoid overly complex tsquery

  if (keywords.length === 0) {
    // No usable keywords - return most recent entries instead
    return db
      .select(memoryColumns)
      .from(agentMemoryEntries)
      .where(and(eq(agentMemoryEntries.agentId, agentId), isNull(agentMemoryEntries.archivedAt)))
      .orderBy(desc(agentMemoryEntries.lastAccessedAt))
      .limit(limit);
  }

  const tsQueryStr = keywords.join(" | ");

  try {
    const results = await db
      .select({
        id: agentMemoryEntries.id,
        agentId: agentMemoryEntries.agentId,
        companyId: agentMemoryEntries.companyId,
        memoryType: agentMemoryEntries.memoryType,
        category: agentMemoryEntries.category,
        content: agentMemoryEntries.content,
        sourceIssueId: agentMemoryEntries.sourceIssueId,
        sourceProjectId: agentMemoryEntries.sourceProjectId,
        confidence: agentMemoryEntries.confidence,
        accessCount: agentMemoryEntries.accessCount,
        lastAccessedAt: agentMemoryEntries.lastAccessedAt,
        expiresAt: agentMemoryEntries.expiresAt,
        archivedAt: agentMemoryEntries.archivedAt,
        createdAt: agentMemoryEntries.createdAt,
        embedding: agentMemoryEntries.embedding,
        rank: sql<number>`ts_rank(
          to_tsvector('english', ${agentMemoryEntries.content}),
          to_tsquery('english', ${tsQueryStr})
        )`.as("rank"),
      })
      .from(agentMemoryEntries)
      .where(
        and(
          eq(agentMemoryEntries.agentId, agentId),
          isNull(agentMemoryEntries.archivedAt),
          sql`to_tsvector('english', ${agentMemoryEntries.content}) @@ to_tsquery('english', ${tsQueryStr})`,
        ),
      )
      .orderBy(sql`rank DESC`)
      .limit(limit);

    // Strip the rank field before returning typed entries
    return results.map(({ rank: _rank, ...entry }) => entry);
  } catch (err) {
    // ts_rank query can fail if the tsquery syntax is invalid; degrade gracefully
    logger.warn({ err, agentId }, "FTS memory search failed, returning recent entries");
    return db
      .select(memoryColumns)
      .from(agentMemoryEntries)
      .where(and(eq(agentMemoryEntries.agentId, agentId), isNull(agentMemoryEntries.archivedAt)))
      .orderBy(desc(agentMemoryEntries.lastAccessedAt))
      .limit(limit);
  }
}

// ── Three-Tier Contextual Memory ────────────────────────────────────────────

/**
 * Retrieve memories across three tiers for a given task context:
 *
 *   Tier 1 - Working memory: most recent session_state entry (always included)
 *   Tier 2 - Semantic memory: keyword-matched entries via full-text search (top 5)
 *   Tier 3 - Vector memory: cosine similarity search if pgvector available (top 5)
 *
 * Entries are deduplicated by id and capped to maxEntries (default 10).
 */
export async function getContextualMemories(
  db: Db,
  agentId: string,
  taskContext: string,
  maxEntries = 10,
  provider?: EmbeddingProvider,
): Promise<AgentMemoryEntry[]> {
  const seen = new Set<string>();
  const results: AgentMemoryEntry[] = [];

  const add = (entries: AgentMemoryEntry[]) => {
    for (const entry of entries) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        results.push(entry);
      }
    }
  };

  // Tier 1: Working memory - most recent session state
  try {
    const working = await db
      .select(memoryColumns)
      .from(agentMemoryEntries)
      .where(
        and(
          eq(agentMemoryEntries.agentId, agentId),
          eq(agentMemoryEntries.memoryType, "procedural"),
          eq(agentMemoryEntries.category, "session_state"),
          isNull(agentMemoryEntries.archivedAt),
        ),
      )
      .orderBy(desc(agentMemoryEntries.createdAt))
      .limit(1);
    add(working);
  } catch (err) {
    logger.warn({ err, agentId }, "tier-1 working memory retrieval failed");
  }

  // Tier 2: Semantic memory - full-text keyword search
  try {
    const semantic = await findRelevantMemoriesByFts(db, agentId, taskContext, 5);
    add(semantic);
  } catch (err) {
    logger.warn({ err, agentId }, "tier-2 semantic memory retrieval failed");
  }

  // Tier 3: Vector memory - cosine-similarity search when pgvector + provider
  // are both available. Falls back silently to whatever tier 1+2 produced if
  // any precondition fails (NoOp provider, no rows with embeddings, query
  // embed throws, SQL error). The `add()` helper dedupes against tier-2 hits.
  //
  // Note on caching: the spec calls for query-text-hash caching across the
  // request lifetime. The current call graph passes no per-request context
  // through, so request-lifetime caching would require plumbing an extra
  // arg through every call site. We instead memoize within this single
  // `getContextualMemories` call (one provider.embed() per invocation) —
  // that's the dominant case anyway since findRelevantMemories isn't
  // separately invoked alongside this function in production paths.
  const vectorAvailable = await isPgvectorAvailable(db).catch(() => false);
  if (vectorAvailable) {
    const resolvedProvider = provider ?? getMemoryProvider();
    if (resolvedProvider.name !== "noop") {
      try {
        const embeddingCount = await countAgentEmbeddings(db, agentId);
        if (embeddingCount > 0) {
          const queryVec = await embedQueryText(resolvedProvider, taskContext);
          if (queryVec !== null) {
            const vectorRows = await findRelevantMemoriesByVector(db, agentId, queryVec, 5);
            add(vectorRows);
          }
        }
      } catch (err) {
        logger.debug({ err, agentId }, "tier-3 vector retrieval failed, continuing with tier 1+2");
      }
    }
  }

  return results.slice(0, maxEntries);
}

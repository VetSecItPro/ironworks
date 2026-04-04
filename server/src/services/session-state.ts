import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import {
  activityLog,
  agentMemoryEntries,
  approvals,
  issues,
} from "@ironworksai/db";
import { logger } from "../middleware/logger.js";
import { getContextualMemories } from "./agent-memory.js";

// ── Session State Persistence ──────────────────────────────────────────────
//
// Tracks what an agent was doing between heartbeat runs so subsequent runs
// can pick up where the previous one left off. Session state is stored as
// a "procedural" memory entry with category "session_state".

/**
 * Save session state after a heartbeat run completes.
 */
export async function saveSessionState(
  db: Db,
  opts: {
    agentId: string;
    companyId: string;
    issueId: string | null;
    summary: string;
    lastAction: string;
    pendingWork: string | null;
  },
): Promise<void> {
  const { agentId, companyId, issueId, summary, lastAction, pendingWork } = opts;
  const now = new Date();

  const content = JSON.stringify({
    summary,
    lastAction,
    pendingWork,
    issueId,
    savedAt: now.toISOString(),
  });

  await db.insert(agentMemoryEntries).values({
    agentId,
    companyId,
    memoryType: "procedural",
    category: "session_state",
    content,
    sourceIssueId: issueId,
    confidence: 90,
    lastAccessedAt: now,
  });

  logger.info(
    { agentId, issueId },
    "saved session state",
  );
}

/**
 * Retrieve the most recent session state for an agent.
 */
export async function getLatestSessionState(
  db: Db,
  agentId: string,
): Promise<{
  summary: string;
  lastAction: string;
  pendingWork: string | null;
  savedAt: Date;
} | null> {
  const [entry] = await db
    .select({
      content: agentMemoryEntries.content,
      createdAt: agentMemoryEntries.createdAt,
    })
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

  if (!entry) return null;

  try {
    const parsed = JSON.parse(entry.content) as Record<string, unknown>;
    return {
      summary: String(parsed.summary ?? ""),
      lastAction: String(parsed.lastAction ?? ""),
      pendingWork: parsed.pendingWork ? String(parsed.pendingWork) : null,
      savedAt: parsed.savedAt ? new Date(String(parsed.savedAt)) : entry.createdAt,
    };
  } catch {
    return null;
  }
}

/**
 * Compress an agent's conversation history stored as session-state memory entries.
 *
 * Keeps the most recent `maxTurns` entries intact and summarises older entries
 * into a single "compressed history" procedural memory entry.  The summary is
 * stored with category "session_history_compressed" and the originals are
 * archived so they no longer pollute the active context window.
 *
 * Returns the compressed summary paragraph (empty string if nothing to compress).
 */
export async function compressConversationHistory(
  db: Db,
  agentId: string,
  maxTurns = 10,
): Promise<string> {
  // Fetch all active session-state entries ordered newest first
  const allEntries = await db
    .select({
      id: agentMemoryEntries.id,
      content: agentMemoryEntries.content,
      createdAt: agentMemoryEntries.createdAt,
    })
    .from(agentMemoryEntries)
    .where(
      and(
        eq(agentMemoryEntries.agentId, agentId),
        eq(agentMemoryEntries.memoryType, "procedural"),
        eq(agentMemoryEntries.category, "session_state"),
        isNull(agentMemoryEntries.archivedAt),
      ),
    )
    .orderBy(desc(agentMemoryEntries.createdAt));

  // Nothing to do if we're at or below the turn limit
  if (allEntries.length <= maxTurns) return "";

  const toKeep = allEntries.slice(0, maxTurns);
  const toCompress = allEntries.slice(maxTurns);

  // Build a concise summary paragraph from the older entries
  const summaryLines: string[] = [];
  for (const entry of toCompress) {
    try {
      const parsed = JSON.parse(entry.content) as Record<string, unknown>;
      const saved = parsed.savedAt ? new Date(String(parsed.savedAt)).toISOString().slice(0, 16) : "unknown time";
      const action = parsed.lastAction ? String(parsed.lastAction) : "";
      const summary = parsed.summary ? String(parsed.summary) : "";
      if (action || summary) {
        summaryLines.push(`[${saved}] ${action}${summary ? `: ${summary}` : ""}`);
      }
    } catch {
      // skip unparseable entries
    }
  }

  if (summaryLines.length === 0) return "";

  const compressedSummary = `Compressed history (${toCompress.length} turns prior to last ${maxTurns}): ${summaryLines.join("; ")}`;

  // Archive the old entries
  const now = new Date();
  const oldestKeptDate = toKeep[toKeep.length - 1]?.createdAt ?? now;

  await db
    .update(agentMemoryEntries)
    .set({ archivedAt: now })
    .where(
      and(
        eq(agentMemoryEntries.agentId, agentId),
        eq(agentMemoryEntries.memoryType, "procedural"),
        eq(agentMemoryEntries.category, "session_state"),
        isNull(agentMemoryEntries.archivedAt),
        lt(agentMemoryEntries.createdAt, oldestKeptDate),
      ),
    );

  // Store the compressed summary as a new entry
  const [agentRow] = await db
    .select({ companyId: agentMemoryEntries.companyId })
    .from(agentMemoryEntries)
    .where(eq(agentMemoryEntries.agentId, agentId))
    .limit(1);

  if (agentRow) {
    await db.insert(agentMemoryEntries).values({
      agentId,
      companyId: agentRow.companyId,
      memoryType: "procedural",
      category: "session_history_compressed",
      content: compressedSummary,
      confidence: 80,
      lastAccessedAt: now,
    });
  }

  logger.info(
    { agentId, archivedCount: toCompress.length, maxTurns },
    "compressed conversation history",
  );

  return compressedSummary;
}

/**
 * Build a morning briefing that gives an agent full context on startup.
 *
 * Assembles:
 *   - Last session state (what you were doing)
 *   - Open issues assigned to this agent
 *   - Recent activity relevant to this agent (last 10 entries)
 *   - Pending approvals for this agent
 */
export async function buildMorningBriefing(
  db: Db,
  agentId: string,
  companyId: string,
): Promise<string> {
  const sections: string[] = [];

  // 0. Run compression first so the session state we display is up-to-date
  await compressConversationHistory(db, agentId).catch(() => {
    // non-fatal: compression failure must not block the briefing
  });

  // 1. Last session state
  const sessionState = await getLatestSessionState(db, agentId);
  if (sessionState) {
    const stateLines: string[] = [
      "## Last Session State",
      `- **Last Action:** ${sessionState.lastAction}`,
      `- **Summary:** ${sessionState.summary}`,
    ];
    if (sessionState.pendingWork) {
      stateLines.push(`- **Pending Work:** ${sessionState.pendingWork}`);
    }
    const elapsed = Date.now() - sessionState.savedAt.getTime();
    const hoursAgo = Math.round(elapsed / (1000 * 60 * 60));
    stateLines.push(`- **Last Active:** ${hoursAgo > 0 ? `${hoursAgo} hours ago` : "recently"}`);
    sections.push(stateLines.join("\n"));
  }

  // 1a. Compressed history (if any)
  const [compressedEntry] = await db
    .select({ content: agentMemoryEntries.content })
    .from(agentMemoryEntries)
    .where(
      and(
        eq(agentMemoryEntries.agentId, agentId),
        eq(agentMemoryEntries.memoryType, "procedural"),
        eq(agentMemoryEntries.category, "session_history_compressed"),
        isNull(agentMemoryEntries.archivedAt),
      ),
    )
    .orderBy(desc(agentMemoryEntries.createdAt))
    .limit(1);

  if (compressedEntry?.content) {
    sections.push(`## Prior Session History\n${compressedEntry.content}`);
  }

  // 1b. Contextual memories: three-tier retrieval (working + semantic + vector)
  // Build task context from the first active issue title if available.
  // This replaces flat memory injection with a ranked, deduplicated set.
  try {
    // Determine a task context string for memory retrieval
    const activeIssueRow = await db
      .select({ title: issues.title })
      .from(issues)
      .where(
        and(
          eq(issues.companyId, companyId),
          eq(issues.assigneeAgentId, agentId),
        ),
      )
      .orderBy(desc(issues.createdAt))
      .limit(5);

    const activeForContext = activeIssueRow.find(
      (i) => !["done", "cancelled", "backlog"].includes((i as { title: string }).title),
    );
    const taskContext = (activeForContext as { title: string } | undefined)?.title ?? "";

    if (taskContext) {
      const contextMemories = await getContextualMemories(db, agentId, taskContext, 8);
      // Skip session_state entries since those are already injected above
      const nonSession = contextMemories.filter((m) => m.category !== "session_state");
      if (nonSession.length > 0) {
        const memLines = nonSession.map(
          (m) => `- [${m.memoryType}/${m.category ?? "general"}] ${m.content.slice(0, 200)}`,
        );
        sections.push(`## Relevant Memories\n${memLines.join("\n")}`);
      }
    }
  } catch (err) {
    logger.debug({ err, agentId }, "contextual memory retrieval failed in morning briefing");
  }

  // 2. Open issues assigned to this agent
  const openIssues = await db
    .select({
      id: issues.id,
      identifier: issues.identifier,
      title: issues.title,
      status: issues.status,
    })
    .from(issues)
    .where(
      and(
        eq(issues.companyId, companyId),
        eq(issues.assigneeAgentId, agentId),
      ),
    )
    .orderBy(desc(issues.createdAt))
    .limit(20);

  const activeIssues = openIssues.filter(
    (i) => !["done", "cancelled"].includes(i.status),
  );

  if (activeIssues.length > 0) {
    const issueLines = activeIssues.map(
      (i) => `- [${i.identifier ?? i.id.slice(0, 8)}] ${i.title} (${i.status})`,
    );
    sections.push(`## Open Issues (${activeIssues.length})\n${issueLines.join("\n")}`);
  }

  // 3. Recent activity relevant to this agent (last 10 entries)
  const recentActivity = await db
    .select({
      action: activityLog.action,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.companyId, companyId),
        eq(activityLog.agentId, agentId),
      ),
    )
    .orderBy(desc(activityLog.createdAt))
    .limit(10);

  if (recentActivity.length > 0) {
    const activityLines = recentActivity.map(
      (a) => `- ${a.action} on ${a.entityType}:${a.entityId.slice(0, 8)} (${a.createdAt.toISOString().slice(0, 16)})`,
    );
    sections.push(`## Recent Activity\n${activityLines.join("\n")}`);
  }

  // 4. Pending approvals for this agent
  const pendingApprovals = await db
    .select({
      id: approvals.id,
      type: approvals.type,
      status: approvals.status,
      createdAt: approvals.createdAt,
    })
    .from(approvals)
    .where(
      and(
        eq(approvals.companyId, companyId),
        eq(approvals.requestedByAgentId, agentId),
        eq(approvals.status, "pending"),
      ),
    )
    .orderBy(desc(approvals.createdAt))
    .limit(10);

  if (pendingApprovals.length > 0) {
    const approvalLines = pendingApprovals.map(
      (a) => `- [${a.id.slice(0, 8)}] ${a.type} - ${a.status} (${a.createdAt.toISOString().slice(0, 10)})`,
    );
    sections.push(`## Pending Approvals (${pendingApprovals.length})\n${approvalLines.join("\n")}`);
  }

  if (sections.length === 0) {
    return "";
  }

  return `# Morning Briefing\n\n${sections.join("\n\n")}`;
}

// ── Context Drift Detection ────────────────────────────────────────────────

export interface ContextDriftResult {
  driftDetected: boolean;
  similarity: number;
  recommendation: string | null;
}

/**
 * Detect whether the agent's current objective has drifted from the original
 * issue it was assigned.
 *
 * Uses Jaccard similarity on keyword sets derived from the original issue
 * title/description and the currentObjective string. No AI calls.
 *
 * Returns driftDetected=true and a refocus recommendation when similarity
 * falls below 0.5.
 */
export async function detectContextDrift(
  db: Db,
  agentId: string,
  currentObjective: string,
): Promise<ContextDriftResult> {
  // Find the most recent active issue assigned to this agent
  const [activeIssue] = await db
    .select({
      title: issues.title,
      description: issues.description,
    })
    .from(issues)
    .where(
      and(
        eq(issues.assigneeAgentId, agentId),
        // Active statuses only
        // Using sql to match without importing sql operator above (already imported via and/eq)
        // We filter in JS to avoid an extra import
      ),
    )
    .orderBy(desc(issues.createdAt))
    .limit(10);

  // Filter to active statuses in JS (simpler than another sql import)
  // The query above returns all issues; we pick the first active one.
  // Actually we need to re-query with the status filter. Let me fix.
  void activeIssue; // suppress unused warning - actual query is below

  const recentIssues = await db
    .select({
      title: issues.title,
      description: issues.description,
      status: issues.status,
    })
    .from(issues)
    .where(
      and(
        eq(issues.assigneeAgentId, agentId),
      ),
    )
    .orderBy(desc(issues.createdAt))
    .limit(20);

  const active = recentIssues.find(
    (i) => !["done", "cancelled", "backlog"].includes(i.status),
  );

  if (!active) {
    return { driftDetected: false, similarity: 1, recommendation: null };
  }

  // Build keyword sets
  const originalText = `${active.title} ${active.description ?? ""}`;
  const originalKeywords = extractKeywordSet(originalText);
  const currentKeywords = extractKeywordSet(currentObjective);

  const similarity = jaccardSimilarity(originalKeywords, currentKeywords);

  if (similarity >= 0.5) {
    return { driftDetected: false, similarity, recommendation: null };
  }

  // Drift detected - compose a refocus recommendation
  const originalPreview = active.title.length > 80
    ? `${active.title.slice(0, 80)}...`
    : active.title;

  const recommendation = [
    `Context drift detected (similarity: ${(similarity * 100).toFixed(0)}%).`,
    `Original objective: "${originalPreview}".`,
    `Current objective appears to have diverged. Refocus on the original task`,
    `before pursuing related work, or create a separate issue for the new direction.`,
  ].join(" ");

  logger.info(
    { agentId, similarity, originalTitle: active.title },
    "context drift detected in agent objective",
  );

  return { driftDetected: true, similarity, recommendation };
}

// ── Drift helpers ──────────────────────────────────────────────────────────

const DRIFT_STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "was", "are", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "shall", "can", "not", "this",
  "that", "these", "those", "it", "its", "as", "if", "so", "up", "out",
]);

function extractKeywordSet(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !DRIFT_STOP_WORDS.has(w));
  return new Set(words);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersectionSize = 0;
  for (const word of a) {
    if (b.has(word)) intersectionSize++;
  }
  const unionSize = a.size + b.size - intersectionSize;
  return unionSize === 0 ? 1 : intersectionSize / unionSize;
}

// ── Context Pruning ───────────────────────────────────────────────────────────

/**
 * Prune the agent's session context if the current token count exceeds
 * 80% of the model's max token window.
 *
 * Actions taken when pruning threshold is crossed:
 *   1. Archive all but the 5 most recent session_state memory entries
 *   2. Archive all but the top 5 semantic memories by confidence
 *
 * Returns true if pruning happened, false if no action was needed.
 */
export async function pruneContextIfNeeded(
  db: Db,
  agentId: string,
  currentTokenCount: number,
  maxTokens: number,
): Promise<boolean> {
  const utilizationPct = maxTokens > 0 ? currentTokenCount / maxTokens : 0;
  if (utilizationPct < 0.8) return false;

  const now = new Date();

  // 1. Archive older session_state entries, keep the 5 most recent
  const sessionStates = await db
    .select({ id: agentMemoryEntries.id })
    .from(agentMemoryEntries)
    .where(
      and(
        eq(agentMemoryEntries.agentId, agentId),
        eq(agentMemoryEntries.memoryType, "procedural"),
        eq(agentMemoryEntries.category, "session_state"),
        isNull(agentMemoryEntries.archivedAt),
      ),
    )
    .orderBy(desc(agentMemoryEntries.createdAt));

  if (sessionStates.length > 5) {
    const toArchive = sessionStates.slice(5).map((r) => r.id);
    await db
      .update(agentMemoryEntries)
      .set({ archivedAt: now })
      .where(
        and(
          eq(agentMemoryEntries.agentId, agentId),
          isNull(agentMemoryEntries.archivedAt),
          inArray(agentMemoryEntries.id, toArchive),
        ),
      );
  }

  // 2. Archive lower-confidence semantic memories, keep top 5 by confidence
  const semanticMems = await db
    .select({ id: agentMemoryEntries.id, confidence: agentMemoryEntries.confidence })
    .from(agentMemoryEntries)
    .where(
      and(
        eq(agentMemoryEntries.agentId, agentId),
        eq(agentMemoryEntries.memoryType, "semantic"),
        isNull(agentMemoryEntries.archivedAt),
      ),
    )
    .orderBy(desc(agentMemoryEntries.confidence));

  if (semanticMems.length > 5) {
    const toArchive = semanticMems.slice(5).map((r) => r.id);
    if (toArchive.length > 0) {
      await db
        .update(agentMemoryEntries)
        .set({ archivedAt: now })
        .where(
          and(
            eq(agentMemoryEntries.agentId, agentId),
            isNull(agentMemoryEntries.archivedAt),
            inArray(agentMemoryEntries.id, toArchive),
          ),
        );
    }
  }

  logger.info(
    { agentId, currentTokenCount, maxTokens, utilizationPct: Math.round(utilizationPct * 100) },
    "context pruned: archived stale session states and low-confidence memories",
  );

  return true;
}

import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import {
  activityLog,
  agentMemoryEntries,
  approvals,
  issues,
} from "@ironworksai/db";
import { logger } from "../middleware/logger.js";

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

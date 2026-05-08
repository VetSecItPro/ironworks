import type { Db } from "@ironworksai/db";
import { agents, issues } from "@ironworksai/db";
import { eq } from "drizzle-orm";
import { logger } from "../middleware/logger.js";
import { logActivity } from "./activity-log.js";
import { instanceSettingsService } from "./instance-settings.js";
import { type DecisionInput, emitDecisionNotes } from "./periodic-notes/decision-notes.js";

/**
 * Decision Log Service
 *
 * When an agent completes a task (heartbeat finishes), extract key decisions
 * from the output and store them in the activity log with action type
 * `agent.decision`.
 */

export interface DecisionEntry {
  decision: string;
  reasoning: string | null;
  alternativesConsidered: string[] | null;
  issueId: string | null;
  issueTitle: string | null;
}

/**
 * Extract decisions from a heartbeat run's result JSON.
 * Agents may include a `decisions` array in their result output.
 * Each decision should have: decision, reasoning, alternativesConsidered.
 */
export function extractDecisions(
  resultJson: Record<string, unknown> | null,
  contextSnapshot: Record<string, unknown> | null,
): DecisionEntry[] {
  if (!resultJson) return [];

  const decisions: DecisionEntry[] = [];
  const issueId = (contextSnapshot?.issueId as string | null) ?? null;
  const issueTitle = (contextSnapshot?.issueTitle as string | null) ?? null;

  // Check for explicit decisions array in agent output
  const rawDecisions = resultJson.decisions;
  if (Array.isArray(rawDecisions)) {
    for (const d of rawDecisions) {
      if (typeof d === "object" && d !== null) {
        const entry = d as Record<string, unknown>;
        const decision = String(entry.decision ?? entry.what ?? "");
        if (!decision) continue;
        decisions.push({
          decision,
          reasoning: entry.reasoning != null ? String(entry.reasoning ?? entry.why ?? "") : null,
          alternativesConsidered: Array.isArray(entry.alternatives)
            ? (entry.alternatives as unknown[]).map(String)
            : Array.isArray(entry.alternativesConsidered)
              ? (entry.alternativesConsidered as unknown[]).map(String)
              : null,
          issueId,
          issueTitle,
        });
      }
    }
  }

  // Also check for a single decision field
  if (decisions.length === 0 && typeof resultJson.decision === "string" && resultJson.decision.length > 0) {
    decisions.push({
      decision: resultJson.decision,
      reasoning: typeof resultJson.reasoning === "string" ? resultJson.reasoning : null,
      alternativesConsidered: Array.isArray(resultJson.alternatives)
        ? (resultJson.alternatives as unknown[]).map(String)
        : null,
      issueId,
      issueTitle,
    });
  }

  return decisions;
}

/**
 * Log extracted decisions to the activity log.
 */
export async function logDecisions(
  db: Db,
  opts: {
    companyId: string;
    agentId: string;
    runId: string;
    decisions: DecisionEntry[];
  },
): Promise<void> {
  for (const decision of opts.decisions) {
    try {
      await logActivity(db, {
        companyId: opts.companyId,
        actorType: "agent",
        actorId: opts.agentId,
        action: "agent.decision",
        entityType: decision.issueId ? "issue" : "agent",
        entityId: decision.issueId ?? opts.agentId,
        agentId: opts.agentId,
        runId: opts.runId,
        details: {
          decision: decision.decision,
          reasoning: decision.reasoning,
          alternativesConsidered: decision.alternativesConsidered,
          issueId: decision.issueId,
          issueTitle: decision.issueTitle,
        },
      });
    } catch (err) {
      logger.warn({ err, agentId: opts.agentId, runId: opts.runId }, "Failed to log agent decision");
    }
  }

  // P2: Periodic-notes — emit a knowledge-page per decision when enabled
  // (default true). Wrapped in catch-and-swallow so this never blocks the
  // primary activity-log write above. Settings fetch + agent/issue slug
  // lookups are only performed when there are decisions to emit.
  if (opts.decisions.length === 0) return;

  try {
    const settings = await instanceSettingsService(db).getGeneral();
    if (settings.notes?.persistDecisionNotes !== true) return;

    // Resolve agent slug once (all decisions share the same agentId in this batch).
    let decidedByAgentSlug: string | null = null;
    try {
      const agentRow = await db
        .select({ name: agents.name })
        .from(agents)
        .where(eq(agents.id, opts.agentId))
        .limit(1)
        .then((rows) => rows[0] ?? null);
      decidedByAgentSlug = agentRow?.name ?? null;
    } catch (lookupErr) {
      logger.debug({ err: lookupErr, agentId: opts.agentId }, "[periodic-notes] agent slug lookup failed");
    }

    // Resolve unique issue identifiers in one query (decisions may share issue).
    const issueIdSet = new Set<string>();
    for (const d of opts.decisions) {
      if (d.issueId) issueIdSet.add(d.issueId);
    }
    const issueSlugById = new Map<string, string | null>();
    if (issueIdSet.size > 0) {
      try {
        const rows = await db
          .select({ id: issues.id, identifier: issues.identifier })
          .from(issues)
          .where(eq(issues.companyId, opts.companyId));
        for (const r of rows) {
          if (issueIdSet.has(r.id)) issueSlugById.set(r.id, r.identifier ?? null);
        }
      } catch (lookupErr) {
        logger.debug({ err: lookupErr }, "[periodic-notes] issue slug lookup failed");
      }
    }

    const mappedInputs: DecisionInput[] = opts.decisions.map((d) => {
      const decisionId = `${opts.runId}-${Math.abs(hashString(d.decision)).toString(36).slice(0, 8)}`;
      return {
        decisionId,
        title: d.decision.length > 80 ? `${d.decision.slice(0, 77)}...` : d.decision,
        rationale: d.reasoning,
        // The DecisionEntry shape doesn't carry a lifecycle status; treat all
        // emitted decisions as "accepted" since they were captured from a
        // succeeded run's result. Future spec iterations can plumb a real
        // status through extractDecisions if needed.
        status: "accepted",
        contextIssueSlug: d.issueId ? (issueSlugById.get(d.issueId) ?? null) : null,
        decidedByAgentSlug,
        // No project plumbed through DecisionEntry today; leave null.
        projectSlug: null,
        alternatives: d.alternativesConsidered,
        // Consequences not captured in current DecisionEntry shape.
        consequences: null,
      };
    });

    await emitDecisionNotes(db, { companyId: opts.companyId, decisions: mappedInputs });
  } catch (err) {
    logger.warn({ err, agentId: opts.agentId, runId: opts.runId }, "[periodic-notes] decision notes emit failed");
  }
}

/**
 * Tiny non-cryptographic hash for stable per-decision IDs derived from
 * (runId, decision text). Collisions across decisions in the same run are
 * vanishingly rare given the 8-char base36 suffix; on collision the second
 * write hits the existing slug and `emitDecisionNotes` updates in place.
 */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

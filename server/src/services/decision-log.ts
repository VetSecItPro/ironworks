import type { Db } from "@ironworksai/db";
import { logActivity } from "./activity-log.js";
import { logger } from "../middleware/logger.js";

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
  const issueId = contextSnapshot?.issueId as string | null ?? null;
  const issueTitle = contextSnapshot?.issueTitle as string | null ?? null;

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
}

/**
 * Decision emitter.
 *
 * Called from `logDecisions` (T9) when `notes.persistDecisionNotes` is enabled.
 * Per-decision try/catch: a single failure does not block the rest of the
 * batch. Caller receives a result array with per-decision pageId or error
 * string so failures can be surfaced + logged in context.
 *
 * Idempotent: re-running with the same `decisionId` updates the existing page.
 */
import type { Db } from "@ironworksai/db";
import type { DecisionFrontmatter } from "@ironworksai/shared";
import { renderFrontmatter } from "@ironworksai/shared";
import { logger } from "../../middleware/logger.js";
import { knowledgeService } from "../knowledge.js";
import { renderDecisionBody } from "./render.js";

export interface DecisionInput {
  decisionId: string;
  rationale: string | null;
  status: "proposed" | "accepted" | "superseded" | "deprecated";
  contextIssueSlug: string | null;
  decidedByAgentSlug: string | null;
  projectSlug: string | null;
  alternatives: string[] | null;
  consequences: string[] | null;
  /** Human-readable title (used as page title; slug is derived from decisionId). */
  title: string;
}

export interface DecisionEmitResult {
  decisionId: string;
  pageId?: string;
  error?: string;
}

/** Emit one knowledge page per decision; isolated try/catch keeps the batch resilient. */
export async function emitDecisionNotes(
  db: Db,
  args: { companyId: string; decisions: DecisionInput[] },
): Promise<DecisionEmitResult[]> {
  if (args.decisions.length === 0) return [];

  const svc = knowledgeService(db);
  const out: DecisionEmitResult[] = [];

  for (const d of args.decisions) {
    try {
      const slug = `decisions/${d.decisionId}`;
      const now = new Date().toISOString();
      const fm: DecisionFrontmatter = {
        id: d.decisionId,
        type: "decision",
        title: d.title,
        created_at: now,
        updated_at: now,
        visibility: "company",
        decision_id: d.decisionId,
        status: d.status,
        ...(d.contextIssueSlug !== null ? { context_issue_id: d.contextIssueSlug } : {}),
        ...(d.decidedByAgentSlug !== null ? { decided_by_agent_id: d.decidedByAgentSlug } : {}),
        ...(d.alternatives !== null && d.alternatives.length > 0 ? { alternatives_considered: d.alternatives } : {}),
        ...(d.consequences !== null && d.consequences.length > 0 ? { consequences: d.consequences } : {}),
      };

      const body =
        renderFrontmatter(fm) +
        "\n" +
        renderDecisionBody({
          decisionId: d.decisionId,
          rationale: d.rationale,
          status: d.status,
          contextIssueSlug: d.contextIssueSlug,
          decidedByAgentSlug: d.decidedByAgentSlug,
          projectSlug: d.projectSlug,
          alternatives: d.alternatives,
          consequences: d.consequences,
        });

      const existing = await svc.getBySlug(args.companyId, slug);
      if (existing) {
        const updated = await svc.update(
          existing.id,
          { title: d.title, body, changeSummary: `Decision ${d.decisionId} updated` },
          {},
        );
        out.push({ decisionId: d.decisionId, pageId: updated.id });
      } else {
        const created = await svc.create(args.companyId, { title: d.title, body, slug, visibility: "company" }, {});
        out.push({ decisionId: d.decisionId, pageId: created.id });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { err, decisionId: d.decisionId, companyId: args.companyId },
        "emitDecisionNotes: failed to emit decision page",
      );
      out.push({ decisionId: d.decisionId, error: message });
    }
  }

  return out;
}

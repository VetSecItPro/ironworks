/**
 * Run-transcript emitter.
 *
 * Called from heartbeat finalize (T8) when `notes.persistRunNotes` is enabled.
 * Builds a `RunFrontmatter` + body and writes it as a knowledge page via
 * `knowledgeService`. Idempotent on slug: re-running for the same `runId`
 * updates the existing page (revisionNumber bumps).
 *
 * Failure mode: caller wraps with try/catch + log + swallow. We throw on
 * unexpected DB errors so the wrapping logger can record context. We do NOT
 * throw for "missing agent slug" - that fallback is encoded here.
 */
import type { Db } from "@ironworksai/db";
import type { RunFrontmatter } from "@ironworksai/shared";
import { renderFrontmatter } from "@ironworksai/shared";
import { logger } from "../../middleware/logger.js";
import { knowledgeService } from "../knowledge.js";
import { renderRunBody } from "./render.js";

export interface RunNoteInput {
  companyId: string;
  agentId: string;
  agentSlug: string | null;
  agentTitle: string;
  runId: string;
  status: "succeeded" | "failed" | "cancelled" | "timed_out";
  startedAt: Date;
  completedAt: Date;
  costUsd: number | null;
  linkedIssueRef: string | null;
  linkedIssueSlug: string | null;
  summary: string | null;
}

/** Truncate a runId to 8 chars for slug + display readability. */
function shortRunId(runId: string): string {
  // Strip non-alphanumeric so slugs stay clean (e.g. "run_abc123" -> "runabc12").
  const cleaned = runId.replace(/[^a-zA-Z0-9]/g, "");
  return cleaned.slice(0, 8) || runId.slice(0, 8) || "unknown";
}

function isoDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Emit (create or update) a run-transcript knowledge page.
 *
 * Slug pattern: `agents/<agentSlug>/runs/<YYYY-MM-DD>/<runIdShort>`
 *   - YYYY-MM-DD derived from `completedAt` in UTC for stability across
 *     timezones; the body uses ISO instants so the readable timestamp
 *     in the doc remains exact.
 *   - When `agentSlug` is null, falls back to `_unknown` and warns.
 *
 * Title: `Run <runIdShort> - <agentTitle> (<status>)` (plain hyphens; em-dashes
 * are forbidden by project style).
 */
export async function emitRunNote(db: Db, input: RunNoteInput): Promise<{ pageId: string }> {
  const svc = knowledgeService(db);

  let agentSlugForPath = input.agentSlug;
  if (agentSlugForPath === null) {
    logger.warn(
      { runId: input.runId, agentId: input.agentId, companyId: input.companyId },
      "emitRunNote: missing agentSlug, using `_unknown` fallback",
    );
    agentSlugForPath = "_unknown";
  }

  const runShort = shortRunId(input.runId);
  const datePart = isoDateUtc(input.completedAt);
  const slug = `agents/${agentSlugForPath}/runs/${datePart}/${runShort}`;
  const title = `Run ${runShort} - ${input.agentTitle} (${input.status})`;

  const now = new Date().toISOString();
  const fm: RunFrontmatter = {
    id: input.runId,
    type: "run",
    title,
    created_at: input.startedAt.toISOString(),
    updated_at: now,
    visibility: "company",
    agent_id: input.agentId,
    invocation_source: "heartbeat",
    status: input.status,
    started_at: input.startedAt.toISOString(),
    finished_at: input.completedAt.toISOString(),
  };

  const body =
    renderFrontmatter(fm) +
    "\n" +
    renderRunBody({
      agentSlug: input.agentSlug,
      agentTitle: input.agentTitle,
      runId: input.runId,
      status: input.status,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      costUsd: input.costUsd,
      linkedIssueRef: input.linkedIssueRef,
      linkedIssueSlug: input.linkedIssueSlug,
      summary: input.summary,
    });

  const existing = await svc.getBySlug(input.companyId, slug);
  const actor = { agentId: input.agentId };

  if (existing) {
    const updated = await svc.update(existing.id, { title, body, changeSummary: `Run ${runShort} re-emitted` }, actor);
    return { pageId: updated.id };
  }

  const created = await svc.create(input.companyId, { title, body, slug, visibility: "company" }, actor);
  return { pageId: created.id };
}

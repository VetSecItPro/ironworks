/**
 * heartbeat-post-run.ts
 *
 * Post-run processing: session state persistence, channel posting,
 * agent-authored channel message extraction, cost recording,
 * runtime state updates, and the quality-gate PDCA "act" phase event.
 */

import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import {
  agentChannels,
  agentRuntimeState,
  agents,
  heartbeatRuns,
  projects,
} from "@ironworksai/db";
import type { AdapterExecutionResult } from "../adapters/index.js";
import { logger } from "../middleware/logger.js";
import { costService } from "./costs.js";
import type { BudgetEnforcementScope } from "./budgets.js";
import { saveSessionState } from "./session-state.js";
import {
  ensureProjectChannel,
  findAgentDepartmentChannel,
  postMessage as postChannelMessage,
} from "./channels.js";
import { summarizeHeartbeatRunResultJson } from "./heartbeat-run-summary.js";
import { extractChannelMessages } from "../lib/channel-extraction.js";
import {
  normalizeLedgerBillingType,
  normalizeBilledCostCents,
  resolveLedgerBiller,
  readNonEmptyString,
  type UsageTotals,
} from "./heartbeat-types.js";
import { parseObject } from "../adapters/utils.js";

// Re-export so callers don't need to know where these live internally
export type { BudgetEnforcementScope };

// ── Runtime state + cost recording ────────────────────────────────────────

interface UpdateRuntimeStateOpts {
  result: AdapterExecutionResult;
  session: { legacySessionId: string | null };
  normalizedUsage?: UsageTotals | null;
  budgetHooks: { cancelWorkForScope: (scope: BudgetEnforcementScope) => Promise<void> };
}

export async function updateRuntimeState(
  db: Db,
  agent: typeof agents.$inferSelect,
  run: typeof heartbeatRuns.$inferSelect,
  opts: UpdateRuntimeStateOpts,
): Promise<void> {
  const { result, session, normalizedUsage, budgetHooks } = opts;

  // Ensure row exists (called after ensureRuntimeState in executeRun)
  const usage = normalizedUsage ?? null;
  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  const cachedInputTokens = usage?.cachedInputTokens ?? 0;
  const billingType = normalizeLedgerBillingType(result.billingType);
  const additionalCostCents = normalizeBilledCostCents(result.costUsd, billingType);
  const hasTokenUsage = inputTokens > 0 || outputTokens > 0 || cachedInputTokens > 0;
  const provider = result.provider ?? "unknown";
  const biller = resolveLedgerBiller(result);
  const ledgerScope = await resolveLedgerScopeForRun(db, agent.companyId, run);

  await db
    .update(agentRuntimeState)
    .set({
      adapterType: agent.adapterType,
      sessionId: session.legacySessionId,
      lastRunId: run.id,
      lastRunStatus: run.status,
      lastError: result.errorMessage ?? null,
      totalInputTokens: sql`${agentRuntimeState.totalInputTokens} + ${inputTokens}`,
      totalOutputTokens: sql`${agentRuntimeState.totalOutputTokens} + ${outputTokens}`,
      totalCachedInputTokens: sql`${agentRuntimeState.totalCachedInputTokens} + ${cachedInputTokens}`,
      totalCostCents: sql`${agentRuntimeState.totalCostCents} + ${additionalCostCents}`,
      updatedAt: new Date(),
    })
    .where(eq(agentRuntimeState.agentId, agent.id));

  if (additionalCostCents > 0 || hasTokenUsage) {
    const costs = costService(db, budgetHooks);
    await costs.createEvent(agent.companyId, {
      heartbeatRunId: run.id,
      agentId: agent.id,
      issueId: ledgerScope.issueId,
      projectId: ledgerScope.projectId,
      provider,
      biller,
      billingType,
      model: result.model ?? "unknown",
      inputTokens,
      cachedInputTokens,
      outputTokens,
      costCents: additionalCostCents,
      occurredAt: new Date(),
    });
  }
}

async function resolveLedgerScopeForRun(
  db: Db,
  companyId: string,
  run: typeof heartbeatRuns.$inferSelect,
) {
  const { issues } = await import("@ironworksai/db");
  const context = parseObject(run.contextSnapshot);
  const contextIssueId = readNonEmptyString(context.issueId);
  const contextProjectId = readNonEmptyString(context.projectId);

  if (!contextIssueId) {
    return { issueId: null, projectId: contextProjectId };
  }

  const issue = await db
    .select({ id: issues.id, projectId: issues.projectId })
    .from(issues)
    .where(and(eq(issues.id, contextIssueId), eq(issues.companyId, companyId)))
    .then((rows) => rows[0] ?? null);

  return {
    issueId: issue?.id ?? null,
    projectId: issue?.projectId ?? contextProjectId,
  };
}

// ── Session state saving ───────────────────────────────────────────────────

export async function savePostRunSessionState(
  db: Db,
  opts: {
    agentId: string;
    companyId: string;
    issueId: string | null;
    runId: string;
    outcome: "succeeded" | "failed" | "cancelled" | "timed_out";
    adapterResultJson: unknown;
  },
): Promise<void> {
  try {
    const resultSummary = summarizeHeartbeatRunResultJson(
      (opts.adapterResultJson ?? null) as Record<string, unknown> | null,
    );
    const summaryText =
      typeof resultSummary?.summary === "string" ? resultSummary.summary : `Run ${opts.outcome}`;
    await saveSessionState(db, {
      agentId: opts.agentId,
      companyId: opts.companyId,
      issueId: opts.issueId ?? null,
      summary: summaryText,
      lastAction: `heartbeat run ${opts.runId.slice(0, 8)} - ${opts.outcome}`,
      pendingWork:
        opts.outcome === "succeeded"
          ? null
          : `Previous run ${opts.outcome} - may need retry`,
    });
  } catch (sessionStateErr) {
    logger.warn({ err: sessionStateErr, runId: opts.runId }, "failed to save session state after run");
  }
}

// ── Channel posting after successful run ───────────────────────────────────

export async function postSuccessChannelMessages(
  db: Db,
  agent: { id: string; companyId: string; department: string | null },
  issueId: string | null,
  issueContext: {
    title?: string | null;
    projectId?: string | null;
  } | null,
): Promise<void> {
  if (!issueId) return;

  try {
    const issueTitle = typeof issueContext?.title === "string" ? issueContext.title : null;
    if (issueTitle) {
      const deptChannel = await findAgentDepartmentChannel(db, agent.companyId, agent.department ?? null);
      if (deptChannel) {
        await postChannelMessage(db, {
          channelId: deptChannel.id,
          companyId: agent.companyId,
          authorAgentId: agent.id,
          body: `Completed work on: ${issueTitle}`,
          messageType: "status_update",
        });
      }

      // Also post to the project channel if the issue belongs to a project.
      const projectId = issueContext?.projectId ?? null;
      if (projectId) {
        try {
          const projectRow = await db
            .select({ name: projects.name })
            .from(projects)
            .where(and(eq(projects.id, projectId), eq(projects.companyId, agent.companyId)))
            .then((rows) => rows[0] ?? null);

          if (projectRow) {
            const projectChannelId = await ensureProjectChannel(
              db,
              agent.companyId,
              projectId,
              projectRow.name,
            );
            await postChannelMessage(db, {
              channelId: projectChannelId,
              companyId: agent.companyId,
              authorAgentId: agent.id,
              body: `Update on ${projectRow.name}: completed "${issueTitle}"`,
              messageType: "status_update",
            });
          }
        } catch (projChannelErr) {
          logger.debug(
            { err: projChannelErr, agentId: agent.id },
            "project channel post-run message failed, skipping",
          );
        }
      }
    }
  } catch (channelErr) {
    logger.debug({ err: channelErr, agentId: agent.id }, "post-run channel message failed, skipping");
  }
}

// ── Extract and post agent-authored channel messages ───────────────────────

export async function extractAndPostAgentChannelMessages(
  db: Db,
  agent: { id: string; companyId: string },
  agentOutput: string,
): Promise<void> {
  try {
    const channelMsgs = extractChannelMessages(agentOutput);
    for (const { channel: channelName, body: messageBody } of channelMsgs) {
      const [targetChannel] = await db
        .select({ id: agentChannels.id })
        .from(agentChannels)
        .where(
          and(
            eq(agentChannels.companyId, agent.companyId),
            sql`lower(${agentChannels.name}) = ${channelName}`,
          ),
        )
        .limit(1);
      if (targetChannel) {
        await postChannelMessage(db, {
          channelId: targetChannel.id,
          companyId: agent.companyId,
          authorAgentId: agent.id,
          body: messageBody,
          messageType: "message",
        });
        logger.info(
          { agentId: agent.id, channel: channelName, bodyLen: messageBody.length },
          "agent posted to channel from run output",
        );
      }
    }
  } catch (channelExtractErr) {
    logger.debug(
      { err: channelExtractErr, agentId: agent.id },
      "channel message extraction from output failed, skipping",
    );
  }
}

// ── Decision log extraction ────────────────────────────────────────────────

export async function extractAndLogDecisions(
  db: Db,
  agent: { id: string; companyId: string },
  run: typeof heartbeatRuns.$inferSelect,
  resultJson: unknown,
): Promise<void> {
  try {
    const { extractDecisions, logDecisions } = await import("./decision-log.js");
    const contextSnap = (run.contextSnapshot ?? null) as Record<string, unknown> | null;
    const decisions = extractDecisions(resultJson as Record<string, unknown>, contextSnap);
    if (decisions.length > 0) {
      await logDecisions(db, {
        companyId: agent.companyId,
        agentId: agent.id,
        runId: run.id,
        decisions,
      });
    }
  } catch (decisionLogErr) {
    logger.debug({ err: decisionLogErr, runId: run.id }, "decision log extraction failed, skipping");
  }
}

/**
 * heartbeat-cancellation.ts
 *
 * Cancel/pause/budget enforcement for heartbeat runs and wakeup requests.
 * Handles: cancelRun, cancelActiveForAgent, cancelBudgetScopeWork,
 * and budget-related pending wakeup cancellations.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { agentWakeupRequests, heartbeatRuns, issues } from "@ironworksai/db";
import type { BudgetEnforcementScope } from "./budgets.js";
import { notFound } from "../errors.js";
import { runningProcesses } from "../adapters/index.js";
import { publishLiveEvent } from "./live-events.js";

// Re-exported for convenience
export type { BudgetEnforcementScope };

// ── Internal helpers ────────────────────────────────────────────────────────

async function setRunStatus(
  db: Db,
  runId: string,
  status: string,
  patch?: Partial<typeof heartbeatRuns.$inferInsert>,
) {
  const updated = await db
    .update(heartbeatRuns)
    .set({ status, ...patch, updatedAt: new Date() })
    .where(eq(heartbeatRuns.id, runId))
    .returning()
    .then((rows) => rows[0] ?? null);

  if (updated) {
    publishLiveEvent({
      companyId: updated.companyId,
      type: "heartbeat.run.status",
      payload: {
        runId: updated.id,
        agentId: updated.agentId,
        status: updated.status,
        invocationSource: updated.invocationSource,
        triggerDetail: updated.triggerDetail,
        error: updated.error ?? null,
        errorCode: updated.errorCode ?? null,
        startedAt: updated.startedAt ? new Date(updated.startedAt).toISOString() : null,
        finishedAt: updated.finishedAt ? new Date(updated.finishedAt).toISOString() : null,
      },
    });
  }

  return updated;
}

async function setWakeupStatus(
  db: Db,
  wakeupRequestId: string | null | undefined,
  status: string,
  patch?: Partial<typeof agentWakeupRequests.$inferInsert>,
) {
  if (!wakeupRequestId) return;
  await db
    .update(agentWakeupRequests)
    .set({ status, ...patch, updatedAt: new Date() })
    .where(eq(agentWakeupRequests.id, wakeupRequestId));
}

async function getRun(db: Db, runId: string) {
  return db
    .select()
    .from(heartbeatRuns)
    .where(eq(heartbeatRuns.id, runId))
    .then((rows) => rows[0] ?? null);
}

// ── Project-scoped run/wakeup helpers ─────────────────────────────────────

export async function listProjectScopedRunIds(
  db: Db,
  companyId: string,
  projectId: string,
): Promise<string[]> {
  const runIssueId = sql<string | null>`${heartbeatRuns.contextSnapshot} ->> 'issueId'`;
  const effectiveProjectId = sql<string | null>`coalesce(${heartbeatRuns.contextSnapshot} ->> 'projectId', ${issues.projectId}::text)`;

  const rows = await db
    .selectDistinctOn([heartbeatRuns.id], { id: heartbeatRuns.id })
    .from(heartbeatRuns)
    .leftJoin(
      issues,
      and(eq(issues.companyId, companyId), sql`${issues.id}::text = ${runIssueId}`),
    )
    .where(
      and(
        eq(heartbeatRuns.companyId, companyId),
        inArray(heartbeatRuns.status, ["queued", "running"]),
        sql`${effectiveProjectId} = ${projectId}`,
      ),
    );

  return rows.map((row) => row.id);
}

export async function listProjectScopedWakeupIds(
  db: Db,
  companyId: string,
  projectId: string,
): Promise<string[]> {
  const wakeIssueId = sql<string | null>`${agentWakeupRequests.payload} ->> 'issueId'`;
  const effectiveProjectId = sql<string | null>`coalesce(${agentWakeupRequests.payload} ->> 'projectId', ${issues.projectId}::text)`;

  const rows = await db
    .selectDistinctOn([agentWakeupRequests.id], { id: agentWakeupRequests.id })
    .from(agentWakeupRequests)
    .leftJoin(
      issues,
      and(eq(issues.companyId, companyId), sql`${issues.id}::text = ${wakeIssueId}`),
    )
    .where(
      and(
        eq(agentWakeupRequests.companyId, companyId),
        inArray(agentWakeupRequests.status, ["queued", "deferred_issue_execution"]),
        sql`${agentWakeupRequests.runId} is null`,
        sql`${effectiveProjectId} = ${projectId}`,
      ),
    );

  return rows.map((row) => row.id);
}

// ── Cancel pending wakeups for budget scope ────────────────────────────────

export async function cancelPendingWakeupsForBudgetScope(
  db: Db,
  scope: BudgetEnforcementScope,
): Promise<number> {
  const now = new Date();
  let wakeupIds: string[] = [];

  if (scope.scopeType === "company") {
    wakeupIds = await db
      .select({ id: agentWakeupRequests.id })
      .from(agentWakeupRequests)
      .where(
        and(
          eq(agentWakeupRequests.companyId, scope.companyId),
          inArray(agentWakeupRequests.status, ["queued", "deferred_issue_execution"]),
          sql`${agentWakeupRequests.runId} is null`,
        ),
      )
      .then((rows) => rows.map((row) => row.id));
  } else if (scope.scopeType === "agent") {
    wakeupIds = await db
      .select({ id: agentWakeupRequests.id })
      .from(agentWakeupRequests)
      .where(
        and(
          eq(agentWakeupRequests.companyId, scope.companyId),
          eq(agentWakeupRequests.agentId, scope.scopeId),
          inArray(agentWakeupRequests.status, ["queued", "deferred_issue_execution"]),
          sql`${agentWakeupRequests.runId} is null`,
        ),
      )
      .then((rows) => rows.map((row) => row.id));
  } else {
    wakeupIds = await listProjectScopedWakeupIds(db, scope.companyId, scope.scopeId);
  }

  if (wakeupIds.length === 0) return 0;

  await db
    .update(agentWakeupRequests)
    .set({
      status: "cancelled",
      finishedAt: now,
      error: "Cancelled due to budget pause",
      updatedAt: now,
    })
    .where(inArray(agentWakeupRequests.id, wakeupIds));

  return wakeupIds.length;
}

// ── cancelRunInternal ──────────────────────────────────────────────────────

export async function cancelRunInternal(
  db: Db,
  runId: string,
  reason = "Cancelled by control plane",
  hooks: {
    appendRunEvent: (
      run: typeof heartbeatRuns.$inferSelect,
      seq: number,
      event: { eventType: string; stream?: "system"; level?: "warn" | "info" | "error"; message?: string },
    ) => Promise<void>;
    nextRunEventSeq: (runId: string) => Promise<number>;
    releaseIssueExecutionAndPromote: (run: typeof heartbeatRuns.$inferSelect) => Promise<void>;
    finalizeAgentStatus: (agentId: string, outcome: "cancelled") => Promise<void>;
    startNextQueuedRunForAgent: (agentId: string) => Promise<unknown>;
  },
) {
  const run = await getRun(db, runId);
  if (!run) throw notFound("Heartbeat run not found");
  if (run.status !== "running" && run.status !== "queued") return run;

  const running = runningProcesses.get(run.id);
  if (running) {
    running.child.kill("SIGTERM");
    const graceMs = Math.max(1, running.graceSec) * 1000;
    setTimeout(() => {
      if (!running.child.killed) {
        running.child.kill("SIGKILL");
      }
    }, graceMs);
  }

  const cancelled = await setRunStatus(db, run.id, "cancelled", {
    finishedAt: new Date(),
    error: reason,
    errorCode: "cancelled",
  });

  await setWakeupStatus(db, run.wakeupRequestId, "cancelled", {
    finishedAt: new Date(),
    error: reason,
  });

  if (cancelled) {
    await hooks.appendRunEvent(cancelled, 1, {
      eventType: "lifecycle",
      stream: "system",
      level: "warn",
      message: "run cancelled",
    });
    await hooks.releaseIssueExecutionAndPromote(cancelled);
  }

  runningProcesses.delete(run.id);
  await hooks.finalizeAgentStatus(run.agentId, "cancelled");
  await hooks.startNextQueuedRunForAgent(run.agentId);
  return cancelled;
}

// ── cancelActiveForAgentInternal ──────────────────────────────────────────

export async function cancelActiveForAgentInternal(
  db: Db,
  agentId: string,
  reason = "Cancelled due to agent pause",
  hooks: {
    releaseIssueExecutionAndPromote: (run: typeof heartbeatRuns.$inferSelect) => Promise<void>;
  },
): Promise<number> {
  const runs = await db
    .select()
    .from(heartbeatRuns)
    .where(
      and(eq(heartbeatRuns.agentId, agentId), inArray(heartbeatRuns.status, ["queued", "running"])),
    );

  await Promise.all(
    runs.map(async (run) => {
      await setRunStatus(db, run.id, "cancelled", {
        finishedAt: new Date(),
        error: reason,
        errorCode: "cancelled",
      });

      await setWakeupStatus(db, run.wakeupRequestId, "cancelled", {
        finishedAt: new Date(),
        error: reason,
      });

      const running = runningProcesses.get(run.id);
      if (running) {
        running.child.kill("SIGTERM");
        runningProcesses.delete(run.id);
      }
      await hooks.releaseIssueExecutionAndPromote(run);
    }),
  );

  return runs.length;
}

// ── cancelBudgetScopeWork ─────────────────────────────────────────────────

export async function cancelBudgetScopeWork(
  db: Db,
  scope: BudgetEnforcementScope,
  hooks: {
    cancelRunInternal: (runId: string, reason: string) => Promise<unknown>;
    cancelActiveForAgentInternal: (agentId: string, reason: string) => Promise<number>;
  },
): Promise<void> {
  if (scope.scopeType === "agent") {
    await hooks.cancelActiveForAgentInternal(scope.scopeId, "Cancelled due to budget pause");
    await cancelPendingWakeupsForBudgetScope(db, scope);
    return;
  }

  const runIds =
    scope.scopeType === "company"
      ? await db
          .select({ id: heartbeatRuns.id })
          .from(heartbeatRuns)
          .where(
            and(
              eq(heartbeatRuns.companyId, scope.companyId),
              inArray(heartbeatRuns.status, ["queued", "running"]),
            ),
          )
          .then((rows) => rows.map((row) => row.id))
      : await listProjectScopedRunIds(db, scope.companyId, scope.scopeId);

  await Promise.all(runIds.map((runId) => hooks.cancelRunInternal(runId, "Cancelled due to budget pause")));

  await cancelPendingWakeupsForBudgetScope(db, scope);
}

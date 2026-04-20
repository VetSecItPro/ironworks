/**
 * heartbeat-scheduling.ts
 *
 * Wake/sleep scheduling, queue management, timer ticks, reap orphaned runs,
 * resume queued runs, and the enqueueWakeup / releaseIssueExecutionAndPromote
 * orchestration logic.
 */

import type { Db } from "@ironworksai/db";
import {
  agentRuntimeState,
  agents,
  agentTaskSessions,
  agentWakeupRequests,
  heartbeatRuns,
  issues,
} from "@ironworksai/db";
import type { SchedulerSettings } from "@ironworksai/shared";
import { DEFAULT_ITERATION_LIMITS } from "@ironworksai/shared";
import { and, asc, desc, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import type { AdapterSessionCodec } from "../adapters/index.js";
import { getServerAdapter, runningProcesses } from "../adapters/index.js";
import { asBoolean, asNumber, parseObject } from "../adapters/utils.js";
import { conflict, notFound } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { logActivity } from "./activity-log.js";
import type { BudgetEnforcementScope } from "./budgets.js";
import { budgetService } from "./budgets.js";
import {
  buildExplicitResumeSessionOverride,
  DEFERRED_WAKE_CONTEXT_KEY,
  DETACHED_PROCESS_ERROR_CODE,
  deriveTaskKey,
  enrichWakeContextSnapshot,
  isProcessAlive,
  isSameTaskScope,
  isTrackedLocalChildProcessAdapter,
  mergeCoalescedContextSnapshot,
  normalizeAgentNameKey,
  normalizeMaxConcurrentRuns,
  normalizeSessionParams,
  readNonEmptyString,
  startLocksByAgent,
  truncateDisplayId,
  type WakeupOptions,
} from "./heartbeat-types.js";
import { publishLiveEvent } from "./live-events.js";

// ── Idle detection ────────────────────────────────────────────────────────

export async function hasAssignedWork(db: Db, agentId: string, companyId: string): Promise<boolean> {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(issues)
    .where(
      and(
        eq(issues.companyId, companyId),
        eq(issues.assigneeAgentId, agentId),
        inArray(issues.status, ["todo", "in_progress"]),
      ),
    )
    .limit(1);
  return (Number(result?.count) ?? 0) > 0;
}

// ── Cached scheduler settings ─────────────────────────────────────────────

let cachedSchedulerSettings: SchedulerSettings | null = null;
let cachedSettingsAt = 0;
const SETTINGS_CACHE_MS = 60_000; // refresh every 60s

export async function getSchedulerSettings(db: Db): Promise<SchedulerSettings> {
  const now = Date.now();
  if (cachedSchedulerSettings && now - cachedSettingsAt < SETTINGS_CACHE_MS) {
    return cachedSchedulerSettings;
  }
  try {
    const { instanceSettingsService } = await import("./instance-settings.js");
    const svc = instanceSettingsService(db);
    const general = await svc.getGeneral();
    if (general?.scheduler) {
      cachedSchedulerSettings = general.scheduler;
      cachedSettingsAt = now;
      return cachedSchedulerSettings;
    }
  } catch {
    // Fall through to defaults
  }
  const defaults: SchedulerSettings = {
    iterationLimitPerDay: DEFAULT_ITERATION_LIMITS.perDay,
    iterationLimitPerTask: DEFAULT_ITERATION_LIMITS.perTask,
    costAnomalyMultiplier: 5,
    consecutiveFailureLimit: 5,
    idleSkipEnabled: true,
    heartbeatSafetyNetMinutes: 30,
  };
  cachedSchedulerSettings = defaults;
  cachedSettingsAt = now;
  return defaults;
}

// ── Lock helper ────────────────────────────────────────────────────────────

export async function withAgentStartLock<T>(agentId: string, fn: () => Promise<T>): Promise<T> {
  const previous = startLocksByAgent.get(agentId) ?? Promise.resolve();
  const run = previous.then(fn);
  const marker = run.then(
    () => undefined,
    () => undefined,
  );
  startLocksByAgent.set(agentId, marker);
  try {
    return await run;
  } finally {
    if (startLocksByAgent.get(agentId) === marker) {
      startLocksByAgent.delete(agentId);
    }
  }
}

// ── Heartbeat policy ───────────────────────────────────────────────────────

export function parseHeartbeatPolicy(agent: typeof agents.$inferSelect) {
  const runtimeConfig = parseObject(agent.runtimeConfig);
  const heartbeat = parseObject(runtimeConfig.heartbeat);

  return {
    enabled: asBoolean(heartbeat.enabled, true),
    intervalSec: Math.max(0, asNumber(heartbeat.intervalSec, 0)),
    wakeOnDemand: asBoolean(
      heartbeat.wakeOnDemand ?? heartbeat.wakeOnAssignment ?? heartbeat.wakeOnOnDemand ?? heartbeat.wakeOnAutomation,
      true,
    ),
    maxConcurrentRuns: normalizeMaxConcurrentRuns(heartbeat.maxConcurrentRuns),
  };
}

// ── Iteration limits ───────────────────────────────────────────────────────

async function countAgentRunsToday(db: Db, agentId: string): Promise<number> {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(heartbeatRuns)
    .where(and(eq(heartbeatRuns.agentId, agentId), gte(heartbeatRuns.createdAt, startOfDay)));
  return Number(count ?? 0);
}

async function countAgentRunsForIssueToday(db: Db, agentId: string, issueId: string): Promise<number> {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(heartbeatRuns)
    .where(
      and(
        eq(heartbeatRuns.agentId, agentId),
        gte(heartbeatRuns.createdAt, startOfDay),
        sql`${heartbeatRuns.contextSnapshot} ->> 'issueId' = ${issueId}`,
      ),
    );
  return Number(count ?? 0);
}

export async function checkIterationLimits(
  db: Db,
  agentId: string,
  companyId: string,
  issueId: string | null,
): Promise<string | null> {
  const settings = await getSchedulerSettings(db);
  const perDay = settings.iterationLimitPerDay;
  const perTask = settings.iterationLimitPerTask;

  const dailyCount = await countAgentRunsToday(db, agentId);
  if (dailyCount >= perDay) {
    await pauseAgentForIterationLimit(db, agentId, companyId, "daily");
    return `Agent exceeded daily iteration limit (${perDay} runs/day)`;
  }

  if (issueId) {
    const taskCount = await countAgentRunsForIssueToday(db, agentId, issueId);
    if (taskCount >= perTask) {
      await pauseAgentForIterationLimit(db, agentId, companyId, "per_task");
      return `Agent exceeded per-task iteration limit (${perTask} runs/task/day)`;
    }
  }

  return null;
}

async function pauseAgentForIterationLimit(
  db: Db,
  agentId: string,
  companyId: string,
  kind: "daily" | "per_task",
): Promise<void> {
  const now = new Date();
  await db
    .update(agents)
    .set({
      status: "paused",
      pauseReason: "iteration_limit",
      pausedAt: now,
      updatedAt: now,
    })
    .where(and(eq(agents.id, agentId), inArray(agents.status, ["active", "idle", "running", "error"])));

  await logActivity(db, {
    companyId,
    actorType: "system",
    actorId: "iteration_guard",
    action: "agent.paused",
    entityType: "agent",
    entityId: agentId,
    details: {
      reason: "iteration_limit",
      kind,
      limit: kind === "daily" ? DEFAULT_ITERATION_LIMITS.perDay : DEFAULT_ITERATION_LIMITS.perTask,
    },
  });
}

// ── Run counting ───────────────────────────────────────────────────────────

export async function countRunningRunsForAgent(db: Db, agentId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(heartbeatRuns)
    .where(and(eq(heartbeatRuns.agentId, agentId), eq(heartbeatRuns.status, "running")));
  return Number(count ?? 0);
}

// ── Session resolution ─────────────────────────────────────────────────────

const defaultSessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    const asObj = parseObject(raw);
    if (Object.keys(asObj).length > 0) return asObj;
    const sessionId = readNonEmptyString((raw as Record<string, unknown> | null)?.sessionId);
    if (sessionId) return { sessionId };
    return null;
  },
  serialize(params: Record<string, unknown> | null) {
    if (!params || Object.keys(params).length === 0) return null;
    return params;
  },
  getDisplayId(params: Record<string, unknown> | null) {
    return readNonEmptyString(params?.sessionId);
  },
};

export function getAdapterSessionCodec(adapterType: string): AdapterSessionCodec {
  const adapter = getServerAdapter(adapterType);
  return adapter.sessionCodec ?? defaultSessionCodec;
}

export async function resolveSessionBeforeForWakeup(
  db: Db,
  agent: typeof agents.$inferSelect,
  taskKey: string | null,
): Promise<string | null> {
  if (taskKey) {
    const codec = getAdapterSessionCodec(agent.adapterType);
    const existingTaskSession = await db
      .select()
      .from(agentTaskSessions)
      .where(
        and(
          eq(agentTaskSessions.companyId, agent.companyId),
          eq(agentTaskSessions.agentId, agent.id),
          eq(agentTaskSessions.adapterType, agent.adapterType),
          eq(agentTaskSessions.taskKey, taskKey),
        ),
      )
      .then((rows) => rows[0] ?? null);
    const parsedParams = normalizeSessionParams(codec.deserialize(existingTaskSession?.sessionParamsJson ?? null));
    return truncateDisplayId(
      existingTaskSession?.sessionDisplayId ??
        (codec.getDisplayId ? codec.getDisplayId(parsedParams) : null) ??
        readNonEmptyString(parsedParams?.sessionId),
    );
  }

  const runtimeForRun = await db
    .select()
    .from(agentRuntimeState)
    .where(eq(agentRuntimeState.agentId, agent.id))
    .then((rows) => rows[0] ?? null);
  return runtimeForRun?.sessionId ?? null;
}

export async function resolveExplicitResumeSessionOverride(
  db: Db,
  agent: typeof agents.$inferSelect,
  payload: Record<string, unknown> | null,
  taskKey: string | null,
) {
  const resumeFromRunId = readNonEmptyString(payload?.resumeFromRunId);
  if (!resumeFromRunId) return null;

  const resumeRun = await db
    .select({
      id: heartbeatRuns.id,
      contextSnapshot: heartbeatRuns.contextSnapshot,
      sessionIdBefore: heartbeatRuns.sessionIdBefore,
      sessionIdAfter: heartbeatRuns.sessionIdAfter,
    })
    .from(heartbeatRuns)
    .where(
      and(
        eq(heartbeatRuns.id, resumeFromRunId),
        eq(heartbeatRuns.companyId, agent.companyId),
        eq(heartbeatRuns.agentId, agent.id),
      ),
    )
    .then((rows) => rows[0] ?? null);
  if (!resumeRun) return null;

  const resumeContext = parseObject(resumeRun.contextSnapshot);
  const resumeTaskKey = deriveTaskKey(resumeContext, null) ?? taskKey;
  const resumeTaskSession = resumeTaskKey
    ? await db
        .select()
        .from(agentTaskSessions)
        .where(
          and(
            eq(agentTaskSessions.companyId, agent.companyId),
            eq(agentTaskSessions.agentId, agent.id),
            eq(agentTaskSessions.adapterType, agent.adapterType),
            eq(agentTaskSessions.taskKey, resumeTaskKey),
          ),
        )
        .then((rows) => rows[0] ?? null)
    : null;

  const sessionCodec = getAdapterSessionCodec(agent.adapterType);
  const sessionOverride = buildExplicitResumeSessionOverride({
    resumeFromRunId,
    resumeRunSessionIdBefore: resumeRun.sessionIdBefore,
    resumeRunSessionIdAfter: resumeRun.sessionIdAfter,
    taskSession: resumeTaskSession,
    sessionCodec,
  });
  if (!sessionOverride) return null;

  return {
    resumeFromRunId,
    taskKey: resumeTaskKey,
    issueId: readNonEmptyString(resumeContext.issueId),
    taskId: readNonEmptyString(resumeContext.taskId) ?? readNonEmptyString(resumeContext.issueId),
    sessionDisplayId: sessionOverride.sessionDisplayId,
    sessionParams: sessionOverride.sessionParams,
  };
}

// ── Reap orphaned runs ─────────────────────────────────────────────────────

export async function reapOrphanedRuns(
  db: Db,
  activeRunExecutions: Set<string>,
  hooks: {
    appendRunEvent: (
      run: typeof heartbeatRuns.$inferSelect,
      seq: number,
      event: {
        eventType: string;
        stream?: "system";
        level?: "info" | "warn" | "error";
        message?: string;
        payload?: Record<string, unknown>;
      },
    ) => Promise<void>;
    nextRunEventSeq: (runId: string) => Promise<number>;
    enqueueProcessLossRetry: (
      run: typeof heartbeatRuns.$inferSelect,
      agent: typeof agents.$inferSelect,
      now: Date,
    ) => Promise<typeof heartbeatRuns.$inferSelect>;
    releaseIssueExecutionAndPromote: (run: typeof heartbeatRuns.$inferSelect) => Promise<void>;
    finalizeAgentStatus: (agentId: string, outcome: "failed") => Promise<void>;
    startNextQueuedRunForAgent: (agentId: string) => Promise<unknown>;
    setRunStatus: (
      runId: string,
      status: string,
      patch?: Partial<typeof heartbeatRuns.$inferInsert>,
    ) => Promise<typeof heartbeatRuns.$inferSelect | null>;
    setWakeupStatus: (
      wakeupRequestId: string | null | undefined,
      status: string,
      patch?: Partial<typeof agentWakeupRequests.$inferInsert>,
    ) => Promise<void>;
    getRun: (runId: string) => Promise<typeof heartbeatRuns.$inferSelect | null>;
  },
  opts?: { staleThresholdMs?: number },
): Promise<{ reaped: number; runIds: string[] }> {
  const staleThresholdMs = opts?.staleThresholdMs ?? 0;
  const now = new Date();

  const activeRuns = await db
    .select({ run: heartbeatRuns, adapterType: agents.adapterType })
    .from(heartbeatRuns)
    .innerJoin(agents, eq(heartbeatRuns.agentId, agents.id))
    .where(eq(heartbeatRuns.status, "running"));

  const reaped: string[] = [];

  for (const { run, adapterType } of activeRuns) {
    if (runningProcesses.has(run.id) || activeRunExecutions.has(run.id)) continue;

    if (staleThresholdMs > 0) {
      const refTime = run.updatedAt ? new Date(run.updatedAt).getTime() : 0;
      if (now.getTime() - refTime < staleThresholdMs) continue;
    }

    const tracksLocalChild = isTrackedLocalChildProcessAdapter(adapterType);
    if (tracksLocalChild && run.processPid && isProcessAlive(run.processPid)) {
      if (run.errorCode !== DETACHED_PROCESS_ERROR_CODE) {
        const detachedMessage = `Lost in-memory process handle, but child pid ${run.processPid} is still alive`;
        const detachedRun = await hooks.setRunStatus(run.id, "running", {
          error: detachedMessage,
          errorCode: DETACHED_PROCESS_ERROR_CODE,
        });
        if (detachedRun) {
          await hooks.appendRunEvent(detachedRun, await hooks.nextRunEventSeq(detachedRun.id), {
            eventType: "lifecycle",
            stream: "system",
            level: "warn",
            message: detachedMessage,
            payload: { processPid: run.processPid },
          });
        }
      }
      continue;
    }

    const shouldRetry = tracksLocalChild && !!run.processPid && (run.processLossRetryCount ?? 0) < 1;
    const baseMessage = run.processPid
      ? `Process lost -- child pid ${run.processPid} is no longer running`
      : "Process lost -- server may have restarted";

    let finalizedRun = await hooks.setRunStatus(run.id, "failed", {
      error: shouldRetry ? `${baseMessage}; retrying once` : baseMessage,
      errorCode: "process_lost",
      finishedAt: now,
    });
    await hooks.setWakeupStatus(run.wakeupRequestId, "failed", {
      finishedAt: now,
      error: shouldRetry ? `${baseMessage}; retrying once` : baseMessage,
    });
    if (!finalizedRun) finalizedRun = await hooks.getRun(run.id);
    if (!finalizedRun) continue;

    let retriedRun: typeof heartbeatRuns.$inferSelect | null = null;
    if (shouldRetry) {
      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, run.agentId))
        .then((rows) => rows[0] ?? null);
      if (agent) {
        retriedRun = await hooks.enqueueProcessLossRetry(finalizedRun, agent, now);
      }
    } else {
      await hooks.releaseIssueExecutionAndPromote(finalizedRun);
    }

    await hooks.appendRunEvent(finalizedRun, await hooks.nextRunEventSeq(finalizedRun.id), {
      eventType: "lifecycle",
      stream: "system",
      level: "error",
      message: shouldRetry ? `${baseMessage}; queued retry ${retriedRun?.id ?? ""}`.trim() : baseMessage,
      payload: {
        ...(run.processPid ? { processPid: run.processPid } : {}),
        ...(retriedRun ? { retryRunId: retriedRun.id } : {}),
      },
    });

    await hooks.finalizeAgentStatus(run.agentId, "failed");
    await hooks.startNextQueuedRunForAgent(run.agentId);
    runningProcesses.delete(run.id);
    reaped.push(run.id);
  }

  if (reaped.length > 0) {
    logger.warn({ reapedCount: reaped.length, runIds: reaped }, "reaped orphaned heartbeat runs");
  }
  return { reaped: reaped.length, runIds: reaped };
}

// ── resumeQueuedRuns ───────────────────────────────────────────────────────

export async function resumeQueuedRuns(
  db: Db,
  startNextQueuedRunForAgent: (agentId: string) => Promise<unknown>,
): Promise<void> {
  const queuedRuns = await db
    .select({ agentId: heartbeatRuns.agentId })
    .from(heartbeatRuns)
    .where(eq(heartbeatRuns.status, "queued"));

  const agentIds = [...new Set(queuedRuns.map((r) => r.agentId))];
  await Promise.all(agentIds.map((agentId) => startNextQueuedRunForAgent(agentId)));
}

// ── Auto-resume paused agents whose conditions have cleared ───────────────

async function autoResumePausedAgents(db: Db, now: Date): Promise<number> {
  const pausedAgents = await db
    .select()
    .from(agents)
    .where(and(eq(agents.status, "paused"), sql`${agents.pauseReason} IS NOT NULL`));

  if (pausedAgents.length === 0) return 0;

  let resumed = 0;

  for (const agent of pausedAgents) {
    const reason = agent.pauseReason ?? "";
    const pausedAt = agent.pausedAt ? new Date(agent.pausedAt) : null;
    let shouldResume = false;

    // Iteration limits: only auto-resume on a new UTC calendar day if daily count is below limit
    if (reason === "iteration_limit" && pausedAt) {
      const pausedDay = pausedAt.toISOString().slice(0, 10);
      const currentDay = now.toISOString().slice(0, 10);
      if (pausedDay !== currentDay) {
        const todayCount = await countAgentRunsToday(db, agent.id);
        if (todayCount < DEFAULT_ITERATION_LIMITS.perDay) {
          shouldResume = true;
        }
      }
    }

    // Consecutive failures: auto-resume after 30 min cooldown
    if (reason.startsWith("auto_paused") && pausedAt) {
      const cooldownMs = 30 * 60 * 1000;
      if (now.getTime() - pausedAt.getTime() > cooldownMs) {
        shouldResume = true;
      }
    }

    // Cost anomaly: auto-resume after 1 hour cooldown only if anomaly has cleared
    if (reason === "cost_anomaly" && pausedAt) {
      const cooldownMs = 60 * 60 * 1000;
      if (now.getTime() - pausedAt.getTime() > cooldownMs) {
        try {
          const { executiveAnalyticsService: execSvc } = await import("./executive-analytics.js");
          const execAnalytics = execSvc(db);
          const anomaly = await execAnalytics.checkCostAnomaly(agent.id);
          if (!anomaly.anomaly) {
            shouldResume = true;
          }
        } catch {
          // If anomaly check fails, fall back to cooldown-only resume
          shouldResume = true;
        }
      }
    }

    // Rate limited (cluster/provider): auto-resume after 10 min cooldown
    if (reason.startsWith("rate_limited") && pausedAt) {
      const cooldownMs = 10 * 60 * 1000;
      if (now.getTime() - pausedAt.getTime() > cooldownMs) {
        shouldResume = true;
      }
    }

    if (!shouldResume) continue;

    await db
      .update(agents)
      .set({
        status: "idle",
        pauseReason: null,
        pausedAt: null,
        updatedAt: now,
      })
      .where(eq(agents.id, agent.id));

    publishLiveEvent({
      companyId: agent.companyId,
      type: "agent.status",
      payload: { agentId: agent.id, status: "idle", autoResumed: true },
    });

    logger.info(
      { agentId: agent.id, name: agent.name, previousPauseReason: reason },
      "Agent auto-resumed after pause condition cleared",
    );

    logActivity(db, {
      companyId: agent.companyId,
      actorType: "system",
      actorId: "auto_resume",
      action: "agent.resumed",
      entityType: "agent",
      entityId: agent.id,
      details: { reason: "auto_resume", previousPauseReason: reason },
    }).catch(() => {});

    resumed += 1;
  }

  return resumed;
}

// ── tickTimers ─────────────────────────────────────────────────────────────

export async function tickTimers(
  db: Db,
  enqueueWakeup: (agentId: string, opts: WakeupOptions) => Promise<unknown>,
  now = new Date(),
): Promise<{ checked: number; enqueued: number; skipped: number; resumed: number }> {
  // Auto-resume agents whose pause conditions have cleared
  const resumed = await autoResumePausedAgents(db, now);

  const allAgents = await db
    .select()
    .from(agents)
    .where(notInArray(agents.status, ["paused", "terminated", "pending_approval"]));

  let checked = 0;
  let enqueued = 0;
  let skipped = 0;

  for (const agent of allAgents) {
    const policy = parseHeartbeatPolicy(agent);
    if (!policy.enabled || policy.intervalSec <= 0) continue;

    checked += 1;
    const baseline = new Date(agent.lastHeartbeatAt ?? agent.createdAt).getTime();
    const elapsedMs = now.getTime() - baseline;
    if (elapsedMs < policy.intervalSec * 1000) {
      logger.debug({ agentId: agent.id, reason: "interval_not_elapsed" }, "Skipped agent");
      continue;
    }

    try {
      // Smart idle skip: if the agent has no assigned work and ran recently, skip the wakeup.
      // Safety net: always wake if the agent has not run in 30+ minutes even without work.
      const IDLE_SAFETY_NET_MS = 30 * 60 * 1000;
      const lastRanAt = agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt).getTime() : 0;
      const timeSinceLastRun = now.getTime() - lastRanAt;
      const ranRecently = timeSinceLastRun < IDLE_SAFETY_NET_MS;

      if (ranRecently) {
        const hasWork = await hasAssignedWork(db, agent.id, agent.companyId);
        if (!hasWork) {
          skipped += 1;
          logger.debug({ agentId: agent.id, reason: "no_work_recent_run" }, "Skipped agent - no pending work");
          continue;
        }
      }

      const run = await enqueueWakeup(agent.id, {
        source: "timer",
        triggerDetail: "system",
        reason: "heartbeat_timer",
        requestedByActorType: "system",
        requestedByActorId: "heartbeat_scheduler",
        contextSnapshot: {
          source: "scheduler",
          reason: "interval_elapsed",
          now: now.toISOString(),
        },
      });
      if (run) {
        enqueued += 1;
        logger.debug({ agentId: agent.id }, "Enqueued agent wakeup");
      } else {
        skipped += 1;
        logger.debug({ agentId: agent.id, reason: "enqueue_returned_null" }, "Skipped agent");
      }
    } catch (err) {
      skipped += 1;
      logger.debug({ err, agentId: agent.id }, "Skipped agent wakeup");
    }
  }

  return { checked, enqueued, skipped, resumed };
}

// ── releaseIssueExecutionAndPromote ────────────────────────────────────────

export async function releaseIssueExecutionAndPromote(
  db: Db,
  run: typeof heartbeatRuns.$inferSelect,
  hooks: {
    resolveSessionBeforeForWakeup: (
      agent: typeof agents.$inferSelect,
      taskKey: string | null,
    ) => Promise<string | null>;
    startNextQueuedRunForAgent: (agentId: string) => Promise<unknown>;
  },
): Promise<void> {
  const promotedRun = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from issues where company_id = ${run.companyId} and execution_run_id = ${run.id} for update`,
    );

    const issue = await tx
      .select({ id: issues.id, companyId: issues.companyId })
      .from(issues)
      .where(and(eq(issues.companyId, run.companyId), eq(issues.executionRunId, run.id)))
      .then((rows) => rows[0] ?? null);

    if (!issue) return;

    await tx
      .update(issues)
      .set({
        executionRunId: null,
        executionAgentNameKey: null,
        executionLockedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(issues.id, issue.id));

    while (true) {
      const deferred = await tx
        .select()
        .from(agentWakeupRequests)
        .where(
          and(
            eq(agentWakeupRequests.companyId, issue.companyId),
            eq(agentWakeupRequests.status, "deferred_issue_execution"),
            sql`${agentWakeupRequests.payload} ->> 'issueId' = ${issue.id}`,
          ),
        )
        .orderBy(asc(agentWakeupRequests.requestedAt))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (!deferred) return null;

      const deferredAgent = await tx
        .select()
        .from(agents)
        .where(eq(agents.id, deferred.agentId))
        .then((rows) => rows[0] ?? null);

      if (
        !deferredAgent ||
        deferredAgent.companyId !== issue.companyId ||
        deferredAgent.status === "paused" ||
        deferredAgent.status === "terminated" ||
        deferredAgent.status === "pending_approval"
      ) {
        await tx
          .update(agentWakeupRequests)
          .set({
            status: "failed",
            finishedAt: new Date(),
            error: "Deferred wake could not be promoted: agent is not invokable",
            updatedAt: new Date(),
          })
          .where(eq(agentWakeupRequests.id, deferred.id));
        continue;
      }

      const deferredPayload = parseObject(deferred.payload);
      const deferredContextSeed = parseObject(deferredPayload[DEFERRED_WAKE_CONTEXT_KEY]);
      const promotedContextSeed: Record<string, unknown> = { ...deferredContextSeed };
      const promotedReason = readNonEmptyString(deferred.reason) ?? "issue_execution_promoted";
      const promotedSource = (readNonEmptyString(deferred.source) as WakeupOptions["source"]) ?? "automation";
      const promotedTriggerDetail =
        (readNonEmptyString(deferred.triggerDetail) as WakeupOptions["triggerDetail"]) ?? null;
      const promotedPayload = deferredPayload;
      delete promotedPayload[DEFERRED_WAKE_CONTEXT_KEY];

      const { contextSnapshot: promotedContextSnapshot, taskKey: promotedTaskKey } = enrichWakeContextSnapshot({
        contextSnapshot: promotedContextSeed,
        reason: promotedReason,
        source: promotedSource,
        triggerDetail: promotedTriggerDetail,
        payload: promotedPayload,
      });

      const sessionBefore =
        readNonEmptyString(promotedContextSnapshot.resumeSessionDisplayId) ??
        (await hooks.resolveSessionBeforeForWakeup(deferredAgent, promotedTaskKey));
      const now = new Date();
      const newRun = await tx
        .insert(heartbeatRuns)
        .values({
          companyId: deferredAgent.companyId,
          agentId: deferredAgent.id,
          invocationSource: promotedSource,
          triggerDetail: promotedTriggerDetail,
          status: "queued",
          wakeupRequestId: deferred.id,
          contextSnapshot: promotedContextSnapshot,
          sessionIdBefore: sessionBefore,
        })
        .returning()
        .then((rows) => rows[0]);

      await tx
        .update(agentWakeupRequests)
        .set({
          status: "queued",
          reason: "issue_execution_promoted",
          runId: newRun.id,
          claimedAt: null,
          finishedAt: null,
          error: null,
          updatedAt: now,
        })
        .where(eq(agentWakeupRequests.id, deferred.id));

      await tx
        .update(issues)
        .set({
          executionRunId: newRun.id,
          executionAgentNameKey: normalizeAgentNameKey(deferredAgent.name),
          executionLockedAt: now,
          updatedAt: now,
        })
        .where(eq(issues.id, issue.id));

      return newRun;
    }
  });

  if (!promotedRun) return;

  publishLiveEvent({
    companyId: promotedRun.companyId,
    type: "heartbeat.run.queued",
    payload: {
      runId: promotedRun.id,
      agentId: promotedRun.agentId,
      invocationSource: promotedRun.invocationSource,
      triggerDetail: promotedRun.triggerDetail,
      wakeupRequestId: promotedRun.wakeupRequestId,
    },
  });

  await hooks.startNextQueuedRunForAgent(promotedRun.agentId);
}

// ── enqueueWakeup ──────────────────────────────────────────────────────────

export async function enqueueWakeup(
  db: Db,
  agentId: string,
  opts: WakeupOptions,
  hooks: {
    budgetHooks: { cancelWorkForScope: (scope: BudgetEnforcementScope) => Promise<void> };
    resolveExplicitResumeSessionOverride: (
      agent: typeof agents.$inferSelect,
      payload: Record<string, unknown> | null,
      taskKey: string | null,
    ) => ReturnType<typeof resolveExplicitResumeSessionOverride>;
    resolveSessionBeforeForWakeup: (
      agent: typeof agents.$inferSelect,
      taskKey: string | null,
    ) => Promise<string | null>;
    startNextQueuedRunForAgent: (agentId: string) => Promise<unknown>;
    checkIterationLimits: (agentId: string, companyId: string, issueId: string | null) => Promise<string | null>;
  },
): Promise<typeof heartbeatRuns.$inferSelect | null> {
  const source = opts.source ?? "on_demand";
  const triggerDetail = opts.triggerDetail ?? null;
  const contextSnapshot: Record<string, unknown> = { ...(opts.contextSnapshot ?? {}) };
  const reason = opts.reason ?? null;
  const payload = opts.payload ?? null;

  const {
    contextSnapshot: enrichedContextSnapshot,
    issueIdFromPayload,
    taskKey,
    wakeCommentId,
  } = enrichWakeContextSnapshot({
    contextSnapshot,
    reason,
    source,
    triggerDetail,
    payload,
  });
  let issueId = readNonEmptyString(enrichedContextSnapshot.issueId) ?? issueIdFromPayload;

  const agent = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .then((rows) => rows[0] ?? null);
  if (!agent) throw notFound("Agent not found");

  const explicitResumeSession = await hooks.resolveExplicitResumeSessionOverride(agent, payload, taskKey);
  if (explicitResumeSession) {
    enrichedContextSnapshot.resumeFromRunId = explicitResumeSession.resumeFromRunId;
    enrichedContextSnapshot.resumeSessionDisplayId = explicitResumeSession.sessionDisplayId;
    enrichedContextSnapshot.resumeSessionParams = explicitResumeSession.sessionParams;
    if (!readNonEmptyString(enrichedContextSnapshot.issueId) && explicitResumeSession.issueId) {
      enrichedContextSnapshot.issueId = explicitResumeSession.issueId;
    }
    if (!readNonEmptyString(enrichedContextSnapshot.taskId) && explicitResumeSession.taskId) {
      enrichedContextSnapshot.taskId = explicitResumeSession.taskId;
    }
    if (!readNonEmptyString(enrichedContextSnapshot.taskKey) && explicitResumeSession.taskKey) {
      enrichedContextSnapshot.taskKey = explicitResumeSession.taskKey;
    }
    issueId = readNonEmptyString(enrichedContextSnapshot.issueId) ?? issueId;
  }

  const effectiveTaskKey = readNonEmptyString(enrichedContextSnapshot.taskKey) ?? taskKey;
  const sessionBefore =
    explicitResumeSession?.sessionDisplayId ?? (await hooks.resolveSessionBeforeForWakeup(agent, effectiveTaskKey));

  const writeSkippedRequest = async (skipReason: string) => {
    await db.insert(agentWakeupRequests).values({
      companyId: agent.companyId,
      agentId,
      source,
      triggerDetail,
      reason: skipReason,
      payload,
      status: "skipped",
      requestedByActorType: opts.requestedByActorType ?? null,
      requestedByActorId: opts.requestedByActorId ?? null,
      idempotencyKey: opts.idempotencyKey ?? null,
      finishedAt: new Date(),
    });
  };

  let projectId = readNonEmptyString(enrichedContextSnapshot.projectId);
  if (!projectId && issueId) {
    projectId = await db
      .select({ projectId: issues.projectId })
      .from(issues)
      .where(and(eq(issues.id, issueId), eq(issues.companyId, agent.companyId)))
      .then((rows) => rows[0]?.projectId ?? null);
  }

  // NOTE: TOCTOU gap - budget is checked here but the run is created later.
  // Another concurrent wakeup could pass the budget check before either run is persisted.
  // A full transaction wrapping budget check + run creation is impractical due to the
  // complex branching below (issue-lock path vs non-issue path). The completeRun path
  // in heartbeat.ts re-checks cost anomalies, providing a post-hoc safety net.
  const budgets = budgetService(db, hooks.budgetHooks);
  const budgetBlock = await budgets.getInvocationBlock(agent.companyId, agentId, {
    issueId,
    projectId,
  });
  if (budgetBlock) {
    await writeSkippedRequest("budget.blocked");
    throw conflict(budgetBlock.reason, {
      scopeType: budgetBlock.scopeType,
      scopeId: budgetBlock.scopeId,
    });
  }

  const iterationBlock = await hooks.checkIterationLimits(agentId, agent.companyId, issueId);
  if (iterationBlock) {
    await writeSkippedRequest("iteration_limit.blocked");
    return null;
  }

  if (agent.status === "paused" || agent.status === "terminated" || agent.status === "pending_approval") {
    throw conflict("Agent is not invokable in its current state", { status: agent.status });
  }

  const policy = parseHeartbeatPolicy(agent);

  if (source === "timer" && !policy.enabled) {
    await writeSkippedRequest("heartbeat.disabled");
    return null;
  }
  if (source !== "timer" && !policy.wakeOnDemand) {
    await writeSkippedRequest("heartbeat.wakeOnDemand.disabled");
    return null;
  }

  const bypassIssueExecutionLock =
    reason === "issue_comment_mentioned" ||
    readNonEmptyString(enrichedContextSnapshot.wakeReason) === "issue_comment_mentioned";

  if (issueId && !bypassIssueExecutionLock) {
    const agentNameKey = normalizeAgentNameKey(agent.name);

    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from issues where id = ${issueId} and company_id = ${agent.companyId} for update`);

      const issue = await tx
        .select({
          id: issues.id,
          companyId: issues.companyId,
          executionRunId: issues.executionRunId,
          executionAgentNameKey: issues.executionAgentNameKey,
        })
        .from(issues)
        .where(and(eq(issues.id, issueId!), eq(issues.companyId, agent.companyId)))
        .then((rows) => rows[0] ?? null);

      if (!issue) {
        await tx.insert(agentWakeupRequests).values({
          companyId: agent.companyId,
          agentId,
          source,
          triggerDetail,
          reason: "issue_execution_issue_not_found",
          payload,
          status: "skipped",
          requestedByActorType: opts.requestedByActorType ?? null,
          requestedByActorId: opts.requestedByActorId ?? null,
          idempotencyKey: opts.idempotencyKey ?? null,
          finishedAt: new Date(),
        });
        return { kind: "skipped" as const };
      }

      let activeExecutionRun = issue.executionRunId
        ? await tx
            .select()
            .from(heartbeatRuns)
            .where(eq(heartbeatRuns.id, issue.executionRunId))
            .then((rows) => rows[0] ?? null)
        : null;

      if (activeExecutionRun && activeExecutionRun.status !== "queued" && activeExecutionRun.status !== "running") {
        activeExecutionRun = null;
      }

      if (!activeExecutionRun && issue.executionRunId) {
        await tx
          .update(issues)
          .set({
            executionRunId: null,
            executionAgentNameKey: null,
            executionLockedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(issues.id, issue.id));
      }

      if (!activeExecutionRun) {
        const legacyRun = await tx
          .select()
          .from(heartbeatRuns)
          .where(
            and(
              eq(heartbeatRuns.companyId, issue.companyId),
              inArray(heartbeatRuns.status, ["queued", "running"]),
              sql`${heartbeatRuns.contextSnapshot} ->> 'issueId' = ${issue.id}`,
            ),
          )
          .orderBy(sql`case when ${heartbeatRuns.status} = 'running' then 0 else 1 end`, asc(heartbeatRuns.createdAt))
          .limit(1)
          .then((rows) => rows[0] ?? null);

        if (legacyRun) {
          activeExecutionRun = legacyRun;
          const legacyAgent = await tx
            .select({ name: agents.name })
            .from(agents)
            .where(eq(agents.id, legacyRun.agentId))
            .then((rows) => rows[0] ?? null);
          await tx
            .update(issues)
            .set({
              executionRunId: legacyRun.id,
              executionAgentNameKey: normalizeAgentNameKey(legacyAgent?.name),
              executionLockedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(issues.id, issue.id));
        }
      }

      if (activeExecutionRun) {
        const executionAgent = await tx
          .select({ name: agents.name })
          .from(agents)
          .where(eq(agents.id, activeExecutionRun.agentId))
          .then((rows) => rows[0] ?? null);
        const executionAgentNameKey =
          normalizeAgentNameKey(issue.executionAgentNameKey) ?? normalizeAgentNameKey(executionAgent?.name);
        const isSameExecutionAgent = Boolean(executionAgentNameKey) && executionAgentNameKey === agentNameKey;
        const shouldQueueFollowupForCommentWake =
          Boolean(wakeCommentId) && activeExecutionRun.status === "running" && isSameExecutionAgent;

        if (isSameExecutionAgent && !shouldQueueFollowupForCommentWake) {
          const mergedContextSnapshot = mergeCoalescedContextSnapshot(
            activeExecutionRun.contextSnapshot,
            enrichedContextSnapshot,
          );
          const mergedRun = await tx
            .update(heartbeatRuns)
            .set({ contextSnapshot: mergedContextSnapshot, updatedAt: new Date() })
            .where(eq(heartbeatRuns.id, activeExecutionRun.id))
            .returning()
            .then((rows) => rows[0] ?? activeExecutionRun);

          await tx.insert(agentWakeupRequests).values({
            companyId: agent.companyId,
            agentId,
            source,
            triggerDetail,
            reason: "issue_execution_same_name",
            payload,
            status: "coalesced",
            coalescedCount: 1,
            requestedByActorType: opts.requestedByActorType ?? null,
            requestedByActorId: opts.requestedByActorId ?? null,
            idempotencyKey: opts.idempotencyKey ?? null,
            runId: mergedRun.id,
            finishedAt: new Date(),
          });

          return { kind: "coalesced" as const, run: mergedRun };
        }

        const deferredPayload = {
          ...(payload ?? {}),
          issueId,
          [DEFERRED_WAKE_CONTEXT_KEY]: enrichedContextSnapshot,
        };

        const existingDeferred = await tx
          .select()
          .from(agentWakeupRequests)
          .where(
            and(
              eq(agentWakeupRequests.companyId, agent.companyId),
              eq(agentWakeupRequests.agentId, agentId),
              eq(agentWakeupRequests.status, "deferred_issue_execution"),
              sql`${agentWakeupRequests.payload} ->> 'issueId' = ${issue.id}`,
            ),
          )
          .orderBy(asc(agentWakeupRequests.requestedAt))
          .limit(1)
          .then((rows) => rows[0] ?? null);

        if (existingDeferred) {
          const existingDeferredPayload = parseObject(existingDeferred.payload);
          const existingDeferredContext = parseObject(existingDeferredPayload[DEFERRED_WAKE_CONTEXT_KEY]);
          const mergedDeferredContext = mergeCoalescedContextSnapshot(existingDeferredContext, enrichedContextSnapshot);
          const mergedDeferredPayload = {
            ...existingDeferredPayload,
            ...(payload ?? {}),
            issueId,
            [DEFERRED_WAKE_CONTEXT_KEY]: mergedDeferredContext,
          };

          await tx
            .update(agentWakeupRequests)
            .set({
              payload: mergedDeferredPayload,
              coalescedCount: (existingDeferred.coalescedCount ?? 0) + 1,
              updatedAt: new Date(),
            })
            .where(eq(agentWakeupRequests.id, existingDeferred.id));

          return { kind: "deferred" as const };
        }

        await tx.insert(agentWakeupRequests).values({
          companyId: agent.companyId,
          agentId,
          source,
          triggerDetail,
          reason: "issue_execution_deferred",
          payload: deferredPayload,
          status: "deferred_issue_execution",
          requestedByActorType: opts.requestedByActorType ?? null,
          requestedByActorId: opts.requestedByActorId ?? null,
          idempotencyKey: opts.idempotencyKey ?? null,
        });

        return { kind: "deferred" as const };
      }

      const wakeupRequest = await tx
        .insert(agentWakeupRequests)
        .values({
          companyId: agent.companyId,
          agentId,
          source,
          triggerDetail,
          reason,
          payload,
          status: "queued",
          requestedByActorType: opts.requestedByActorType ?? null,
          requestedByActorId: opts.requestedByActorId ?? null,
          idempotencyKey: opts.idempotencyKey ?? null,
        })
        .returning()
        .then((rows) => rows[0]);

      const newRun = await tx
        .insert(heartbeatRuns)
        .values({
          companyId: agent.companyId,
          agentId,
          invocationSource: source,
          triggerDetail,
          status: "queued",
          wakeupRequestId: wakeupRequest.id,
          contextSnapshot: enrichedContextSnapshot,
          sessionIdBefore: sessionBefore,
        })
        .returning()
        .then((rows) => rows[0]);

      await tx
        .update(agentWakeupRequests)
        .set({ runId: newRun.id, updatedAt: new Date() })
        .where(eq(agentWakeupRequests.id, wakeupRequest.id));

      await tx
        .update(issues)
        .set({
          executionRunId: newRun.id,
          executionAgentNameKey: agentNameKey,
          executionLockedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(issues.id, issue.id));

      return { kind: "queued" as const, run: newRun };
    });

    if (outcome.kind === "deferred" || outcome.kind === "skipped") return null;
    if (outcome.kind === "coalesced") return outcome.run;

    const newRun = outcome.run;
    publishLiveEvent({
      companyId: newRun.companyId,
      type: "heartbeat.run.queued",
      payload: {
        runId: newRun.id,
        agentId: newRun.agentId,
        invocationSource: newRun.invocationSource,
        triggerDetail: newRun.triggerDetail,
        wakeupRequestId: newRun.wakeupRequestId,
      },
    });

    await hooks.startNextQueuedRunForAgent(agent.id);
    return newRun;
  }

  // No issue lock path
  const activeRuns = await db
    .select()
    .from(heartbeatRuns)
    .where(and(eq(heartbeatRuns.agentId, agentId), inArray(heartbeatRuns.status, ["queued", "running"])))
    .orderBy(desc(heartbeatRuns.createdAt));

  const sameScopeQueuedRun = activeRuns.find(
    (candidate) => candidate.status === "queued" && isSameTaskScope(runTaskKey(candidate), taskKey),
  );
  const sameScopeRunningRun = activeRuns.find(
    (candidate) => candidate.status === "running" && isSameTaskScope(runTaskKey(candidate), taskKey),
  );
  const shouldQueueFollowupForCommentWake =
    Boolean(wakeCommentId) && Boolean(sameScopeRunningRun) && !sameScopeQueuedRun;

  const coalescedTargetRun =
    sameScopeQueuedRun ?? (shouldQueueFollowupForCommentWake ? null : (sameScopeRunningRun ?? null));

  if (coalescedTargetRun) {
    const mergedContextSnapshot = mergeCoalescedContextSnapshot(coalescedTargetRun.contextSnapshot, contextSnapshot);
    const mergedRun = await db
      .update(heartbeatRuns)
      .set({ contextSnapshot: mergedContextSnapshot, updatedAt: new Date() })
      .where(eq(heartbeatRuns.id, coalescedTargetRun.id))
      .returning()
      .then((rows) => rows[0] ?? coalescedTargetRun);

    await db.insert(agentWakeupRequests).values({
      companyId: agent.companyId,
      agentId,
      source,
      triggerDetail,
      reason,
      payload,
      status: "coalesced",
      coalescedCount: 1,
      requestedByActorType: opts.requestedByActorType ?? null,
      requestedByActorId: opts.requestedByActorId ?? null,
      idempotencyKey: opts.idempotencyKey ?? null,
      runId: mergedRun.id,
      finishedAt: new Date(),
    });
    return mergedRun;
  }

  const wakeupRequest = await db
    .insert(agentWakeupRequests)
    .values({
      companyId: agent.companyId,
      agentId,
      source,
      triggerDetail,
      reason,
      payload,
      status: "queued",
      requestedByActorType: opts.requestedByActorType ?? null,
      requestedByActorId: opts.requestedByActorId ?? null,
      idempotencyKey: opts.idempotencyKey ?? null,
    })
    .returning()
    .then((rows) => rows[0]);

  const newRun = await db
    .insert(heartbeatRuns)
    .values({
      companyId: agent.companyId,
      agentId,
      invocationSource: source,
      triggerDetail,
      status: "queued",
      wakeupRequestId: wakeupRequest.id,
      contextSnapshot: enrichedContextSnapshot,
      sessionIdBefore: sessionBefore,
    })
    .returning()
    .then((rows) => rows[0]);

  await db
    .update(agentWakeupRequests)
    .set({ runId: newRun.id, updatedAt: new Date() })
    .where(eq(agentWakeupRequests.id, wakeupRequest.id));

  publishLiveEvent({
    companyId: newRun.companyId,
    type: "heartbeat.run.queued",
    payload: {
      runId: newRun.id,
      agentId: newRun.agentId,
      invocationSource: newRun.invocationSource,
      triggerDetail: newRun.triggerDetail,
      wakeupRequestId: newRun.wakeupRequestId,
    },
  });

  await hooks.startNextQueuedRunForAgent(agent.id);

  return newRun;
}

// ── Internal helpers ────────────────────────────────────────────────────────

function runTaskKey(run: typeof heartbeatRuns.$inferSelect) {
  return deriveTaskKey(run.contextSnapshot as Record<string, unknown> | null, null);
}

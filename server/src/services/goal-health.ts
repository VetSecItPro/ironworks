import type { Db } from "@ironworksai/db";
import { agents, goals, issues } from "@ironworksai/db";
import type { GoalHealthStatus } from "@ironworksai/shared";
import { eq, sql } from "drizzle-orm";
import { logger } from "../middleware/logger.js";
import { ensureCompanyChannel, ensureDepartmentChannel, postMessage } from "./channels.js";

export interface HealthResult {
  score: number;
  status: GoalHealthStatus;
}

/**
 * Compute a unified health score (0-100) for a goal.
 *
 * Inputs:
 *  - progress %
 *  - time elapsed % (from start_date/target_date)
 *  - blocked issue count
 *  - overdue issues (issues with due date past)
 *  - confidence (from latest check-in or goal)
 *  - days since last check-in
 *
 * Weights:
 *  - pace (progress vs time elapsed): 40%
 *  - confidence: 25%
 *  - blockers penalty: 20%
 *  - recency of check-in: 15%
 */
export async function computeGoalHealth(db: Db, goalId: string): Promise<HealthResult> {
  const [goal] = await db.select().from(goals).where(eq(goals.id, goalId)).limit(1);

  if (!goal) {
    return { score: 0, status: "no_data" };
  }

  // If the goal is already achieved/cancelled, return early
  if (goal.status === "achieved") {
    await db.update(goals).set({ healthScore: 100, healthStatus: "achieved" }).where(eq(goals.id, goalId));
    return { score: 100, status: "achieved" };
  }

  // Get issue stats
  const [counts] = await db
    .select({
      totalIssues: sql<number>`count(*)`,
      completedIssues: sql<number>`count(*) filter (where ${issues.status} = 'done')`,
      blockedIssues: sql<number>`count(*) filter (where ${issues.status} = 'blocked')`,
    })
    .from(issues)
    .where(eq(issues.goalId, goalId));

  const total = Number(counts?.totalIssues ?? 0);
  const completed = Number(counts?.completedIssues ?? 0);
  const blocked = Number(counts?.blockedIssues ?? 0);

  if (total === 0) {
    await db.update(goals).set({ healthScore: null, healthStatus: "no_data" }).where(eq(goals.id, goalId));
    return { score: 0, status: "no_data" };
  }

  const progressPercent = (completed / total) * 100;

  // Time elapsed
  let timeElapsedPercent = 50; // default if no dates set
  const now = Date.now();
  const startMs = goal.startDate ? new Date(goal.startDate).getTime() : goal.createdAt.getTime();
  const endMs = goal.targetDate ? new Date(goal.targetDate).getTime() : 0;

  if (endMs > startMs) {
    const elapsed = now - startMs;
    const duration = endMs - startMs;
    timeElapsedPercent = Math.min(100, Math.max(0, (elapsed / duration) * 100));
  }

  // Pace score: how progress compares to time elapsed (40%)
  // If progress >= timeElapsed, pace is 100. Otherwise degrade linearly.
  let paceScore: number;
  if (timeElapsedPercent === 0) {
    paceScore = 100;
  } else {
    const ratio = progressPercent / timeElapsedPercent;
    paceScore = Math.min(100, ratio * 100);
  }

  // Confidence score (25%) - use goal's confidence, default 50
  const confidenceScore = goal.confidence ?? 50;

  // Blocker penalty (20%) - each blocker reduces score
  const blockerRatio = total > 0 ? blocked / total : 0;
  const blockerScore = Math.max(0, 100 - blockerRatio * 200); // 50% blocked = score 0

  // Recency score (15%) - placeholder, based on updatedAt for now
  const daysSinceUpdate = (now - goal.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  const recencyScore = daysSinceUpdate <= 7 ? 100 : daysSinceUpdate <= 14 ? 70 : daysSinceUpdate <= 30 ? 40 : 10;

  // Weighted composite
  const score = Math.round(paceScore * 0.4 + confidenceScore * 0.25 + blockerScore * 0.2 + recencyScore * 0.15);

  const clampedScore = Math.min(100, Math.max(0, score));

  let status: GoalHealthStatus;
  if (clampedScore > 66) {
    status = "on_track";
  } else if (clampedScore >= 33) {
    status = "at_risk";
  } else {
    status = "off_track";
  }

  // Check for health transition before persisting
  const previousStatus = goal.healthStatus as GoalHealthStatus | null;
  const transitionedToWorse = previousStatus === "on_track" && (status === "at_risk" || status === "off_track");

  // Persist to goals table
  await db
    .update(goals)
    .set({ healthScore: clampedScore, healthStatus: status, updatedAt: new Date() })
    .where(eq(goals.id, goalId));

  // Escalation: post to channels when health degrades
  if (transitionedToWorse) {
    try {
      await escalateGoalHealthChange(db, goal, status, clampedScore);
    } catch (err) {
      logger.warn({ err, goalId }, "goal health escalation failed (non-fatal)");
    }
  }

  return { score: clampedScore, status };
}

/**
 * Post escalation messages when a goal transitions from on_track to at_risk/off_track.
 */
async function escalateGoalHealthChange(
  db: Db,
  goal: typeof goals.$inferSelect,
  newStatus: GoalHealthStatus,
  score: number,
): Promise<void> {
  const statusLabel = newStatus === "at_risk" ? "AT RISK" : "OFF TRACK";
  const reason =
    newStatus === "off_track"
      ? "Progress has fallen significantly behind schedule."
      : "Progress is slipping and may miss the target date.";
  const body = `[${goal.title}] is now ${statusLabel}. Health score: ${score}. ${reason}`;

  // Post to #company channel
  const companyChannelId = await ensureCompanyChannel(db, goal.companyId);
  await postMessage(db, {
    channelId: companyChannelId,
    companyId: goal.companyId,
    body,
    messageType: "alert",
  });

  // If goal has an owner agent, also post to their department channel
  if (goal.ownerAgentId) {
    const [ownerAgent] = await db
      .select({ department: agents.department })
      .from(agents)
      .where(eq(agents.id, goal.ownerAgentId))
      .limit(1);

    if (ownerAgent?.department) {
      const deptChannelId = await ensureDepartmentChannel(db, goal.companyId, ownerAgent.department);
      await postMessage(db, {
        channelId: deptChannelId,
        companyId: goal.companyId,
        authorAgentId: goal.ownerAgentId,
        body,
        messageType: "alert",
      });
    }
  }
}

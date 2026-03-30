import { eq, sql } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { goals, issues } from "@ironworksai/db";

/**
 * Recalculate goal status based on child issue statuses.
 * - If all issues are done → goal = achieved
 * - If any issue is in_progress → goal = active
 * - If all issues are cancelled → goal = cancelled
 * - Otherwise → goal stays as-is (active or planned)
 */
export async function recalculateGoalProgress(db: Db, goalId: string): Promise<void> {
  // Count issues by status for this goal
  const counts = await db
    .select({
      total: sql<number>`count(*)`,
      done: sql<number>`count(*) filter (where ${issues.status} = 'done')`,
      cancelled: sql<number>`count(*) filter (where ${issues.status} = 'cancelled')`,
      inProgress: sql<number>`count(*) filter (where ${issues.status} = 'in_progress')`,
    })
    .from(issues)
    .where(eq(issues.goalId, goalId));

  const { total, done, cancelled, inProgress } = counts[0] ?? { total: 0, done: 0, cancelled: 0, inProgress: 0 };

  if (total === 0) return; // No issues linked, don't change goal

  let newStatus: string | null = null;

  if (done >= total) {
    // All issues done
    newStatus = "achieved";
  } else if (cancelled >= total) {
    // All issues cancelled
    newStatus = "cancelled";
  } else if (Number(inProgress) > 0 || Number(done) > 0) {
    // Some work happening
    newStatus = "active";
  }

  if (newStatus) {
    const [current] = await db
      .select({ status: goals.status })
      .from(goals)
      .where(eq(goals.id, goalId))
      .limit(1);

    // Don't downgrade from achieved (manual override should stick)
    if (current && current.status !== newStatus && current.status !== "achieved") {
      await db
        .update(goals)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(goals.id, goalId));
    }

    // Upgrade TO achieved when all done
    if (current && newStatus === "achieved" && current.status !== "achieved") {
      await db
        .update(goals)
        .set({ status: "achieved", updatedAt: new Date() })
        .where(eq(goals.id, goalId));
    }
  }
}

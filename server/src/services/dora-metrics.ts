import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { heartbeatRuns, issues } from "@ironworksai/db";

// ── DORA Metrics ────────────────────────────────────────────────────────────
//
// Four key engineering metrics:
//   - Deployment Frequency: heartbeat runs per day (proxy for deployments)
//   - Lead Time: avg minutes from issue created to done
//   - Change Failure Rate: cancelled / (completed + cancelled) as a percentage
//   - MTTR: avg resolution minutes for critical/high priority issues

export interface DORAMetrics {
  /** Average heartbeat runs per day over the period. */
  deploymentFrequency: number;
  /** Average minutes from issue created to done for completed issues. */
  leadTime: number;
  /** Cancelled / (completed + cancelled) * 100 as a percentage. */
  changeFailureRate: number;
  /** Average minutes from critical/high issue created to resolved. */
  meanTimeToRecovery: number;
}

const DEFAULT_PERIOD_DAYS = 30;

export async function computeDORAMetrics(
  db: Db,
  companyId: string,
  periodDays: number = DEFAULT_PERIOD_DAYS,
): Promise<DORAMetrics> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  // -- Deployment Frequency --
  // Count finished heartbeat runs in the period, divide by days
  const [runCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(heartbeatRuns)
    .where(
      and(
        eq(heartbeatRuns.companyId, companyId),
        isNotNull(heartbeatRuns.finishedAt),
        gte(heartbeatRuns.startedAt, periodStart),
        lt(heartbeatRuns.startedAt, now),
      ),
    );
  const runCount = Number(runCountRow?.count ?? 0);
  const deploymentFrequency = periodDays > 0
    ? Math.round((runCount / periodDays) * 100) / 100
    : 0;

  // -- Lead Time --
  // Average minutes from issue.createdAt to issue.completedAt for done issues
  const [leadTimeRow] = await db
    .select({
      avgMinutes: sql<number>`
        coalesce(
          avg(extract(epoch from (${issues.completedAt} - ${issues.createdAt})) / 60.0),
          0
        )::int
      `,
    })
    .from(issues)
    .where(
      and(
        eq(issues.companyId, companyId),
        eq(issues.status, "done"),
        isNotNull(issues.completedAt),
        gte(issues.completedAt, periodStart),
        lt(issues.completedAt, now),
      ),
    );
  const leadTime = Number(leadTimeRow?.avgMinutes ?? 0);

  // -- Change Failure Rate --
  const [failureRow] = await db
    .select({
      completed: sql<number>`count(*) filter (where ${issues.status} = 'done' and ${issues.completedAt} >= ${periodStart})::int`,
      cancelled: sql<number>`count(*) filter (where ${issues.status} = 'cancelled' and ${issues.cancelledAt} >= ${periodStart})::int`,
    })
    .from(issues)
    .where(
      and(
        eq(issues.companyId, companyId),
      ),
    );
  const completed = Number(failureRow?.completed ?? 0);
  const cancelled = Number(failureRow?.cancelled ?? 0);
  const total = completed + cancelled;
  const changeFailureRate = total > 0
    ? Math.round((cancelled / total) * 100 * 10) / 10
    : 0;

  // -- Mean Time to Recovery --
  // Avg resolution time for critical/high priority issues completed in the period
  const [mttrRow] = await db
    .select({
      avgMinutes: sql<number>`
        coalesce(
          avg(extract(epoch from (${issues.completedAt} - ${issues.createdAt})) / 60.0),
          0
        )::int
      `,
    })
    .from(issues)
    .where(
      and(
        eq(issues.companyId, companyId),
        eq(issues.status, "done"),
        isNotNull(issues.completedAt),
        gte(issues.completedAt, periodStart),
        lt(issues.completedAt, now),
        sql`${issues.priority} in ('critical', 'high')`,
      ),
    );
  const meanTimeToRecovery = Number(mttrRow?.avgMinutes ?? 0);

  return {
    deploymentFrequency,
    leadTime,
    changeFailureRate,
    meanTimeToRecovery,
  };
}

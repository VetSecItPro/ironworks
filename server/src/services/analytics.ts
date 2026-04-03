import { sql, ne, eq, gte, and } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import {
  analyticsSnapshots,
  companies,
  authUsers,
  agents,
  companySubscriptions,
  issues,
  heartbeatRuns,
} from "@ironworksai/db";
import { PLAN_DEFINITIONS } from "./billing.js";
import { logger } from "../middleware/logger.js";

// ── MRR calculation: sum plan prices for active subscriptions ────────────────

function planTierToMrrCents(planTier: string): number {
  const def = PLAN_DEFINITIONS[planTier as keyof typeof PLAN_DEFINITIONS];
  return def?.priceMonthly ?? 0;
}

// ── Today's CT date string as "YYYY-MM-DD" ──────────────────────────────────

function todayCTDateString(): string {
  const now = new Date();
  const parts = now
    .toLocaleDateString("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .split("/");
  // parts: ["MM", "DD", "YYYY"]
  return `${parts[2]}-${parts[0]}-${parts[1]}`;
}

function startOfTodayCT(): Date {
  const dateStr = todayCTDateString(); // "YYYY-MM-DD"
  return new Date(`${dateStr}T00:00:00-06:00`);
}

// ── Core metrics gathering ───────────────────────────────────────────────────

export interface AnalyticsMetrics {
  totalCompanies: number;
  totalUsers: number;
  totalAgents: number;
  mrrCents: number;
  newSignups: number;
  churnCount: number;
  totalIssues: number;
  totalRuns: number;
  successRate: number;
}

export async function gatherLiveMetrics(db: Db): Promise<AnalyticsMetrics> {
  const todayStart = startOfTodayCT();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalCompaniesRows,
    totalUsersRows,
    totalAgentsRows,
    activeSubsRows,
    newSignupsRows,
    churnRows,
    totalIssuesRows,
    totalRunsRows,
    successRateRows,
  ] = await Promise.all([
    // Active companies
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(companies)
      .where(ne(companies.status, "deleted")),

    // All users
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(authUsers),

    // Active agents
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(agents)
      .where(ne(agents.status, "terminated")),

    // Active subscriptions for MRR
    db
      .select({ planTier: companySubscriptions.planTier })
      .from(companySubscriptions)
      .where(eq(companySubscriptions.status, "active")),

    // New signups today (new companies created today in CT)
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(companies)
      .where(
        and(
          ne(companies.status, "deleted"),
          gte(companies.createdAt, todayStart),
        ),
      ),

    // Churn: companies that moved to "deleted" or "pending_erasure" in last 30 days
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(companies)
      .where(
        and(
          eq(companies.status, "pending_erasure"),
          gte(companies.updatedAt, thirtyDaysAgo),
        ),
      ),

    // Total issues
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(issues),

    // Total heartbeat runs
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(heartbeatRuns),

    // Success rate (all time)
    db
      .select({
        total: sql<number>`count(*)::int`,
        succeeded: sql<number>`count(case when ${heartbeatRuns.status} = 'completed' then 1 end)::int`,
      })
      .from(heartbeatRuns),
  ]);

  const mrrCents = activeSubsRows.reduce(
    (sum, row) => sum + planTierToMrrCents(row.planTier),
    0,
  );

  const sr = successRateRows[0] ?? { total: 0, succeeded: 0 };
  const total = Number(sr.total);
  const succeeded = Number(sr.succeeded);
  const successRate = total > 0 ? succeeded / total : 0;

  return {
    totalCompanies: Number(totalCompaniesRows[0]?.count ?? 0),
    totalUsers: Number(totalUsersRows[0]?.count ?? 0),
    totalAgents: Number(totalAgentsRows[0]?.count ?? 0),
    mrrCents,
    newSignups: Number(newSignupsRows[0]?.count ?? 0),
    churnCount: Number(churnRows[0]?.count ?? 0),
    totalIssues: Number(totalIssuesRows[0]?.count ?? 0),
    totalRuns: Number(totalRunsRows[0]?.count ?? 0),
    successRate,
  };
}

/**
 * Capture today's analytics snapshot.
 * Idempotent — uses ON CONFLICT DO NOTHING so it is safe to call multiple times per day.
 */
export async function captureAnalyticsSnapshot(db: Db): Promise<void> {
  const snapshotDate = todayCTDateString();

  const metrics = await gatherLiveMetrics(db);

  await db
    .insert(analyticsSnapshots)
    .values({
      snapshotDate,
      totalCompanies: metrics.totalCompanies,
      totalUsers: metrics.totalUsers,
      totalAgents: metrics.totalAgents,
      mrrCents: metrics.mrrCents,
      newSignups: metrics.newSignups,
      churnCount: metrics.churnCount,
      totalIssues: metrics.totalIssues,
      totalRuns: metrics.totalRuns,
      successRate: metrics.successRate,
    })
    .onConflictDoNothing();

  logger.info({ snapshotDate, ...metrics }, "analytics snapshot captured");
}

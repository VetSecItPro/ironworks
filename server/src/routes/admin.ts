import { Router } from "express";
import { eq, sql, and, gte, ne, desc } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import {
  companies,
  agents,
  authUsers,
  companyMemberships,
  heartbeatRuns,
  costEvents,
  companySubscriptions,
  budgetIncidents,
  activityLog,
  instanceUserRoles,
  authSessions,
  analyticsSnapshots,
} from "@ironworksai/db";
import { assertInstanceAdmin } from "./authz.js";
import { notFound } from "../errors.js";
import { gatherLiveMetrics } from "../services/analytics.js";
import { supportAdminRoutes } from "./support.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Start of today in Central Time expressed as a UTC Date. */
function startOfTodayCT(): Date {
  const now = new Date();
  // Central Time is UTC-6 (CST) or UTC-5 (CDT). Use a fixed offset approach:
  // We compute the current CT date string, then parse it back as UTC midnight
  // to get the CT midnight boundary as a UTC timestamp.
  const ctDateStr = now.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // ctDateStr is "MM/DD/YYYY"
  const [month, day, year] = ctDateStr.split("/");
  return new Date(`${year}-${month}-${day}T00:00:00-06:00`);
}

function ago24h(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

// ─── Route Factory ────────────────────────────────────────────────────────────

export function adminRoutes(db: Db) {
  const router = Router();

  // ── GET /api/admin/dashboard ───────────────────────────────────────────────
  router.get("/dashboard", async (req, res) => {
    assertInstanceAdmin(req);

    const todayStart = startOfTodayCT();
    const since24h = ago24h();

    const [
      totalCompaniesRows,
      totalAgentsRows,
      totalUsersRows,
      activeAgentsNowRows,
      totalRunsTodayRows,
      runsLast24hRows,
      subscriptionsByTierRows,
      recentSignupsRows,
      overBudgetCompaniesRows,
      erroredAgentsRows,
      openIncidentsRows,
    ] = await Promise.all([
      // totalCompanies — exclude deleted
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(companies)
        .where(ne(companies.status, "deleted")),

      // totalAgents — exclude terminated
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(agents)
        .where(ne(agents.status, "terminated")),

      // totalUsers (Better Auth `user` table)
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(authUsers),

      // activeAgentsNow
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(agents)
        .where(eq(agents.status, "running")),

      // totalRunsToday
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(heartbeatRuns)
        .where(gte(heartbeatRuns.createdAt, todayStart)),

      // agentSuccessRate — runs in last 24h
      db
        .select({
          total: sql<number>`count(*)::int`,
          succeeded: sql<number>`count(case when ${heartbeatRuns.status} = 'completed' then 1 end)::int`,
        })
        .from(heartbeatRuns)
        .where(gte(heartbeatRuns.createdAt, since24h)),

      // subscriptionsByTier
      db
        .select({
          planTier: companySubscriptions.planTier,
          count: sql<number>`count(*)::int`,
        })
        .from(companySubscriptions)
        .where(eq(companySubscriptions.status, "active"))
        .groupBy(companySubscriptions.planTier),

      // recentSignups — last 10 companies with sub info
      db
        .select({
          id: companies.id,
          name: companies.name,
          planTier: companySubscriptions.planTier,
          createdAt: companies.createdAt,
        })
        .from(companies)
        .leftJoin(companySubscriptions, eq(companySubscriptions.companyId, companies.id))
        .where(ne(companies.status, "deleted"))
        .orderBy(desc(companies.createdAt))
        .limit(10),

      // companiesWithAlerts: over-budget companies
      db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(
          and(
            ne(companies.status, "deleted"),
            sql`${companies.budgetMonthlyCents} > 0 AND ${companies.spentMonthlyCents} > ${companies.budgetMonthlyCents}`,
          ),
        ),

      // errored agents
      db
        .select({ id: agents.id, companyId: agents.companyId, name: agents.name })
        .from(agents)
        .where(eq(agents.status, "error")),

      // open budget incidents
      db
        .select({ id: budgetIncidents.id, companyId: budgetIncidents.companyId })
        .from(budgetIncidents)
        .where(eq(budgetIncidents.status, "open")),
    ]);

    const runs24h = runsLast24hRows[0] ?? { total: 0, succeeded: 0 };
    const total = Number(runs24h.total);
    const succeeded = Number(runs24h.succeeded);
    const agentSuccessRate = total > 0 ? Math.round((succeeded / total) * 100) : 100;

    const subscriptionsByTier: Record<string, number> = {
      starter: 0,
      growth: 0,
      business: 0,
    };
    for (const row of subscriptionsByTierRows) {
      subscriptionsByTier[row.planTier] = Number(row.count);
    }

    // Deduplicate alert companies by id
    const alertCompanyIds = new Set<string>([
      ...overBudgetCompaniesRows.map((r) => r.id),
      ...erroredAgentsRows.map((r) => r.companyId),
      ...openIncidentsRows.map((r) => r.companyId),
    ]);

    res.json({
      totalCompanies: Number(totalCompaniesRows[0]?.count ?? 0),
      totalAgents: Number(totalAgentsRows[0]?.count ?? 0),
      totalUsers: Number(totalUsersRows[0]?.count ?? 0),
      activeAgentsNow: Number(activeAgentsNowRows[0]?.count ?? 0),
      totalRunsToday: Number(totalRunsTodayRows[0]?.count ?? 0),
      agentSuccessRate,
      subscriptionsByTier,
      recentSignups: recentSignupsRows,
      companiesWithAlerts: alertCompanyIds.size,
    });
  });

  // ── GET /api/admin/companies ───────────────────────────────────────────────
  router.get("/companies", async (req, res) => {
    assertInstanceAdmin(req);

    const rows = await db
      .select({
        id: companies.id,
        name: companies.name,
        issuePrefix: companies.issuePrefix,
        status: companies.status,
        createdAt: companies.createdAt,
        planTier: companySubscriptions.planTier,
        budgetMonthlyCents: companies.budgetMonthlyCents,
        spentMonthlyCents: companies.spentMonthlyCents,
      })
      .from(companies)
      .leftJoin(companySubscriptions, eq(companySubscriptions.companyId, companies.id))
      .where(ne(companies.status, "deleted"))
      .orderBy(desc(companies.createdAt));

    // Get agent counts per company
    const agentCounts = await db
      .select({
        companyId: agents.companyId,
        count: sql<number>`count(*)::int`,
      })
      .from(agents)
      .where(ne(agents.status, "terminated"))
      .groupBy(agents.companyId);

    const agentCountMap = new Map<string, number>();
    for (const row of agentCounts) {
      agentCountMap.set(row.companyId, Number(row.count));
    }

    const result = rows.map((r) => ({
      ...r,
      agentCount: agentCountMap.get(r.id) ?? 0,
      totalSpendCents: r.spentMonthlyCents,
    }));

    res.json(result);
  });

  // ── GET /api/admin/companies/:id ──────────────────────────────────────────
  router.get("/companies/:id", async (req, res) => {
    assertInstanceAdmin(req);

    const companyId = req.params.id as string;

    const [companyRow] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId));

    if (!companyRow) {
      throw notFound("Company not found");
    }

    const [subscription, agentList, issueCountResult, memberCount] = await Promise.all([
      db
        .select()
        .from(companySubscriptions)
        .where(eq(companySubscriptions.companyId, companyId))
        .then((rows) => rows[0] ?? null),

      db
        .select()
        .from(agents)
        .where(and(eq(agents.companyId, companyId), ne(agents.status, "terminated"))),

      db.execute(
        sql`SELECT count(*)::int AS count FROM issues WHERE company_id = ${companyId}`,
      ),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(companyMemberships)
        .where(
          and(
            eq(companyMemberships.companyId, companyId),
            eq(companyMemberships.principalType, "user"),
            eq(companyMemberships.status, "active"),
          ),
        ),
    ]);

    const issueCountRows = issueCountResult as unknown as Array<{ count: number }>;

    res.json({
      company: companyRow,
      subscription,
      agents: agentList,
      agentCount: agentList.length,
      issueCount: Number(issueCountRows[0]?.count ?? 0),
      memberCount: Number(memberCount[0]?.count ?? 0),
    });
  });

  // ── POST /api/admin/companies/:id/pause ──────────────────────────────────
  router.post("/companies/:id/pause", async (req, res) => {
    assertInstanceAdmin(req);

    const companyId = req.params.id as string;
    const reason = (req.body?.reason as string | undefined) ?? "Paused by admin";

    // Pause all running agents in the company
    await db
      .update(agents)
      .set({
        status: "paused",
        pauseReason: reason,
        pausedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(agents.companyId, companyId), eq(agents.status, "running")));

    const [updated] = await db
      .update(companies)
      .set({
        status: "paused",
        pauseReason: reason,
        pausedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId))
      .returning();

    if (!updated) {
      throw notFound("Company not found");
    }

    res.json({ ok: true, company: updated });
  });

  // ── POST /api/admin/companies/:id/resume ─────────────────────────────────
  router.post("/companies/:id/resume", async (req, res) => {
    assertInstanceAdmin(req);

    const companyId = req.params.id as string;

    const [updated] = await db
      .update(companies)
      .set({
        status: "active",
        pauseReason: null,
        pausedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId))
      .returning();

    if (!updated) {
      throw notFound("Company not found");
    }

    res.json({ ok: true, company: updated });
  });

  // ── GET /api/admin/users ──────────────────────────────────────────────────
  router.get("/users", async (req, res) => {
    assertInstanceAdmin(req);

    const userRows = await db.select().from(authUsers).orderBy(desc(authUsers.createdAt));

    // Get company memberships per user
    const membershipRows = await db
      .select({
        principalId: companyMemberships.principalId,
        companyId: companyMemberships.companyId,
        membershipRole: companyMemberships.membershipRole,
      })
      .from(companyMemberships)
      .where(
        and(
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.status, "active"),
        ),
      );

    // Get instance admin flags
    const adminRows = await db
      .select({ userId: instanceUserRoles.userId })
      .from(instanceUserRoles)
      .where(eq(instanceUserRoles.role, "instance_admin"));

    const adminSet = new Set(adminRows.map((r) => r.userId));

    // Get last login (most recent session per user)
    const sessionRows = await db
      .select({
        userId: authSessions.userId,
        lastLoginAt: sql<Date>`max(${authSessions.createdAt})`,
      })
      .from(authSessions)
      .groupBy(authSessions.userId);

    const lastLoginMap = new Map<string, Date>();
    for (const row of sessionRows) {
      lastLoginMap.set(row.userId, row.lastLoginAt);
    }

    const membershipByUser = new Map<string, typeof membershipRows>();
    for (const m of membershipRows) {
      const list = membershipByUser.get(m.principalId) ?? [];
      list.push(m);
      membershipByUser.set(m.principalId, list);
    }

    const result = userRows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt,
      isInstanceAdmin: adminSet.has(u.id),
      lastLoginAt: lastLoginMap.get(u.id) ?? null,
      companies: (membershipByUser.get(u.id) ?? []).map((m) => ({
        companyId: m.companyId,
        role: m.membershipRole,
      })),
    }));

    res.json(result);
  });

  // ── GET /api/admin/monitoring ─────────────────────────────────────────────
  router.get("/monitoring", async (req, res) => {
    assertInstanceAdmin(req);

    const since24h = ago24h();

    const [
      dbSizeRows,
      totalRunsRows,
      runs24hRows,
      agentStatusRows,
      topSpendRows,
    ] = await Promise.all([
      // DB size
      db.execute(sql`SELECT pg_database_size(current_database()) AS size_bytes`),

      // Total heartbeat runs ever
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(heartbeatRuns),

      // Error rate 24h
      db
        .select({
          total: sql<number>`count(*)::int`,
          errors: sql<number>`count(case when ${heartbeatRuns.status} = 'error' then 1 end)::int`,
        })
        .from(heartbeatRuns)
        .where(gte(heartbeatRuns.createdAt, since24h)),

      // Agent counts by status
      db
        .select({
          status: agents.status,
          count: sql<number>`count(*)::int`,
        })
        .from(agents)
        .where(ne(agents.status, "terminated"))
        .groupBy(agents.status),

      // Top 5 companies by total spend (all time)
      db
        .select({
          companyId: costEvents.companyId,
          companyName: companies.name,
          totalCents: sql<number>`sum(${costEvents.costCents})::int`,
        })
        .from(costEvents)
        .innerJoin(companies, eq(companies.id, costEvents.companyId))
        .groupBy(costEvents.companyId, companies.name)
        .orderBy(desc(sql`sum(${costEvents.costCents})`))
        .limit(5),
    ]);

    const runs24h = runs24hRows[0] ?? { total: 0, errors: 0 };
    const totalRuns24h = Number(runs24h.total);
    const errorRuns24h = Number(runs24h.errors);
    const errorRate24h = totalRuns24h > 0 ? Math.round((errorRuns24h / totalRuns24h) * 100) : 0;

    const agentsByStatus: Record<string, number> = {
      running: 0,
      idle: 0,
      paused: 0,
      error: 0,
    };
    for (const row of agentStatusRows) {
      agentsByStatus[row.status] = Number(row.count);
    }

    // Extract db size from raw result
    const dbSizeResult = dbSizeRows as unknown as Array<{ size_bytes: string | number }>;
    const dbSizeBytes = Number(dbSizeResult[0]?.size_bytes ?? 0);

    res.json({
      dbSizeBytes,
      totalHeartbeatRuns: Number(totalRunsRows[0]?.count ?? 0),
      errorRate24h,
      topCompaniesBySpend: topSpendRows.map((r) => ({
        companyId: r.companyId,
        companyName: r.companyName,
        totalCents: Number(r.totalCents),
      })),
      agentsByStatus,
    });
  });

  // ── GET /api/admin/audit-log ──────────────────────────────────────────────
  router.get("/audit-log", async (req, res) => {
    assertInstanceAdmin(req);

    const limitParam = req.query.limit;
    const limit = Math.min(
      1000,
      Math.max(1, Number.isFinite(Number(limitParam)) ? Number(limitParam) : 100),
    );

    const rows = await db
      .select({
        id: activityLog.id,
        companyId: activityLog.companyId,
        actorType: activityLog.actorType,
        actorId: activityLog.actorId,
        action: activityLog.action,
        entityType: activityLog.entityType,
        entityId: activityLog.entityId,
        agentId: activityLog.agentId,
        runId: activityLog.runId,
        details: activityLog.details,
        createdAt: activityLog.createdAt,
      })
      .from(activityLog)
      .orderBy(desc(activityLog.createdAt))
      .limit(limit);

    res.json(rows);
  });

  // ── GET /api/admin/analytics ──────────────────────────────────────────────
  // Returns the last 90 days of daily snapshots for charting.
  router.get("/analytics", async (req, res) => {
    assertInstanceAdmin(req);

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const cutoffDate = ninetyDaysAgo
      .toLocaleDateString("en-US", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      .split("/");
    const cutoffStr = `${cutoffDate[2]}-${cutoffDate[0]}-${cutoffDate[1]}`;

    const rows = await db
      .select()
      .from(analyticsSnapshots)
      .where(gte(analyticsSnapshots.snapshotDate, cutoffStr))
      .orderBy(analyticsSnapshots.snapshotDate);

    res.json(rows);
  });

  // ── GET /api/admin/analytics/export ──────────────────────────────────────
  // Returns ALL snapshots as CSV with Content-Disposition header.
  router.get("/analytics/export", async (req, res) => {
    assertInstanceAdmin(req);

    const rows = await db
      .select()
      .from(analyticsSnapshots)
      .orderBy(analyticsSnapshots.snapshotDate);

    const headers = [
      "snapshot_date",
      "total_companies",
      "total_users",
      "total_agents",
      "mrr_cents",
      "new_signups",
      "churn_count",
      "total_issues",
      "total_runs",
      "success_rate",
      "created_at",
    ];

    const csvLines = [
      headers.join(","),
      ...rows.map((r) =>
        [
          r.snapshotDate,
          r.totalCompanies,
          r.totalUsers,
          r.totalAgents,
          r.mrrCents,
          r.newSignups,
          r.churnCount,
          r.totalIssues,
          r.totalRuns,
          r.successRate.toFixed(4),
          r.createdAt.toISOString(),
        ].join(","),
      ),
    ];

    const today = new Date()
      .toLocaleDateString("en-US", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      .split("/");
    const todayStr = `${today[2]}-${today[0]}-${today[1]}`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ironworks-analytics-${todayStr}.csv"`,
    );
    res.send(csvLines.join("\n"));
  });

  // ── GET /api/admin/analytics/current ─────────────────────────────────────
  // Returns today's live metrics (same queries as snapshot but not stored).
  router.get("/analytics/current", async (req, res) => {
    assertInstanceAdmin(req);

    const metrics = await gatherLiveMetrics(db);
    res.json(metrics);
  });

  // ── Support ticket admin routes ──────────────────────────────────────────
  router.use(supportAdminRoutes(db));

  return router;
}

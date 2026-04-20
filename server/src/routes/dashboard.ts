import type { Db } from "@ironworksai/db";
import { costEvents, goals, issues } from "@ironworksai/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { Router } from "express";
import { dashboardService } from "../services/dashboard.js";
import { assertCompanyAccess } from "./authz.js";

export function dashboardRoutes(db: Db) {
  const router = Router();
  const svc = dashboardService(db);

  router.get("/companies/:companyId/dashboard", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const summary = await svc.summary(companyId);
    res.json(summary);
  });

  /**
   * GET /companies/:companyId/war-room
   * Batch endpoint that combines dashboard summary, window spend highlights,
   * and goal progress into a single response — reduces War Room from 9 to ~5 API calls.
   */
  router.get("/companies/:companyId/war-room", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    // Run all queries in parallel
    const [summary, goalsProgress, windowSpendRows] = await Promise.all([
      svc.summary(companyId),

      // Goal progress (lightweight version)
      db
        .select({
          goalId: goals.id,
          title: goals.title,
          status: goals.status,
          level: goals.level,
          totalIssues: sql<number>`count(${issues.id})::int`,
          completedIssues: sql<number>`count(case when ${issues.status} = 'done' then 1 end)::int`,
          inProgressIssues: sql<number>`count(case when ${issues.status} = 'in_progress' then 1 end)::int`,
        })
        .from(goals)
        .leftJoin(issues, eq(issues.goalId, goals.id))
        .where(eq(goals.companyId, companyId))
        .groupBy(goals.id, goals.title, goals.status, goals.level),

      // 24h window spend
      db
        .select({
          totalCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
        })
        .from(costEvents)
        .where(
          and(
            eq(costEvents.companyId, companyId),
            gte(costEvents.occurredAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
          ),
        ),
    ]);

    const goalsWithProgress = goalsProgress.map((g) => ({
      ...g,
      progressPercent:
        Number(g.totalIssues) > 0 ? Math.round((Number(g.completedIssues) / Number(g.totalIssues)) * 100) : 0,
    }));

    res.json({
      summary,
      goalsProgress: goalsWithProgress,
      windowSpend24hCents: Number(windowSpendRows[0]?.totalCents ?? 0),
    });
  });

  return router;
}

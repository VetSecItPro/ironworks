import type { Db } from "@ironworksai/db";
import { joinRequests } from "@ironworksai/db";
import { and, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { accessService } from "../services/access.js";
import { dashboardService } from "../services/dashboard.js";
import { sidebarBadgeService } from "../services/sidebar-badges.js";
import { assertCompanyAccess } from "./authz.js";

async function computeBadges(
  db: Db,
  svc: ReturnType<typeof sidebarBadgeService>,
  access: ReturnType<typeof accessService>,
  dashboard: ReturnType<typeof dashboardService>,
  companyId: string,
  actorType: string,
  actorSource: string | undefined,
  actorIsInstanceAdmin: boolean | undefined,
  actorUserId: string,
  actorAgentId: string | undefined,
) {
  // Step 1: resolve join-approve permission (needed before counting join requests)
  let canApproveJoins = false;
  if (actorType === "board") {
    canApproveJoins =
      actorSource === "local_implicit" ||
      Boolean(actorIsInstanceAdmin) ||
      (await access.canUser(companyId, actorUserId, "joins:approve"));
  } else if (actorType === "agent" && actorAgentId) {
    canApproveJoins = await access.hasPermission(companyId, "agent", actorAgentId, "joins:approve");
  }

  // Step 2: fetch join request count (depends on canApproveJoins) and all badge/summary data in parallel
  const joinRequestCountPromise = canApproveJoins
    ? db
        .select({ count: sql<number>`count(*)` })
        .from(joinRequests)
        .where(and(eq(joinRequests.companyId, companyId), eq(joinRequests.status, "pending_approval")))
        .then((rows) => Number(rows[0]?.count ?? 0))
    : Promise.resolve(0);

  const [joinRequestCount, badges, summary] = await Promise.all([
    joinRequestCountPromise,
    svc.get(companyId),
    dashboard.summary(companyId),
  ]);

  const hasFailedRuns = badges.failedRuns > 0;
  const alertsCount =
    (summary.agents.error > 0 && !hasFailedRuns ? 1 : 0) +
    (summary.costs.monthBudgetCents > 0 && summary.costs.monthUtilizationPercent >= 80 ? 1 : 0);
  badges.inbox = badges.failedRuns + alertsCount + joinRequestCount + badges.approvals;
  badges.joinRequests = joinRequestCount;

  return badges;
}

export function sidebarBadgeRoutes(db: Db) {
  const router = Router();
  const svc = sidebarBadgeService(db);
  const access = accessService(db);
  const dashboard = dashboardService(db);

  router.get("/companies/:companyId/sidebar-badges", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    // No cache: badge counts include join-request visibility that depends on
    // the actor's joins:approve permission. Caching even briefly (30 s was the
    // previous TTL) causes stale counts when a user's role changes within the
    // window - they would not see pending join requests until the entry expired.
    // The underlying queries are cheap indexed aggregates, so the DB round-trip
    // cost is negligible compared to the correctness risk.
    const result = await computeBadges(
      db,
      svc,
      access,
      dashboard,
      companyId,
      req.actor.type,
      req.actor.type === "board" ? req.actor.source : undefined,
      req.actor.type === "board" ? req.actor.isInstanceAdmin : undefined,
      req.actor.type === "board" ? (req.actor.userId ?? "") : "",
      req.actor.type === "agent" ? req.actor.agentId : undefined,
    );

    res.json(result);
  });

  return router;
}

/**
 * No-op reset retained for test-infrastructure compatibility. The badgeCache
 * was removed to eliminate ACL staleness: caching permission-sensitive badge
 * counts caused stale join-request counts when a user's role changed within
 * the 30-second TTL window. This function is kept so test files that call it
 * in their own beforeEach do not need to be updated.
 */
export function _resetSingletonsForTest(): void {
  // intentionally empty — no cache state to clear
}

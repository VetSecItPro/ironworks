import type { Db } from "@ironworksai/db";
import { Router } from "express";
import { type AccessRoutesOpts, buildAccessRouteContext } from "./access-route-helpers.js";
import { accessBoardClaimRoutes } from "./access-routes-board-claim.js";
import { accessCliAuthRoutes } from "./access-routes-cli-auth.js";
import { accessInvitesRoutes } from "./access-routes-invites.js";
import { accessMembershipRoutes } from "./access-routes-membership.js";
import { accessSkillsRoutes } from "./access-routes-skills.js";

// Re-exports preserved for external callers (tests, other modules) that import
// these helpers via `routes/access.js`. See `access-route-helpers.ts` for the
// authoritative implementations.
export {
  agentJoinGrantsFromDefaults,
  buildInviteOnboardingTextDocument,
  buildJoinDefaultsPayloadForAccept,
  canReplayOpenClawGatewayInviteAccept,
  companyInviteExpiresAt,
  mergeJoinDefaultsPayloadForReplay,
  normalizeAgentDefaultsForJoin,
  resolveJoinRequestAgentManagerId,
} from "./access-route-helpers.js";

/**
 * Composite router for all access-related endpoints.
 *
 * Implementation lives in five domain sub-routers (board-claim, cli-auth,
 * skills, invites, membership) composed via `Router.use()`. The shared service
 * instances + helpers + closure-scoped predicates are built once via
 * `buildAccessRouteContext` and threaded through each sub-router.
 */
export function accessRoutes(db: Db, opts: AccessRoutesOpts): Router {
  const router = Router();
  const ctx = buildAccessRouteContext(db, opts);
  router.use(accessBoardClaimRoutes(ctx));
  router.use(accessCliAuthRoutes(ctx));
  router.use(accessSkillsRoutes(ctx));
  router.use(accessInvitesRoutes(ctx));
  router.use(accessMembershipRoutes(ctx));
  return router;
}

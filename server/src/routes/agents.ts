import type { Db } from "@ironworksai/db";
import { Router } from "express";
import { agentChatRoutes } from "./agent-routes-chat.js";
import { agentCrudRoutes } from "./agent-routes-crud.js";
import { agentLifecycleRoutes } from "./agent-routes-lifecycle.js";
import { agentRunsRoutes } from "./agent-routes-runs.js";

/**
 * Composite router for all agent-related endpoints.
 *
 * The implementation lives in four domain sub-routers (CRUD, lifecycle, runs,
 * chat) composed via Express's `Router.use()` mechanism. Mount order matches
 * the historical declaration order in the legacy 3,365-LOC monolith — every
 * route path+method combination is unique across the four files, so ordering
 * is informational only.
 */
export function agentRoutes(db: Db): Router {
  const router = Router();
  router.use(agentCrudRoutes(db));
  router.use(agentLifecycleRoutes(db));
  router.use(agentRunsRoutes(db));
  router.use(agentChatRoutes(db));
  return router;
}

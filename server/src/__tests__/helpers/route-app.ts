import type { Request, RequestHandler, Router } from "express";
import express from "express";
import { errorHandler } from "../../middleware/error-handler.js";

/**
 * Actor shape expected by server authz middleware. Matches the union in
 * `routes/authz.ts` without importing the full module (tests may mock authz).
 */
export type TestActor =
  | { type: "none" }
  | {
      type: "board";
      userId: string;
      companyIds: string[];
      isInstanceAdmin: boolean;
      source: "session" | "local_implicit";
    }
  | { type: "agent"; agentId: string; companyId: string };

/**
 * Build a fresh Express app for a route test. Applies JSON body parsing, an
 * actor-injecting middleware, mounts the given router at `/api`, and wires
 * the standard error handler last.
 *
 * Each test should create a fresh app per `it()` to avoid middleware state
 * from a prior test leaking across. The factory is a function (not a shared
 * singleton) for that reason.
 *
 * @example
 * const app = buildTestApp({
 *   router: secretRoutes(fakeDb),
 *   actor: boardUser(USER_ID, [COMPANY_ID]),
 * });
 * const res = await request(app).get(`/api/companies/${COMPANY_ID}/secrets`);
 */
export function buildTestApp(options: {
  router: Router;
  actor: TestActor;
  extraMiddleware?: RequestHandler[];
}): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res, next) => {
    (req as unknown as { actor: TestActor }).actor = options.actor;
    next();
  });
  if (options.extraMiddleware) {
    for (const mw of options.extraMiddleware) app.use(mw);
  }
  app.use("/api", options.router);
  app.use(errorHandler);
  return app;
}

// Convenience actor builders
export function boardUser(
  userId: string,
  companyIds: string[],
  options: { isInstanceAdmin?: boolean; source?: "session" | "local_implicit" } = {},
): TestActor {
  return {
    type: "board",
    userId,
    companyIds,
    isInstanceAdmin: options.isInstanceAdmin ?? false,
    source: options.source ?? "session",
  };
}

export function agentActor(agentId: string, companyId: string): TestActor {
  return { type: "agent", agentId, companyId };
}

export function noActor(): TestActor {
  return { type: "none" };
}

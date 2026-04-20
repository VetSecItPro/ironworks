import type { Db } from "@ironworksai/db";
import { agents } from "@ironworksai/db";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { assertCompanyAccess } from "./authz.js";

/**
 * Slim API endpoints that return minimal payloads for sidebar, dropdowns,
 * org charts, and other lightweight UI needs. These avoid transferring
 * large fields like adapterConfig, runtimeConfig, permissions, metadata, etc.
 */
export function slimRoutes(db: Db) {
  const router = Router();

  // GET /companies/:companyId/agents/slim
  // Returns only the fields needed by sidebar, org chart, and dropdowns.
  router.get("/companies/:companyId/agents/slim", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const rows = await db
      .select({
        id: agents.id,
        name: agents.name,
        status: agents.status,
        role: agents.role,
        icon: agents.icon,
        title: agents.title,
        reportsTo: agents.reportsTo,
      })
      .from(agents)
      .where(eq(agents.companyId, companyId))
      .orderBy(agents.name);
    res.json(rows);
  });

  return router;
}

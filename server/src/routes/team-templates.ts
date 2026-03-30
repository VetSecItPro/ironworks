import { Router } from "express";
import type { Db } from "@ironworksai/db";
import { ROLE_TEMPLATES, TEAM_PACKS, getTeamPackRoles, type RoleTemplate } from "../onboarding-assets/role-templates.js";

/**
 * Public API for team templates and role templates.
 * Used by the onboarding wizard and team management UI.
 */
export function teamTemplateRoutes(_db: Db) {
  const router = Router();

  /** List all team packs. */
  router.get("/team-templates/packs", (_req, res) => {
    const packs = TEAM_PACKS.map((pack) => ({
      ...pack,
      roleCount: pack.roles.length,
      roles: getTeamPackRoles(pack.key).map(summarizeRole),
    }));
    res.json(packs);
  });

  /** List all available role templates. */
  router.get("/team-templates/roles", (_req, res) => {
    res.json(ROLE_TEMPLATES.map(summarizeRole));
  });

  /** Get a single role template with full SOUL.md and AGENTS.md. */
  router.get("/team-templates/roles/:key", (req, res) => {
    const template = ROLE_TEMPLATES.find((t) => t.key === req.params.key);
    if (!template) {
      res.status(404).json({ error: "Role template not found" });
      return;
    }
    res.json(template);
  });

  return router;
}

function summarizeRole(r: RoleTemplate) {
  return {
    key: r.key,
    title: r.title,
    tagline: r.tagline,
    icon: r.icon,
    role: r.role,
    reportsTo: r.reportsTo,
    suggestedAdapter: r.suggestedAdapter,
    skills: r.skills,
  };
}

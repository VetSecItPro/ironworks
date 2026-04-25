/**
 * Skill recipe routes — PRs 3/6 and 6/6 of the IronWorks self-improving skill loop.
 *
 * Exposes the operator review UI surface: list, detail, approve, reject, edit,
 * archive, pause, and resume. All mutations are board-only (assertBoard) because
 * only human operators should gate what enters the live skill library.
 *
 * Route shape follows the rest of the IronWorks API:
 *   GET  /companies/:companyId/skill-recipes
 *   GET  /skill-recipes/:id
 *   PATCH /skill-recipes/:id
 *   POST /skill-recipes/:id/approve
 *   POST /skill-recipes/:id/reject
 *   POST /skill-recipes/:id/archive
 *   POST /skill-recipes/:id/pause    ← PR 6/6
 *   POST /skill-recipes/:id/resume   ← PR 6/6
 *
 * @see MDMP §4 PR #3 and PR #6 scope.
 */

import type { Db } from "@ironworksai/db";
import { Router } from "express";
import { badRequest, notFound } from "../errors.js";
import { skillRecipeService } from "../services/skill-recipe-service.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

const VALID_STATUSES = new Set(["proposed", "approved", "rejected", "active", "archived", "paused"]);

export function skillRecipeRoutes(db: Db) {
  const router = Router();
  const svc = skillRecipeService(db);

  /**
   * List recipes for a company. Board access required so non-members cannot
   * enumerate proposed skill procedures. Supports ?status= filter.
   */
  router.get("/companies/:companyId/skill-recipes", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);

    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !VALID_STATUSES.has(status)) {
      throw badRequest(`Invalid status filter: ${status}. Must be one of ${[...VALID_STATUSES].join(", ")}`);
    }

    const items = await svc.list(companyId, status);
    res.json(items);
  });

  /**
   * Full detail for a single recipe including the latest evaluation window.
   * Board access is verified via the recipe's companyId.
   */
  router.get("/skill-recipes/:id", async (req, res) => {
    const { id } = req.params;
    const recipe = await svc.detail(id);
    if (!recipe) {
      throw notFound("Skill recipe not found");
    }
    assertCompanyAccess(req, recipe.companyId);
    res.json(recipe);
  });

  /**
   * Edit mutable fields: title, triggerPattern, procedureMarkdown.
   * Board-only — operators review and adjust before approving.
   */
  router.patch("/skill-recipes/:id", async (req, res) => {
    assertBoard(req);
    const { id } = req.params;

    const recipe = await svc.detail(id);
    if (!recipe) {
      throw notFound("Skill recipe not found");
    }
    assertCompanyAccess(req, recipe.companyId);

    const { title, triggerPattern, procedureMarkdown } = req.body as Record<string, unknown>;

    // Only these three fields are operator-editable. Silently ignore any other
    // keys rather than erroring — makes the endpoint tolerant of future UI additions.
    const patch: { title?: string; triggerPattern?: string; procedureMarkdown?: string } = {};
    if (typeof title === "string" && title.trim().length > 0) patch.title = title.trim();
    if (typeof triggerPattern === "string" && triggerPattern.trim().length > 0)
      patch.triggerPattern = triggerPattern.trim();
    if (typeof procedureMarkdown === "string" && procedureMarkdown.trim().length > 0)
      patch.procedureMarkdown = procedureMarkdown.trim();

    if (Object.keys(patch).length === 0) {
      throw badRequest("No editable fields provided");
    }

    const actor = getActorInfo(req);
    const updated = await svc.editRecipe(id, patch, actor.actorId);
    if (!updated) throw notFound("Skill recipe not found");

    res.json(updated);
  });

  /**
   * Approve a proposed recipe. Atomically:
   *   1. Sets recipe status → 'active'
   *   2. Inserts a company_skills row (origin='extracted', recipe_id=this.id)
   *
   * Returns both objects so the UI can optimistically update both queries.
   */
  router.post("/skill-recipes/:id/approve", async (req, res) => {
    assertBoard(req);
    const { id } = req.params;

    const recipe = await svc.detail(id);
    if (!recipe) {
      throw notFound("Skill recipe not found");
    }
    assertCompanyAccess(req, recipe.companyId);

    const actor = getActorInfo(req);
    const result = await svc.approveRecipe(id, actor.actorId);
    if (!result) throw notFound("Skill recipe not found");

    res.status(201).json(result);
  });

  /**
   * Reject a proposed recipe. Body must contain { reason: string }.
   * The reason is persisted for the extractor's negative-example pool (PR #5+).
   */
  router.post("/skill-recipes/:id/reject", async (req, res) => {
    assertBoard(req);
    const { id } = req.params;

    const recipe = await svc.detail(id);
    if (!recipe) {
      throw notFound("Skill recipe not found");
    }
    assertCompanyAccess(req, recipe.companyId);

    const { reason } = req.body as Record<string, unknown>;
    if (typeof reason !== "string" || reason.trim().length === 0) {
      throw badRequest("reason is required");
    }

    const actor = getActorInfo(req);
    const updated = await svc.rejectRecipe(id, actor.actorId, reason.trim());
    if (!updated) throw notFound("Skill recipe not found");

    res.json(updated);
  });

  /**
   * Archive a recipe. Handles both manual operator retirement and the path
   * the nightly eval-rollup cron will use (via direct service call, not HTTP).
   */
  router.post("/skill-recipes/:id/archive", async (req, res) => {
    assertBoard(req);
    const { id } = req.params;

    const recipe = await svc.detail(id);
    if (!recipe) {
      throw notFound("Skill recipe not found");
    }
    assertCompanyAccess(req, recipe.companyId);

    const actor = getActorInfo(req);
    const updated = await svc.archiveRecipe(id, actor.actorId);
    if (!updated) throw notFound("Skill recipe not found");

    res.json(updated);
  });

  /**
   * Pause an active recipe. Sets paused_at = now() so the matcher skips it on
   * the next heartbeat without changing the recipe's lifecycle status. The
   * recipe remains 'active' and can be resumed at any time.
   *
   * The runaway detector also calls this path (directly via the service) when
   * it detects an activation-rate spike — audit log entry is created in both cases.
   */
  router.post("/skill-recipes/:id/pause", async (req, res) => {
    assertBoard(req);
    const { id } = req.params;

    const recipe = await svc.detail(id);
    if (!recipe) {
      throw notFound("Skill recipe not found");
    }
    assertCompanyAccess(req, recipe.companyId);

    const actor = getActorInfo(req);
    const updated = await svc.pauseRecipe(id, actor.actorId);
    if (!updated) throw notFound("Skill recipe not found");

    res.json(updated);
  });

  /**
   * Resume a paused recipe. Clears paused_at so the matcher considers it again
   * on the very next heartbeat.
   */
  router.post("/skill-recipes/:id/resume", async (req, res) => {
    assertBoard(req);
    const { id } = req.params;

    const recipe = await svc.detail(id);
    if (!recipe) {
      throw notFound("Skill recipe not found");
    }
    assertCompanyAccess(req, recipe.companyId);

    const actor = getActorInfo(req);
    const updated = await svc.resumeRecipe(id, actor.actorId);
    if (!updated) throw notFound("Skill recipe not found");

    res.json(updated);
  });

  return router;
}

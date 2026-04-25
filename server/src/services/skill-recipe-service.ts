/**
 * Skill recipe service — PRs 3/6 and 6/6 of the IronWorks self-improving skill loop.
 *
 * CRUD layer for skill_recipes rows. The critical path is `approveRecipe`:
 * it atomically flips the recipe to 'active' AND inserts a company_skills row
 * (origin='extracted') so existing runtime loaders pick up the skill with zero
 * additional changes.
 *
 * Other transitions (reject, archive, edit, pause, resume) are simpler single-row
 * updates. All are audited via `logActivity` so the Audit Trail section shows a
 * clean timeline of operator decisions.
 *
 * PR 6/6 additions: `pauseRecipe` and `resumeRecipe`. Pause sets `paused_at = now()`
 * without changing `status` so the recipe resumes instantly when unpaused. The
 * matcher filters `WHERE paused_at IS NULL` to skip paused recipes.
 *
 * @see MDMP §4 PR #3 and PR #6 scope.
 * @see MDMP §3.1 for why company_skills is the canonical loader-facing store.
 */

import type { Db } from "@ironworksai/db";
import { companySkills, skillEvaluations, skillRecipes } from "@ironworksai/db";
import { and, desc, eq } from "drizzle-orm";
import { logActivity } from "./activity-log.js";

// ── Types ────────────────────────────────────────────────────────────────────

type SkillRecipeRow = typeof skillRecipes.$inferSelect;
type CompanySkillRow = typeof companySkills.$inferSelect;

export type SkillRecipeStatus = "proposed" | "approved" | "rejected" | "active" | "archived";

export interface SkillRecipeListItem {
  id: string;
  companyId: string;
  title: string;
  triggerPattern: string;
  status: SkillRecipeStatus;
  confidence: number;
  applicableRoleTitles: string[];
  proposedByAgentId: string | null;
  sourceIssueId: string | null;
  extractorModel: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  /** Non-null when the recipe has been paused by the operator or the runaway detector. */
  pausedAt: Date | null;
}

export interface SkillRecipeDetail extends SkillRecipeListItem {
  procedureMarkdown: string;
  rationale: string | null;
  rejectionReason: string | null;
  sourceSkillId: string | null;
  sourceRunId: string | null;
  metadata: Record<string, unknown>;
  lastValidatedAt: Date | null;
  /** Latest evaluation window, if any. Present for 'active' recipes. */
  latestEvaluation: {
    invocationsCount: number;
    completedCount: number;
    failedCount: number;
    effectivenessDelta: string | null;
    operatorThumbsAvg: string | null;
    windowStart: Date;
    windowEnd: Date;
  } | null;
}

export interface ApproveRecipeResult {
  recipe: SkillRecipeListItem;
  /** The company_skills row created by materialisation. */
  companySkill: CompanySkillRow;
}

export interface EditRecipePatch {
  title?: string;
  triggerPattern?: string;
  procedureMarkdown?: string;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function toListItem(row: SkillRecipeRow): SkillRecipeListItem {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    triggerPattern: row.triggerPattern,
    status: row.status as SkillRecipeStatus,
    confidence: row.confidence,
    applicableRoleTitles: row.applicableRoleTitles,
    proposedByAgentId: row.proposedByAgentId ?? null,
    sourceIssueId: row.sourceIssueId ?? null,
    extractorModel: row.extractorModel,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt ?? null,
    approvedAt: row.approvedAt ?? null,
    approvedByUserId: row.approvedByUserId ?? null,
    pausedAt: row.pausedAt ?? null,
  };
}

// ── Service factory ───────────────────────────────────────────────────────────

export function skillRecipeService(db: Db) {
  return {
    /**
     * List recipes for a company, optionally filtered by status.
     * Results are ordered by created_at DESC so the newest proposals appear first.
     */
    list: async (companyId: string, status?: string): Promise<SkillRecipeListItem[]> => {
      const rows = await db
        .select()
        .from(skillRecipes)
        .where(
          status
            ? and(eq(skillRecipes.companyId, companyId), eq(skillRecipes.status, status))
            : eq(skillRecipes.companyId, companyId),
        )
        .orderBy(desc(skillRecipes.createdAt));

      return rows.map(toListItem);
    },

    /**
     * Fetch a single recipe with full detail, including the latest evaluation
     * window (if any) so the UI can render the effectiveness panel for 'active'
     * recipes without a second round-trip.
     */
    detail: async (id: string): Promise<SkillRecipeDetail | null> => {
      const row = await db
        .select()
        .from(skillRecipes)
        .where(eq(skillRecipes.id, id))
        .then((rows) => rows[0] ?? null);

      if (!row) return null;

      // Pull the most recent evaluation window for this recipe (may not exist yet).
      const evalRow = await db
        .select()
        .from(skillEvaluations)
        .where(eq(skillEvaluations.recipeId, id))
        .orderBy(desc(skillEvaluations.windowStart))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      return {
        ...toListItem(row),
        procedureMarkdown: row.procedureMarkdown,
        rationale: row.rationale ?? null,
        rejectionReason: row.rejectionReason ?? null,
        sourceSkillId: row.sourceSkillId ?? null,
        sourceRunId: row.sourceRunId ?? null,
        metadata: (row.metadata as Record<string, unknown>) ?? {},
        lastValidatedAt: row.lastValidatedAt ?? null,
        latestEvaluation: evalRow
          ? {
              invocationsCount: evalRow.invocationsCount,
              completedCount: evalRow.completedCount,
              failedCount: evalRow.failedCount,
              effectivenessDelta: evalRow.effectivenessDelta ?? null,
              operatorThumbsAvg: evalRow.operatorThumbsAvg ?? null,
              windowStart: evalRow.windowStart,
              windowEnd: evalRow.windowEnd,
            }
          : null,
      };
    },

    /**
     * Mutate title, triggerPattern, and/or procedureMarkdown.
     *
     * Only these three fields are operator-editable — confidence, extractor
     * metadata, and provenance columns are read-only after creation.
     * A separate approve call is required to activate the edited recipe.
     */
    editRecipe: async (id: string, patch: EditRecipePatch, userId: string): Promise<SkillRecipeListItem | null> => {
      const now = new Date();
      const updated = await db
        .update(skillRecipes)
        .set({
          ...patch,
          updatedAt: now,
        })
        .where(eq(skillRecipes.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);

      if (!updated) return null;

      await logActivity(db, {
        companyId: updated.companyId,
        actorType: "user",
        actorId: userId,
        action: "skill_recipe.edited",
        entityType: "skill_recipe",
        entityId: id,
        details: { fields: Object.keys(patch) },
      });

      return toListItem(updated);
    },

    /**
     * Approve a proposed recipe and materialise it into company_skills.
     *
     * The two writes (recipe status update + company_skills insert) run inside
     * a single transaction so the system is never in a state where a recipe is
     * 'active' without a corresponding company_skills row, or vice-versa.
     */
    approveRecipe: async (id: string, userId: string): Promise<ApproveRecipeResult | null> => {
      const now = new Date();

      const result = await db.transaction(async (tx) => {
        const recipe = await tx
          .select()
          .from(skillRecipes)
          .where(eq(skillRecipes.id, id))
          .then((rows) => rows[0] ?? null);

        if (!recipe) return null;

        // Flip recipe to 'active' and record who approved it.
        const updatedRecipe = await tx
          .update(skillRecipes)
          .set({
            status: "active",
            approvedByUserId: userId,
            approvedAt: now,
            updatedAt: now,
          })
          .where(eq(skillRecipes.id, id))
          .returning()
          .then((rows) => rows[0] ?? null);

        if (!updatedRecipe) return null;

        // Derive a stable key from the recipe title for the company_skills row.
        // Slugified + prefixed with 'extracted/' to namespace extracted skills.
        const slugKey = `extracted/${recipe.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")}`;

        // Materialise into company_skills so the existing heartbeat skill loader
        // picks it up without any changes to the runtime path.
        const newSkill = await tx
          .insert(companySkills)
          .values({
            companyId: recipe.companyId,
            key: slugKey,
            slug: slugKey,
            name: recipe.title,
            description: recipe.rationale ?? null,
            markdown: recipe.procedureMarkdown,
            sourceType: "local_path",
            sourceLocator: null,
            sourceRef: null,
            trustLevel: "markdown_only",
            compatibility: "compatible",
            fileInventory: [],
            metadata: {
              triggerPattern: recipe.triggerPattern,
              applicableRoleTitles: recipe.applicableRoleTitles,
              confidence: recipe.confidence,
              extractorModel: recipe.extractorModel,
            },
            origin: "extracted",
            recipeId: recipe.id,
          })
          .returning()
          .then((rows) => rows[0] ?? null);

        if (!newSkill) return null;

        // Back-fill source_skill_id on the recipe now that we have the company_skills id.
        await tx
          .update(skillRecipes)
          .set({ sourceSkillId: newSkill.id, updatedAt: now })
          .where(eq(skillRecipes.id, id));

        return { recipe: updatedRecipe, companySkill: newSkill };
      });

      if (!result) return null;

      await logActivity(db, {
        companyId: result.recipe.companyId,
        actorType: "user",
        actorId: userId,
        action: "skill_recipe.approved",
        entityType: "skill_recipe",
        entityId: id,
        // Skill content is Tier-2 sensitive — reference by ID only, never inline the body.
        details: { companySkillId: result.companySkill.id },
      });

      return { recipe: toListItem(result.recipe), companySkill: result.companySkill };
    },

    /**
     * Reject a proposed recipe. Persists the rejection_reason so the extractor
     * can eventually learn from negative examples (PR #5+).
     */
    rejectRecipe: async (id: string, userId: string, reason: string): Promise<SkillRecipeListItem | null> => {
      const now = new Date();
      const updated = await db
        .update(skillRecipes)
        .set({
          status: "rejected",
          rejectionReason: reason,
          updatedAt: now,
        })
        .where(eq(skillRecipes.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);

      if (!updated) return null;

      await logActivity(db, {
        companyId: updated.companyId,
        actorType: "user",
        actorId: userId,
        action: "skill_recipe.rejected",
        entityType: "skill_recipe",
        entityId: id,
        // Reason is operator-supplied text — safe to log.
        details: { reason },
      });

      return toListItem(updated);
    },

    /**
     * Archive a recipe. Used for manual operator retirement and by the
     * nightly evaluation rollup cron when effectiveness_delta drops too far.
     */
    archiveRecipe: async (id: string, userId: string): Promise<SkillRecipeListItem | null> => {
      const now = new Date();
      const updated = await db
        .update(skillRecipes)
        .set({
          status: "archived",
          archivedAt: now,
          updatedAt: now,
        })
        .where(eq(skillRecipes.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);

      if (!updated) return null;

      await logActivity(db, {
        companyId: updated.companyId,
        actorType: "user",
        actorId: userId,
        action: "skill_recipe.archived",
        entityType: "skill_recipe",
        entityId: id,
        details: {},
      });

      return toListItem(updated);
    },

    /**
     * Pause an active recipe. Sets `paused_at = now()` without touching `status`
     * so the matcher skips it on the next heartbeat cycle. The recipe remains
     * 'active' in all other respects — statistics keep accumulating, it appears
     * in the Active tab, and it resumes the moment `paused_at` is cleared.
     *
     * Called by both the operator UI (HTTP route) and the runaway detector
     * (direct service call, with actorId = 'system').
     */
    pauseRecipe: async (id: string, actorId: string): Promise<SkillRecipeListItem | null> => {
      const now = new Date();
      const updated = await db
        .update(skillRecipes)
        .set({ pausedAt: now, updatedAt: now })
        .where(eq(skillRecipes.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);

      if (!updated) return null;

      await logActivity(db, {
        companyId: updated.companyId,
        actorType: actorId === "system" ? "system" : "user",
        actorId,
        action: "skill_recipe.paused",
        entityType: "skill_recipe",
        entityId: id,
        details: {},
      });

      return toListItem(updated);
    },

    /**
     * Resume a paused recipe. Clears `paused_at` so the matcher considers it
     * again immediately on the next heartbeat.
     */
    resumeRecipe: async (id: string, actorId: string): Promise<SkillRecipeListItem | null> => {
      const now = new Date();
      const updated = await db
        .update(skillRecipes)
        .set({ pausedAt: null, updatedAt: now })
        .where(eq(skillRecipes.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);

      if (!updated) return null;

      await logActivity(db, {
        companyId: updated.companyId,
        actorType: actorId === "system" ? "system" : "user",
        actorId,
        action: "skill_recipe.resumed",
        entityType: "skill_recipe",
        entityId: id,
        details: {},
      });

      return toListItem(updated);
    },
  };
}

/**
 * API client for skill recipes — PRs 3/6 and 6/6 of the skill loop.
 *
 * Wraps the eight skill-recipe routes behind a typed client that matches the
 * pattern established by `companySkills.ts` and `agents.ts`.
 *
 * The approve endpoint returns both the updated recipe and the newly-created
 * company_skills row so the UI can invalidate both query keys in a single
 * mutation callback.
 *
 * PR 6/6 adds pause/resume endpoints and the `pausedAt` field on list items.
 */

import type { api } from "./client";
import { api as apiClient } from "./client";

// ── Types ────────────────────────────────────────────────────────────────────

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
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  approvedAt: string | null;
  approvedByUserId: string | null;
  /** Non-null when the recipe is paused by the operator or the runaway detector. */
  pausedAt: string | null;
}

export interface SkillRecipeDetail extends SkillRecipeListItem {
  procedureMarkdown: string;
  rationale: string | null;
  rejectionReason: string | null;
  sourceSkillId: string | null;
  sourceRunId: string | null;
  metadata: Record<string, unknown>;
  lastValidatedAt: string | null;
  latestEvaluation: {
    invocationsCount: number;
    completedCount: number;
    failedCount: number;
    effectivenessDelta: string | null;
    operatorThumbsAvg: string | null;
    windowStart: string;
    windowEnd: string;
  } | null;
}

export interface SkillRecipeApproveResult {
  recipe: SkillRecipeListItem;
  companySkill: {
    id: string;
    companyId: string;
    key: string;
    name: string;
    origin: string;
    recipeId: string;
  };
}

export interface EditRecipePatch {
  title?: string;
  triggerPattern?: string;
  procedureMarkdown?: string;
}

// ── Client ────────────────────────────────────────────────────────────────────

export const skillRecipesApi = {
  list: (
    companyId: string,
    opts?: { status?: SkillRecipeStatus },
  ): ReturnType<typeof api.get<SkillRecipeListItem[]>> => {
    const qs = opts?.status ? `?status=${encodeURIComponent(opts.status)}` : "";
    return apiClient.get<SkillRecipeListItem[]>(`/companies/${encodeURIComponent(companyId)}/skill-recipes${qs}`);
  },

  detail: (id: string): ReturnType<typeof api.get<SkillRecipeDetail>> =>
    apiClient.get<SkillRecipeDetail>(`/skill-recipes/${encodeURIComponent(id)}`),

  update: (id: string, patch: EditRecipePatch): ReturnType<typeof api.patch<SkillRecipeListItem>> =>
    apiClient.patch<SkillRecipeListItem>(`/skill-recipes/${encodeURIComponent(id)}`, patch),

  approve: (id: string): ReturnType<typeof api.post<SkillRecipeApproveResult>> =>
    apiClient.post<SkillRecipeApproveResult>(`/skill-recipes/${encodeURIComponent(id)}/approve`, {}),

  reject: (id: string, reason: string): ReturnType<typeof api.post<SkillRecipeListItem>> =>
    apiClient.post<SkillRecipeListItem>(`/skill-recipes/${encodeURIComponent(id)}/reject`, { reason }),

  archive: (id: string): ReturnType<typeof api.post<SkillRecipeListItem>> =>
    apiClient.post<SkillRecipeListItem>(`/skill-recipes/${encodeURIComponent(id)}/archive`, {}),

  pause: (id: string): ReturnType<typeof api.post<SkillRecipeListItem>> =>
    apiClient.post<SkillRecipeListItem>(`/skill-recipes/${encodeURIComponent(id)}/pause`, {}),

  resume: (id: string): ReturnType<typeof api.post<SkillRecipeListItem>> =>
    apiClient.post<SkillRecipeListItem>(`/skill-recipes/${encodeURIComponent(id)}/resume`, {}),
};

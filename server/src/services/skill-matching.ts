/**
 * Skill matching service — PR 4/6 of the IronWorks self-improving skill loop.
 *
 * At heartbeat time, fetches a company's `active` recipes filtered to the
 * agent's role, runs a cheap LLM gate to score relevance against the current
 * issue, and returns up to 2 recipes whose matcher score clears 0.7.
 *
 * The matcher call is best-effort: a 200 ms wall-clock budget is enforced with
 * Promise.race. Any timeout or LLM error returns [] so the heartbeat never
 * stalls waiting for the skill loop.
 *
 * @see MDMP §3.3 "Matching trigger" for the architectural rationale.
 * @see MDMP §3.2 "Matcher system prompt (draft v1)" for prompt + score thresholds.
 */

import type { Db } from "@ironworksai/db";
import { issueLabels, issues, labels, skillRecipes } from "@ironworksai/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "../middleware/logger.js";
import { resolveProviderSecret } from "./provider-secret-resolver.js";
import { checkCostOverhead, isSkillLoopCostDisabled } from "./skill-circuit-breaker.js";
import { SKILL_MATCHER_PROMPT_V1 } from "./skill-prompts.js";

// ── Re-export the SkillRecipe inferred type for callers that don't import from DB ──

export type SkillRecipe = typeof skillRecipes.$inferSelect;

/**
 * A candidate recipe that passed both the role filter and the score threshold.
 * Carries the full recipe row so the injection layer can render the procedure
 * without a second DB round-trip.
 */
export type MatchedRecipe = SkillRecipe & { matcherScore: number };

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Fast, small model. Speed matters more than depth for the matching pass.
 * Free-tier; no fallback — if the matcher fails, the heartbeat continues
 * without skill injection rather than waiting for a retry.
 *
 * @see MDMP §3.3 "Model choices summary"
 */
const MATCHER_MODEL = "google/gemma-3-12b-it:free" as const;

export const MATCHER_MODEL_ID = MATCHER_MODEL;

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Hard wall-clock budget for the matcher LLM call (milliseconds). */
const MATCHER_TIMEOUT_MS = 200;

/** Minimum score to include in the injection set. */
const SCORE_THRESHOLD = 0.7;

/** Maximum matched recipes to inject per heartbeat. */
const MAX_INJECTIONS = 2;

/**
 * Characters of issue description included in the matcher context.
 * ~250 tokens at avg 2 chars/token — enough signal without inflating cost.
 */
const MAX_DESCRIPTION_CHARS = 500;

// ── Atlas Ops dogfood gate ───────────────────────────────────────────────────

/**
 * Skill loop is on by default only for the Atlas Ops dogfood company.
 * Mirrors the same gate in skill-extraction.ts.
 *
 * @see MDMP §6 decision #6.
 */
const ATLAS_OPS_COMPANY_ID = "ec7708b1-11c8-4117-a2ff-02b4aebe9c76" as const;

function isSkillLoopEnabled(companyId: string): boolean {
  if (process.env.SKILL_LOOP_ENABLED === "true") return true;
  return companyId === ATLAS_OPS_COMPANY_ID;
}

// ── DB helpers ───────────────────────────────────────────────────────────────

/**
 * Fetch all `active`, non-paused recipes for a company where
 * `applicable_role_titles` contains the agent's role title.
 *
 * An empty `applicable_role_titles` array means the recipe has no role
 * restriction and is always included — guarded by the OR clause below.
 *
 * Recipes with a non-null `paused_at` are excluded so a paused recipe stops
 * being injected immediately without a status change. They remain 'active' and
 * resume on the very next heartbeat once `paused_at` is cleared.
 */
async function fetchCandidateRecipes(db: Db, companyId: string, agentRoleTitle: string): Promise<SkillRecipe[]> {
  return db
    .select()
    .from(skillRecipes)
    .where(
      and(
        eq(skillRecipes.companyId, companyId),
        eq(skillRecipes.status, "active"),
        // Exclude operator-paused and runaway-detector-paused recipes
        sql`${skillRecipes.pausedAt} IS NULL`,
        // Include recipes that restrict to this role OR have no role restriction
        sql`(
          ${skillRecipes.applicableRoleTitles} @> ARRAY[${agentRoleTitle}]::text[]
          OR array_length(${skillRecipes.applicableRoleTitles}, 1) IS NULL
          OR array_length(${skillRecipes.applicableRoleTitles}, 1) = 0
        )`,
      ),
    );
}

/**
 * Fetch issue context for the matcher prompt: title, first 500 chars of
 * description, and attached label names.
 */
async function fetchIssueMatcherContext(
  db: Db,
  issueId: string,
  companyId: string,
): Promise<{ title: string; description: string; labelNames: string[] } | null> {
  const rows = await db
    .select({ title: issues.title, description: issues.description })
    .from(issues)
    .where(and(eq(issues.id, issueId), eq(issues.companyId, companyId)))
    .limit(1);

  const issue = rows[0];
  if (!issue) return null;

  const labelRows = await db
    .select({ name: labels.name })
    .from(issueLabels)
    .innerJoin(labels, eq(issueLabels.labelId, labels.id))
    .where(eq(issueLabels.issueId, issueId));

  return {
    title: issue.title,
    description: (issue.description ?? "").slice(0, MAX_DESCRIPTION_CHARS),
    labelNames: labelRows.map((r) => r.name),
  };
}

// ── Matcher LLM call ─────────────────────────────────────────────────────────

interface MatcherRawResponse {
  matches: Array<{ id: string; score: number }>;
}

/**
 * Build the user-turn content for the matcher prompt.
 *
 * Candidates are rendered as a compact list so the model can correlate IDs
 * with trigger patterns without reading full procedure markdown — that text
 * would exceed the budget for a 200 ms call.
 */
function buildMatcherUserContent(
  candidates: SkillRecipe[],
  issue: { title: string; description: string; labelNames: string[] },
  agentRoleTitle: string,
): string {
  const candidateList = candidates
    .map((r, i) => `[${i + 1}] id=${r.id}\n  title: ${r.title}\n  trigger: ${r.triggerPattern}`)
    .join("\n\n");

  const labelsStr = issue.labelNames.length > 0 ? issue.labelNames.join(", ") : "none";

  return [
    "## Candidate skill recipes",
    candidateList,
    "",
    "## Current issue context",
    `Title: ${issue.title}`,
    `Labels: ${labelsStr}`,
    `Agent role: ${agentRoleTitle}`,
    `Description excerpt: ${issue.description || "(none)"}`,
  ].join("\n");
}

/**
 * Call OpenRouter with a hard 200 ms budget via Promise.race.
 *
 * Returns the parsed JSON on success, or throws on HTTP / parse error.
 * The timeout arm resolves to null so the caller can distinguish timeout
 * from a hard LLM error.
 */
async function callMatcherLlmWithTimeout(apiKey: string, userContent: string): Promise<MatcherRawResponse | null> {
  const llmCall = async (): Promise<MatcherRawResponse | null> => {
    const response = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ironworks.ai",
        "X-Title": "IronWorks Skill Matcher",
      },
      body: JSON.stringify({
        model: MATCHER_MODEL,
        messages: [
          { role: "system", content: SKILL_MATCHER_PROMPT_V1 },
          { role: "user", content: userContent },
        ],
        temperature: 0.1, // Near-deterministic — scoring consistency matters more than creativity
        max_tokens: 256,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Matcher HTTP ${response.status}: ${body}`);
    }

    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? "";
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const matches = Array.isArray(parsed.matches) ? parsed.matches : [];

    return {
      matches: matches
        .filter(
          (m): m is { id: string; score: number } =>
            typeof m === "object" &&
            m !== null &&
            typeof (m as Record<string, unknown>).id === "string" &&
            typeof (m as Record<string, unknown>).score === "number",
        )
        .map((m) => ({ id: m.id, score: m.score })),
    };
  };

  // Wall-clock budget: if the fetch + parse takes longer than MATCHER_TIMEOUT_MS,
  // treat it as a skip (return null) so the heartbeat isn't blocked.
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), MATCHER_TIMEOUT_MS));

  return Promise.race([llmCall(), timeout]);
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface MatchSkillsOpts {
  companyId: string;
  agentId: string;
  issueId: string | null;
  agentRoleTitle: string;
}

/**
 * Fetch active recipes for the agent's role, run the cheap LLM matcher, and
 * return up to 2 recipes whose score clears the 0.7 threshold.
 *
 * Returns [] in all early-exit scenarios: feature disabled, no issue, no
 * candidates, matcher timeout, or any LLM / parse error.
 *
 * @see MDMP §3.3 "Matching trigger"
 */
export async function matchSkillsForRun(db: Db, opts: MatchSkillsOpts): Promise<MatchedRecipe[]> {
  const { companyId, agentId, issueId, agentRoleTitle } = opts;

  if (!isSkillLoopEnabled(companyId)) return [];
  // Matcher requires an issue to provide context — skills are issue-scoped in v1
  if (!issueId) return [];

  // Fast denylist check (in-memory) before the candidate DB query
  if (isSkillLoopCostDisabled(companyId)) {
    logger.info({ companyId, agentId }, "[skill-matching] skill loop disabled by cost circuit breaker, skipping");
    return [];
  }

  // Cost overhead check — skip matcher LLM call if spend is over threshold
  const costCheck = await checkCostOverhead(db, companyId).catch((err) => {
    logger.warn({ err, companyId }, "[skill-matching] cost overhead check failed (non-fatal), proceeding");
    return null;
  });

  if (costCheck?.shouldDisable) {
    logger.info(
      { companyId, agentId, ratio: costCheck.ratio },
      "[skill-matching] cost circuit breaker triggered, skipping matcher",
    );
    return [];
  }

  try {
    const candidates = await fetchCandidateRecipes(db, companyId, agentRoleTitle);
    if (candidates.length === 0) {
      // Skip LLM call entirely — no candidates means nothing to match against
      return [];
    }

    const issueCtx = await fetchIssueMatcherContext(db, issueId, companyId);
    if (!issueCtx) return [];

    const secret = await resolveProviderSecret(db, companyId, "openrouter_api");
    if (!secret.apiKey) {
      logger.warn({ companyId, agentId }, "[skill-matching] no openrouter_api key available, skipping");
      return [];
    }

    const userContent = buildMatcherUserContent(candidates, issueCtx, agentRoleTitle);
    const raw = await callMatcherLlmWithTimeout(secret.apiKey, userContent);

    if (raw === null) {
      // Timeout — silently skip, not an error
      logger.debug({ companyId, agentId, issueId }, "[skill-matching] matcher timed out, skipping");
      return [];
    }

    // Build an ID → recipe map so we can resolve full rows and filter hallucinated IDs
    const candidateMap = new Map<string, SkillRecipe>(candidates.map((r) => [r.id, r]));

    const matched: MatchedRecipe[] = raw.matches
      // Reject any ID not in the input list — guards against hallucination
      .filter((m) => candidateMap.has(m.id))
      // Enforce score threshold
      .filter((m) => m.score >= SCORE_THRESHOLD)
      // Sort descending by score so the cap always keeps the best two
      .sort((a, b) => b.score - a.score)
      // Cap at 2 injections per prompt
      .slice(0, MAX_INJECTIONS)
      .map((m) => ({
        ...(candidateMap.get(m.id) as SkillRecipe),
        matcherScore: m.score,
      }));

    logger.info(
      { companyId, agentId, issueId, matchedCount: matched.length, candidateCount: candidates.length },
      "[skill-matching] matcher completed",
    );

    return matched;
  } catch (err) {
    // Any error in the matcher must not propagate to the heartbeat caller.
    // Log and return empty so the run proceeds without skills.
    logger.warn({ err, companyId, agentId, issueId }, "[skill-matching] matcher error, proceeding without skills");
    return [];
  }
}

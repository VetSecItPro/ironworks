/**
 * Skill circuit breaker — PR 6/6 of the IronWorks self-improving skill loop.
 *
 * Two independent safeguards that prevent the skill loop from running away:
 *
 * 1. Activation-rate runaway detector (`detectRunawayRecipes`):
 *    Compares skill invocations in the last N hours against total heartbeat runs.
 *    Any recipe whose activation rate exceeds 50% is auto-paused and flagged.
 *    Designed to run from a cron every 15 minutes (see cron entry in PR body).
 *
 * 2. Cost-overhead circuit breaker (`checkCostOverhead`):
 *    Reads cost_events for the last 24h and computes skill_loop spend as a
 *    fraction of agent_work spend. If the ratio exceeds 15%, the skill loop is
 *    disabled for that company via an in-memory denylist (resets on server
 *    restart — see TODO below for persistence path).
 *    Checked by both the extraction service and the matcher before any LLM call.
 *
 * Both functions are pure-async with no side effects beyond the operations they
 * describe. Callers should log the results at the appropriate severity level.
 *
 * @see MDMP §2.2 reliability lens: "activation runaway" and "cost lens" mitigations.
 * @see MDMP §5 risk table: "Skill activation cost explodes on free tier".
 */

import type { Db } from "@ironworksai/db";
import { costEvents, heartbeatRuns, skillInvocations, skillRecipes } from "@ironworksai/db";
import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import { logger } from "../middleware/logger.js";
import { skillRecipeService } from "./skill-recipe-service.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Fraction of heartbeat runs at which a single recipe is considered "runaway".
 * 50% means the recipe fires on more than half of all runs in the window —
 * a strong signal of an over-broad trigger pattern.
 *
 * @see MDMP §2.2 "Activation runaway" + §2.7 failure mode table.
 */
const RUNAWAY_ACTIVATION_RATIO = 0.5;

/**
 * Fraction of agent_work spend at which skill_loop overhead triggers the
 * cost circuit breaker. 15% is intentionally conservative so it fires well
 * before free-tier rate limits become visible.
 *
 * @see MDMP §2.3 "Budget approach" and §5 risk table.
 */
const COST_OVERHEAD_THRESHOLD = 0.15;

// ── In-memory cost denylist ───────────────────────────────────────────────────

/**
 * Companies whose skill loop has been disabled by the cost circuit breaker.
 *
 * In-memory for now — the circuit breaker fires rarely, and a server restart
 * is an acceptable way to re-enable (operator investigates first).
 *
 * TODO (post-dogfood): persist to instance_settings.experimental.skillLoopDenylist
 * so the denylist survives a deploy restart. The key shape would be
 * `{ [companyId]: { disabledAt: ISO string, reason: string } }`.
 */
const costDenylist = new Set<string>();

/**
 * Expose for test stubs and the extraction/matching guards that call this
 * function to check denylist membership without re-running the DB query.
 */
export function isSkillLoopCostDisabled(companyId: string): boolean {
  return costDenylist.has(companyId);
}

// ── Runaway detector ──────────────────────────────────────────────────────────

export interface RunawayDetectionOpts {
  /** Restrict detection to a single company. Omit to check all companies. */
  companyId?: string;
  /** Look-back window for invocation + heartbeat-run counts. Default 24 hours. */
  windowHours?: number;
}

export type RecipeId = string;

/**
 * Detect recipes whose activation rate has exceeded RUNAWAY_ACTIVATION_RATIO
 * in the given time window.
 *
 * Algorithm:
 *   1. Count distinct heartbeat runs in the window (per company).
 *   2. Count skill_invocations per recipe in the window.
 *   3. For each recipe: ratio = invocations / total_runs. If ratio > 0.5, flag it.
 *
 * Side effects:
 *   - Auto-pauses each runaway recipe via skillRecipeService.pauseRecipe.
 *   - Inserts an activity_log entry for each pause (via the service).
 *
 * Returns the list of paused recipe IDs so callers can send Telegram alerts.
 */
export async function detectRunawayRecipes(db: Db, opts: RunawayDetectionOpts = {}): Promise<RecipeId[]> {
  const windowHours = opts.windowHours ?? 24;
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  // Count total heartbeat runs in the window, grouped by company
  const runCountQuery = db
    .select({
      companyId: heartbeatRuns.companyId,
      totalRuns: count(heartbeatRuns.id),
    })
    .from(heartbeatRuns)
    .where(
      and(
        gte(heartbeatRuns.startedAt, windowStart),
        opts.companyId ? eq(heartbeatRuns.companyId, opts.companyId) : undefined,
      ),
    )
    .groupBy(heartbeatRuns.companyId);

  // Count invocations per recipe in the window, with company for the rate lookup
  const invocationCountQuery = db
    .select({
      recipeId: skillInvocations.recipeId,
      companyId: skillInvocations.companyId,
      invocations: count(skillInvocations.id),
    })
    .from(skillInvocations)
    .where(
      and(
        gte(skillInvocations.injectedAt, windowStart),
        opts.companyId ? eq(skillInvocations.companyId, opts.companyId) : undefined,
      ),
    )
    .groupBy(skillInvocations.recipeId, skillInvocations.companyId);

  const [runCounts, invocationCounts] = await Promise.all([runCountQuery, invocationCountQuery]);

  // Build a map of companyId → total runs for O(1) lookup
  const runsByCompany = new Map<string, number>(runCounts.map((r) => [r.companyId, r.totalRuns]));

  const runawayRecipeIds: RecipeId[] = [];
  const svc = skillRecipeService(db);

  for (const inv of invocationCounts) {
    const totalRuns = runsByCompany.get(inv.companyId) ?? 0;
    if (totalRuns === 0) continue; // No runs in window — can't compute ratio

    const ratio = inv.invocations / totalRuns;
    if (ratio <= RUNAWAY_ACTIVATION_RATIO) continue;

    logger.warn(
      {
        recipeId: inv.recipeId,
        companyId: inv.companyId,
        invocations: inv.invocations,
        totalRuns,
        ratio: ratio.toFixed(3),
      },
      "[skill-circuit-breaker] runaway recipe detected, auto-pausing",
    );

    // Auto-pause: actorId = 'system' so the audit log shows this was automated
    const paused = await svc.pauseRecipe(inv.recipeId, "system").catch((err) => {
      logger.error({ err, recipeId: inv.recipeId }, "[skill-circuit-breaker] failed to auto-pause runaway recipe");
      return null;
    });

    if (paused) {
      runawayRecipeIds.push(inv.recipeId);
    }
  }

  return runawayRecipeIds;
}

// ── Cost overhead circuit breaker ─────────────────────────────────────────────

export interface CostOverheadResult {
  shouldDisable: boolean;
  ratio: number;
  agentWorkSpend: number;
  skillLoopSpend: number;
}

/**
 * Check whether the skill loop's LLM spend is approaching an unacceptable
 * fraction of total agent-work spend for the given company over the last 24h.
 *
 * Reads `cost_events` rows, groups by `billing_code`:
 *   - `billing_code = 'skill_loop'`  → extraction + matching overhead
 *   - `billing_code IS NULL` (or any other value) → agent work baseline
 *
 * Returns `shouldDisable: true` when skill_loop_spend / agent_work_spend > 0.15.
 *
 * Side effects when shouldDisable = true:
 *   - Adds `companyId` to the in-memory denylist (checked by extraction and
 *     matching services before every LLM call).
 *   - Logs a warn-level message so the VPS log aggregator captures it.
 *
 * The denylist resets on server restart. Operators must restart the server (or
 * wait for the next deploy) to re-enable after investigating the root cause.
 */
export async function checkCostOverhead(db: Db, companyId: string): Promise<CostOverheadResult> {
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      billingCode: costEvents.billingCode,
      totalCost: sql<number>`COALESCE(SUM(${costEvents.costCents}), 0)`,
    })
    .from(costEvents)
    .where(and(eq(costEvents.companyId, companyId), gte(costEvents.occurredAt, windowStart)))
    .groupBy(costEvents.billingCode);

  let skillLoopSpend = 0;
  let agentWorkSpend = 0;

  for (const row of rows) {
    if (row.billingCode === "skill_loop") {
      skillLoopSpend += row.totalCost;
    } else {
      // All other billing codes (null, 'agent_work', any future codes) count
      // as agent-work baseline for this ratio computation
      agentWorkSpend += row.totalCost;
    }
  }

  // When agent work spend is zero, treat the ratio as zero — the company has
  // not generated any baseline spend yet, so we can't meaningfully measure overhead.
  const ratio = agentWorkSpend > 0 ? skillLoopSpend / agentWorkSpend : 0;
  const shouldDisable = ratio > COST_OVERHEAD_THRESHOLD;

  if (shouldDisable && !costDenylist.has(companyId)) {
    costDenylist.add(companyId);
    logger.warn(
      { companyId, ratio: ratio.toFixed(4), skillLoopSpend, agentWorkSpend },
      "[skill-circuit-breaker] cost overhead threshold exceeded, skill loop disabled for company",
    );
  }

  return { shouldDisable, ratio, agentWorkSpend, skillLoopSpend };
}

// ── Wrapper: runaway check + Telegram alert (for the cron script) ─────────────

/**
 * Run the runaway detector for all companies and send a Telegram alert for
 * each batch of auto-paused recipes.
 *
 * Designed to be called from `scripts/skill-runaway-check.mjs` which runs
 * every 15 minutes on the VPS.
 *
 * The Telegram call is fire-and-forget; failures are logged but do not prevent
 * the function from returning the full list of paused IDs.
 */
export async function runRunawayCheckAndAlert(
  db: Db,
  opts: {
    telegramBotToken?: string;
    telegramChatId?: string;
  } = {},
): Promise<RecipeId[]> {
  const paused = await detectRunawayRecipes(db);

  if (paused.length === 0) return paused;

  logger.info({ pausedCount: paused.length }, "[skill-circuit-breaker] runaway check complete, recipes paused");

  // Send Telegram alert if credentials are available
  if (opts.telegramBotToken && opts.telegramChatId) {
    const message = [
      "🛑 *Skill Loop Runaway Detected*",
      "",
      `${paused.length} recipe(s) were auto-paused due to activation rate > 50%:`,
      ...paused.map((id) => `  • \`${id}\``),
      "",
      "Review in Settings → Skill Recipes → Active tab.",
    ].join("\n");

    const url = `https://api.telegram.org/bot${opts.telegramBotToken}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: opts.telegramChatId,
        text: message,
        parse_mode: "Markdown",
      }),
    }).catch((err) => {
      // Alert failure must not surface as an error to the cron caller
      logger.warn({ err }, "[skill-circuit-breaker] Telegram alert failed (non-fatal)");
    });
  }

  return paused;
}

// ── Utility: fetch active-recipe counts for the runaway-check cron ────────────

/**
 * Return all companies that have at least one active, non-paused skill recipe.
 * The cron script calls this to decide which companies to check rather than
 * running the full query against all companies unconditionally.
 */
export async function getCompaniesWithActiveRecipes(db: Db): Promise<string[]> {
  const rows = await db
    .selectDistinct({ companyId: skillRecipes.companyId })
    .from(skillRecipes)
    .where(and(eq(skillRecipes.status, "active"), isNull(skillRecipes.pausedAt)));

  return rows.map((r) => r.companyId);
}

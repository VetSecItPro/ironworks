/**
 * skill_invocations — one row per time a skill recipe was injected into an agent prompt.
 *
 * Records both the matcher's confidence (score) and the actual run outcome so the
 * evaluation rollup can compute counterfactual effectiveness deltas. The operator
 * thumbs column captures optional binary feedback from the Telegram one-tap prompt.
 *
 * @see MDMP §3.1 for the full schema rationale.
 * @see MDMP §2.5 for the counterfactual measurement methodology.
 */
import { index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { issues } from "./issues.js";
import { skillRecipes } from "./skill_recipes.js";

export const skillInvocations = pgTable(
  "skill_invocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => skillRecipes.id),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    heartbeatRunId: uuid("heartbeat_run_id").references(() => heartbeatRuns.id),
    // SEC: issue hard-delete sets historical FK to null rather than blocking; preserves audit row
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    /** Matcher confidence at injection time; range 0.000–1.000. */
    matcherScore: numeric("matcher_score", { precision: 4, scale: 3 }),
    /** Model used for matching (e.g. 'google/gemma-3-12b-it:free'). */
    matcherModel: text("matcher_model").notNull(),
    injectedAt: timestamp("injected_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Result of the run that consumed this injection.
     * 'inflight' until heartbeat-post-run writes the final value.
     */
    outcome: text("outcome"),
    /**
     * Rolling-median runs-to-completion for the matched label set over the
     * prior 14 days, excluding runs where this recipe was active.
     * Used as the counterfactual baseline for effectiveness_delta computation.
     */
    expectedRunsToCompletion: numeric("expected_runs_to_completion"),
    /** Actual heartbeat iterations consumed to resolve this issue. */
    actualRunsToCompletion: integer("actual_runs_to_completion"),
    /** Operator one-tap feedback: -1 (bad), 0 (neutral), 1 (good). Nullable. */
    operatorThumbs: integer("operator_thumbs"),
    notes: text("notes"),
  },
  (table) => ({
    /**
     * Primary read path for the evaluation rollup: per-recipe time series.
     * DESC order matches the rolling-window query pattern.
     */
    recipeTimeIdx: index("skill_invocations_recipe_idx").on(table.recipeId, table.injectedAt),
    /** Secondary path: company-level outcome aggregation for the circuit breaker. */
    companyOutcomeIdx: index("skill_invocations_company_outcome_idx").on(table.companyId, table.outcome),
  }),
);

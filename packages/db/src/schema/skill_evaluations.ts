/**
 * skill_evaluations — rolling weekly aggregate per skill recipe.
 *
 * Populated by the nightly eval-rollup cron (scripts/skill-eval-rollup.mjs).
 * The unique constraint on (recipe_id, window_start) makes the rollup
 * idempotent — re-running the script for the same window upserts in place.
 *
 * effectiveness_delta = (expected_runs - actual_runs) / expected_runs.
 * Positive = skill helped. Negative = skill hurt or was irrelevant.
 * Auto-archive fires when delta < -0.10 over >= 5 invocations.
 *
 * @see MDMP §2.5 for the evaluation methodology.
 * @see MDMP §3.3 for the cron schedule.
 */
import { integer, numeric, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { skillRecipes } from "./skill_recipes.js";

export const skillEvaluations = pgTable(
  "skill_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => skillRecipes.id),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    invocationsCount: integer("invocations_count").notNull(),
    completedCount: integer("completed_count").notNull(),
    failedCount: integer("failed_count").notNull(),
    reopenCount: integer("reopen_count").notNull(),
    /**
     * (expected_runs - actual_runs) / expected_runs.
     * Precision 5/4 supports values like -0.1234 and +0.9999.
     */
    effectivenessDelta: numeric("effectiveness_delta", { precision: 5, scale: 4 }),
    /** Average of operator_thumbs values for this window (-1.000 to 1.000). */
    operatorThumbsAvg: numeric("operator_thumbs_avg", { precision: 4, scale: 3 }),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /**
     * Uniqueness constraint makes the rollup script idempotent:
     * same recipe + window_start = upsert, not a new row.
     */
    recipeWindowUniqueIdx: uniqueIndex("skill_evaluations_recipe_window_idx").on(table.recipeId, table.windowStart),
  }),
);

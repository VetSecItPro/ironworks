/**
 * skill_recipes — staging and history layer for AI-proposed skill recipes.
 *
 * Proposed recipes flow through: proposed → approved → active → archived.
 * Once approved, the operator materialises the recipe into company_skills
 * (setting origin='extracted', recipe_id=this row). The company_skills row
 * is what agents actually load; this table carries provenance, confidence,
 * and rejection history.
 *
 * Recipes are never modified in place after activation — "improvement" means
 * archiving the old recipe and creating a new one (immutable-procedure pattern).
 *
 * @see MDMP §3.1 for the full schema rationale.
 */
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { issues } from "./issues.js";

// company_skills is defined after skill_recipes in dependency order, so the
// back-reference (source_skill_id) uses a forward-declare string rather than
// the table object — Drizzle resolves FK strings at migration-generate time.
export const skillRecipes = pgTable(
  "skill_recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    /** Populated once an approved recipe is materialised into company_skills. */
    sourceSkillId: uuid("source_skill_id"),
    proposedByAgentId: uuid("proposed_by_agent_id").references(() => agents.id),
    sourceIssueId: uuid("source_issue_id").references(() => issues.id),
    sourceRunId: uuid("source_run_id").references(() => heartbeatRuns.id),
    title: text("title").notNull(),
    /** "When the issue label includes 'invoice' AND the assignee is CFO…" */
    triggerPattern: text("trigger_pattern").notNull(),
    procedureMarkdown: text("procedure_markdown").notNull(),
    /** Extractor's explanation of why this procedure generalises. */
    rationale: text("rationale"),
    /** Role titles this recipe applies to; empty array = no restriction (unused in v1). */
    applicableRoleTitles: text("applicable_role_titles").array().notNull().default([]),
    /**
     * Recipe lifecycle state.
     * proposed → operator reviews → approved/rejected
     * approved → operator activates → active
     * active → effectiveness drops or operator retires → archived
     */
    status: text("status").notNull().default("proposed"),
    rejectionReason: text("rejection_reason"),
    /** 0-100 extractor self-score; two-pass agreement raises this before proposing. */
    confidence: integer("confidence").notNull().default(50),
    /** Model that ran the extraction pass (e.g. 'openai/gpt-oss-120b:free'). */
    extractorModel: text("extractor_model").notNull(),
    approvedByUserId: text("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /**
     * Tracks when this recipe's effectiveness was last measured against live runs.
     * Auto-archive fires when this is stale + effectiveness_delta < -0.10.
     */
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }).defaultNow(),
    /**
     * Set to a non-null timestamp by the operator (or runaway detector) to
     * temporarily suspend this recipe from being injected. The matcher filters
     * WHERE paused_at IS NULL so a paused recipe is silently skipped without
     * changing its lifecycle status.
     *
     * Cleared (set to NULL) by the resume action to resume injection immediately
     * on the next heartbeat.
     *
     * @see MDMP §4 PR #6: "per-recipe pause/resume"
     */
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** Primary query path: operator Skills UI lists by company + status. */
    companyStatusIdx: index("skill_recipes_company_status_idx").on(table.companyId, table.status),
    /**
     * Secondary query path: matcher filters candidate recipes to the agent's role.
     * A GIN index on the array column is created in the raw migration SQL for
     * applicable_role_titles; this btree index covers the company_id prefix.
     */
    companyRoleIdx: index("skill_recipes_company_role_idx").on(table.companyId, table.applicableRoleTitles),
  }),
);

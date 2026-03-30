import { pgTable, uuid, text, integer, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { playbooks } from "./playbooks.js";
import { goals } from "./goals.js";
import { issues } from "./issues.js";

export const playbookRuns = pgTable(
  "playbook_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    playbookId: uuid("playbook_id").notNull().references(() => playbooks.id),
    /** Goal created for this run. */
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    /** Status: running, completed, failed, cancelled. */
    status: text("status").notNull().default("running"),
    /** Total steps in this run. */
    totalSteps: integer("total_steps").notNull().default(0),
    /** Steps completed so far. */
    completedSteps: integer("completed_steps").notNull().default(0),
    /** Who triggered this run (user ID or agent ID). */
    triggeredBy: text("triggered_by"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("playbook_runs_company_idx").on(table.companyId),
    playbookIdx: index("playbook_runs_playbook_idx").on(table.playbookId),
    statusIdx: index("playbook_runs_status_idx").on(table.companyId, table.status),
  }),
);

export const playbookRunSteps = pgTable(
  "playbook_run_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull().references(() => playbookRuns.id, { onDelete: "cascade" }),
    /** Original step order from the playbook template. */
    stepOrder: integer("step_order").notNull(),
    /** Step title (copied from template). */
    title: text("title").notNull(),
    /** Issue created for this step. */
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    /** Agent assigned to this step. */
    assignedAgentId: uuid("assigned_agent_id"),
    /** Status: pending, blocked, ready, in_progress, completed, skipped. */
    status: text("status").notNull().default("pending"),
    /** Step orders this step depends on (copied from template). */
    dependsOn: jsonb("depends_on").$type<number[]>().default([]),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    runIdx: index("playbook_run_steps_run_idx").on(table.runId),
    issueIdx: index("playbook_run_steps_issue_idx").on(table.issueId),
  }),
);

import { pgTable, uuid, text, integer, timestamp, index, jsonb, boolean } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const playbooks = pgTable(
  "playbooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    /** Display name. */
    name: text("name").notNull(),
    /** One-liner description shown in the list. */
    description: text("description"),
    /** Detailed instructions / context for this playbook. */
    body: text("body"),
    /** Icon name (lucide icon key). */
    icon: text("icon"),
    /** Category for grouping: operations, security, marketing, engineering, onboarding, custom. */
    category: text("category").notNull().default("custom"),
    /** Whether this is a system-seeded playbook. */
    isSeeded: boolean("is_seeded").notNull().default(false),
    /** Status: active, archived, draft. */
    status: text("status").notNull().default("active"),
    /** Estimated duration in minutes (for display). */
    estimatedMinutes: integer("estimated_minutes"),
    /** Number of times this playbook has been executed. */
    runCount: integer("run_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("playbooks_company_idx").on(table.companyId),
    companyCategoryIdx: index("playbooks_company_category_idx").on(table.companyId, table.category),
  }),
);

export const playbookSteps = pgTable(
  "playbook_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playbookId: uuid("playbook_id").notNull().references(() => playbooks.id, { onDelete: "cascade" }),
    /** Step order (1-based). */
    stepOrder: integer("step_order").notNull(),
    /** Step title. */
    title: text("title").notNull(),
    /** Detailed instructions for the agent executing this step. */
    instructions: text("instructions"),
    /** Role that should execute this step (e.g. "ceo", "cto", "securityengineer"). */
    assigneeRole: text("assignee_role"),
    /** Specific agent ID to assign (overrides role). */
    assigneeAgentId: uuid("assignee_agent_id"),
    /** Step IDs that must complete before this step can start (JSON array of step orders). */
    dependsOn: jsonb("depends_on").$type<number[]>().default([]),
    /** Estimated minutes for this step. */
    estimatedMinutes: integer("estimated_minutes"),
    /** Skills required for the agent executing this step (JSON array of skill names). */
    requiredSkills: jsonb("required_skills").$type<string[]>().default([]),
    /** Whether this step requires approval before marking complete. */
    requiresApproval: boolean("requires_approval").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    playbookIdx: index("playbook_steps_playbook_idx").on(table.playbookId),
    playbookOrderIdx: index("playbook_steps_playbook_order_idx").on(table.playbookId, table.stepOrder),
  }),
);

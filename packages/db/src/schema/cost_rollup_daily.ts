import { bigint, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";

/**
 * Pre-aggregated daily cost rollup, sourced from cost_events by the nightly
 * cron job. Grain: one row per (day, company_id, agent_id, provider, source).
 *
 * cost_usd_micro stores cost in micro-USD (1e-6) to preserve sub-cent
 * precision across SUM aggregates without floating-point drift.
 * Conversion: cost_events.cost_cents × 10_000 = cost_usd_micro.
 * Divide by 1_000_000 in application code to recover USD.
 */
export const costRollupDaily = pgTable(
  "cost_rollup_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    day: date("day").notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    // Nullable: playground or system calls have no associated agent
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    // Discriminates call origin: 'agent' | 'playground' | 'unknown'
    source: text("source").notNull().default("agent"),
    callCount: integer("call_count").notNull().default(0),
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
    outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
    // Micro-USD (cost_cents × 10_000); avoids float drift in large aggregates
    costUsdMicro: bigint("cost_usd_micro", { mode: "number" }).notNull().default(0),
    rolledUpAt: timestamp("rolled_up_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Time-series queries: company + date range scan
    companyDayIdx: index("idx_crd_company_day").on(table.companyId, table.day),
    // Per-agent breakdown queries
    companyAgentIdx: index("idx_crd_company_agent").on(table.companyId, table.agentId, table.day),
    // Per-provider (adapter) breakdown queries
    companyProviderIdx: index("idx_crd_company_provider").on(table.companyId, table.provider, table.day),
    // Source-filtered queries (agent vs playground)
    companySourceIdx: index("idx_crd_company_source").on(table.companyId, table.source, table.day),
  }),
);

export type CostRollupDaily = typeof costRollupDaily.$inferSelect;
export type NewCostRollupDaily = typeof costRollupDaily.$inferInsert;

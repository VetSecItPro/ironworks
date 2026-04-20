import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";

/**
 * G.25 adapter-call audit log. Each completed (success or error) adapter
 * invocation writes one row. Grain: one row per call.
 *
 * Design decisions:
 *   - promptPayload / responsePayload store the full JSONB for replay / diff.
 *     Both are intentionally nullable so reads without payload are cheaper.
 *   - adapterConfigSnapshot captures the provider config at invocation time
 *     with secret key names stripped before write (see adapter-call-writer.ts).
 *   - promptPreview / responsePreview are 120-char truncated text for list UIs
 *     (no need to JOIN to the full payload just to render a row).
 *   - replayOf creates a lineage chain: each replay row points at the original
 *     call's id so diffs between original and replay are always available.
 *
 * Retention: application code enforces a ring-buffer (last 1 000 calls per
 * workspace, max 30 days). No DB-level TTL to keep the migration simple.
 */
export const adapterCalls = pgTable(
  "adapter_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    adapterType: text("adapter_type").notNull(),
    model: text("model").notNull(),
    // 'success' | 'error'
    status: text("status").notNull(),
    latencyMs: integer("latency_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    // Stored as integer cents to avoid float drift
    costUsdCents: integer("cost_usd_cents"),
    // 'agent' | 'playground' | 'replay' | 'unknown'
    source: text("source").notNull().default("agent"),
    // Non-null only for replay rows; points at the original call
    replayOf: uuid("replay_of"),
    errorCode: text("error_code"),
    // Truncated to 120 chars for list display without loading full payloads
    promptPreview: text("prompt_preview"),
    responsePreview: text("response_preview"),
    promptPayload: jsonb("prompt_payload").$type<unknown>(),
    responsePayload: jsonb("response_payload").$type<unknown>(),
    // Provider config at invocation time — secret key names stripped before write
    adapterConfigSnapshot: jsonb("adapter_config_snapshot").$type<Record<string, unknown>>(),
    requestId: text("request_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Primary access pattern: list by company ordered by time
    companyOccurredIdx: index("idx_ac_company_occurred").on(table.companyId, table.occurredAt),
    // Filter by agent within a company
    companyAgentIdx: index("idx_ac_company_agent").on(table.companyId, table.agentId),
    // Filter by adapter type (e.g. anthropic_api, openai_api)
    companyAdapterTypeIdx: index("idx_ac_company_adapter_type").on(table.companyId, table.adapterType),
    // Filter by source (agent, playground, replay)
    companySourceIdx: index("idx_ac_company_source").on(table.companyId, table.source),
  }),
);

export type AdapterCall = typeof adapterCalls.$inferSelect;
export type NewAdapterCall = typeof adapterCalls.$inferInsert;

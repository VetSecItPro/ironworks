import { index, integer, jsonb, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { agentChannels } from "./agent_channels.js";

export const channelResponseState = pgTable(
  "channel_response_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => agentChannels.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull(),
    agentResponseCount: integer("agent_response_count").notNull().default(0),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
    lastHumanMessageAt: timestamp("last_human_message_at", { withTimezone: true }),
    lastAgentMessageAt: timestamp("last_agent_message_at", { withTimezone: true }),
    // Hourly circuit breaker: counts agent responses in a rolling 60-min window.
    // NOT reset by human messages (independent of human activity per design spec).
    hourlyAgentResponseCount: integer("hourly_agent_response_count").notNull().default(0),
    hourlyWindowStart: timestamp("hourly_window_start", { withTimezone: true }).notNull().defaultNow(),
    // Per-agent cooldown: map of agentId -> ISO timestamp of that agent's last
    // response in this channel. Pruned to last 60 min on every write to bound size.
    agentLastRespondedAt: jsonb("agent_last_responded_at").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    channelUnique: unique("channel_response_state_channel_unique").on(table.channelId),
    companyIdx: index("idx_channel_response_state_company").on(table.companyId),
  }),
);

import { index, integer, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    channelUnique: unique("channel_response_state_channel_unique").on(table.channelId),
    companyIdx: index("idx_channel_response_state_company").on(table.companyId),
  }),
);

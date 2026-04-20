import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const agentChannels = pgTable(
  "agent_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull().default("company"),
    scopeId: text("scope_id"),
    name: text("name").notNull(),
    pinnedMessageIds: jsonb("pinned_message_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("agent_channels_company_idx").on(table.companyId),
    scopeIdx: uniqueIndex("agent_channels_scope_idx").on(table.companyId, table.scopeType, table.scopeId),
  }),
);

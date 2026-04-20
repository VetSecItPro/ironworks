import { type AnyPgColumn, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { agentChannels } from "./agent_channels.js";
import { agents } from "./agents.js";
import { companies } from "./companies.js";

export const channelMessages = pgTable(
  "channel_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => agentChannels.id, { onDelete: "cascade" }),
    authorAgentId: uuid("author_agent_id").references(() => agents.id, { onDelete: "set null" }),
    authorUserId: text("author_user_id"),
    body: text("body").notNull(),
    messageType: text("message_type").notNull().default("message"),
    mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
    linkedIssueId: uuid("linked_issue_id"),
    replyToId: uuid("reply_to_id").references((): AnyPgColumn => channelMessages.id, { onDelete: "set null" }),
    reasoning: text("reasoning"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    channelIdx: index("channel_messages_channel_idx").on(table.channelId, table.createdAt),
    companyIdx: index("channel_messages_company_idx").on(table.companyId),
  }),
);

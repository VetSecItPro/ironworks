import { pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { agentChannels } from "./agent_channels.js";
import { agents } from "./agents.js";

export const channelMemberships = pgTable(
  "channel_memberships",
  {
    channelId: uuid("channel_id")
      .notNull()
      .references(() => agentChannels.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.channelId, table.agentId] }),
  }),
);

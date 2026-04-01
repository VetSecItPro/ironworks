import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

export const webhookEvents = pgTable(
  "webhook_events",
  {
    eventId: text("event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("webhook_events_processed_at_idx").on(table.processedAt)],
);

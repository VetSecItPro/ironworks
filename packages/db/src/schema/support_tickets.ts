import {
  pgTable,
  uuid,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id),
  userId: text("user_id"),
  userEmail: text("user_email").notNull(),
  userName: text("user_name"),
  type: text("type").notNull().default("bug"),
  status: text("status").notNull().default("open"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supportTicketComments = pgTable("support_ticket_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => supportTickets.id, { onDelete: "cascade" }),
  authorType: text("author_type").notNull().default("admin"),
  authorName: text("author_name"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

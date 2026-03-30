import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { issues } from "./issues.js";
import { libraryFiles } from "./library_files.js";

export const libraryFileEvents = pgTable(
  "library_file_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    fileId: uuid("file_id").notNull().references(() => libraryFiles.id, { onDelete: "cascade" }),
    /** Action type: created, modified, renamed, deleted. */
    action: text("action").notNull(),
    /** Agent who performed this action. */
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    /** User who performed this action (if board). */
    userId: text("user_id"),
    /** Issue that prompted this action (nullable). */
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    /** Optional summary of what changed. */
    changeSummary: text("change_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fileIdIdx: index("library_file_events_file_id_idx").on(table.fileId),
    companyCreatedIdx: index("library_file_events_company_created_idx").on(table.companyId, table.createdAt),
    agentIdx: index("library_file_events_agent_idx").on(table.agentId),
  }),
);

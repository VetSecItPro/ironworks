import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { projects } from "./projects.js";

export const libraryFiles = pgTable(
  "library_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    /** Relative path within the library root (unique per company). */
    filePath: text("file_path").notNull(),
    /** Display title (derived from filename or first heading). */
    title: text("title"),
    /** File extension without dot (md, json, ts, etc.). */
    fileType: text("file_type"),
    /** File size in bytes (last known). */
    sizeBytes: integer("size_bytes").notNull().default(0),
    /** Visibility: private (owner only), project (project members), company (everyone). */
    visibility: text("visibility").notNull().default("company"),
    /** Agent who originally created this file. */
    ownerAgentId: uuid("owner_agent_id").references(() => agents.id, { onDelete: "set null" }),
    /** User who originally created this file (if created by board). */
    ownerUserId: text("owner_user_id"),
    /** Project this file belongs to (nullable for shared/agent-private files). */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    /** Last agent to modify this file. */
    lastModifiedByAgentId: uuid("last_modified_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    /** Last user to modify this file. */
    lastModifiedByUserId: text("last_modified_by_user_id"),
    lastModifiedAt: timestamp("last_modified_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyFilePathIdx: uniqueIndex("library_files_company_file_path_idx").on(table.companyId, table.filePath),
    companyVisibilityIdx: index("library_files_company_visibility_idx").on(table.companyId, table.visibility),
    ownerAgentIdx: index("library_files_owner_agent_idx").on(table.ownerAgentId),
    projectIdx: index("library_files_project_idx").on(table.projectId),
    companyModifiedIdx: index("library_files_company_modified_idx").on(table.companyId, table.lastModifiedAt),
  }),
);

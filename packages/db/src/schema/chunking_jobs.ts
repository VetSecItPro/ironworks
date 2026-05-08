import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Durable queue for async chunking of knowledge_pages.
 *
 * Mirrors `embedding_jobs` exactly so the same claim/done/fail worker
 * primitives apply. `target_type` is always `'page'` today (column kept
 * for symmetry + future target kinds, e.g. `'document'`).
 *
 * Status lifecycle:
 *   pending -> claimed -> done | failed
 *                      \-> pending_provider (soft retry; provider unreachable)
 */
export const chunkingJobs = pgTable(
  "chunking_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: text("target_type").notNull(), // always 'page' for now
    targetId: uuid("target_id").notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // pending | claimed | done | failed | pending_provider
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("chunking_jobs_status_idx").on(t.status, t.createdAt),
    targetIdx: uniqueIndex("chunking_jobs_target_uq").on(t.targetType, t.targetId),
  }),
);

export type ChunkingJob = typeof chunkingJobs.$inferSelect;
export type NewChunkingJob = typeof chunkingJobs.$inferInsert;

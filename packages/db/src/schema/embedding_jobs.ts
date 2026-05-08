import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Durable queue for async embedding generation.
 *
 * Targets either an `agent_memory_entries` row (`target_type = 'memory'`)
 * or a `knowledge_chunks` row (`target_type = 'chunk'`). We don't FK
 * `target_id` because the referenced table differs per row; integrity is
 * enforced at the worker layer (a target that vanished is treated as a
 * benign no-op and the job is marked done).
 *
 * Status lifecycle:
 *   pending -> claimed -> done | failed
 *                      \-> pending_provider (soft retry; provider unreachable)
 *
 * The unique index on (target_type, target_id) guarantees at most one
 * in-flight job per target, so re-enqueues are idempotent.
 */
export const embeddingJobs = pgTable(
  "embedding_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: text("target_type").notNull(), // 'memory' | 'chunk'
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
    statusIdx: index("embedding_jobs_status_idx").on(t.status, t.createdAt),
    targetIdx: uniqueIndex("embedding_jobs_target_uq").on(t.targetType, t.targetId),
  }),
);

export type EmbeddingJob = typeof embeddingJobs.$inferSelect;
export type NewEmbeddingJob = typeof embeddingJobs.$inferInsert;

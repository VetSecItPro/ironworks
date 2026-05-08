-- Migration 0097: chunking_jobs queue table.
--
-- Durable queue for async chunking of knowledge_pages. Mirrors embedding_jobs
-- shape exactly so the same worker primitives (claim/done/fail) apply.
--
-- target_type is always 'page' for now -- the column is kept for symmetry with
-- embedding_jobs and to leave room for future target kinds (e.g. 'document')
-- without a schema migration.
--
-- status values: pending | claimed | done | failed | pending_provider.

CREATE TABLE IF NOT EXISTS "chunking_jobs" (
  "id"            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "target_type"   text        NOT NULL,
  "target_id"     uuid        NOT NULL,
  "company_id"    uuid        NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "status"        text        NOT NULL DEFAULT 'pending',
  "attempts"      integer     NOT NULL DEFAULT 0,
  "last_error"    text,
  "claimed_at"    timestamptz,
  "completed_at"  timestamptz,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "chunking_jobs_status_idx"
  ON "chunking_jobs" ("status", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "chunking_jobs_target_uq"
  ON "chunking_jobs" ("target_type", "target_id");

-- Migration 0096: embedding_jobs queue table.
--
-- Durable queue for async embedding generation against memory entries and
-- knowledge chunks. Workers claim rows by atomic UPDATE with status='claimed',
-- run the embedding call, then mark 'done' or 'failed'. 'pending_provider'
-- is a soft-skip state used when the embedding provider is unreachable so
-- the row is retried later without burning attempts.
--
-- target_type: 'memory' | 'chunk'. target_id is the row id in the relevant
-- table; we don't FK because the target tables differ. The unique index on
-- (target_type, target_id) ensures a single in-flight job per target.
--
-- status_idx supports the worker's "pull next pending job" hot path.

CREATE TABLE IF NOT EXISTS "embedding_jobs" (
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

CREATE INDEX IF NOT EXISTS "embedding_jobs_status_idx"
  ON "embedding_jobs" ("status", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "embedding_jobs_target_uq"
  ON "embedding_jobs" ("target_type", "target_id");

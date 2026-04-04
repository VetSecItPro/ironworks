-- pgvector extension and embedding column for agent_memory_entries.
-- Gracefully skips when pgvector is not available (embedded Postgres).

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector extension not available, skipping vector features';
END $$;

-- Nullable embedding column - works without pgvector because the column type
-- is only resolved at query time, not at DDL time on non-pgvector installs.
-- We guard the ALTER with an exception block to be safe.
DO $$ BEGIN
  ALTER TABLE "agent_memory_entries" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add embedding column (pgvector may not be available): %', SQLERRM;
END $$;

-- IVFFlat index for cosine similarity search (only when extension is loaded)
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS "agent_memory_embedding_idx" ON "agent_memory_entries"
    USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create vector index, pgvector may not be available';
END $$;

-- Migration 0083: enable pgvector on knowledge_chunks and agent_memory_entries
--
-- Prerequisite: postgres image swapped from postgres:17-alpine to
-- pgvector/pgvector:pg17. The vector.so library is now present.
--
-- This migration:
-- 1. Ensures the vector extension is installed.
-- 2. Alters knowledge_chunks.embedding from text to vector(768).
--    Existing rows have null or JSON-encoded text embeddings; we
--    drop and recreate the column since reindex-all will repopulate.
-- 3. Restores agent_memory_entries.embedding as vector(1536). The
--    column was dropped by the pgvector reset; we add it back so
--    the existing scaffolded code path keeps compiling.
-- 4. Creates IVFFlat indexes for cosine distance lookup.
--
-- Note: IVFFlat is created with `lists = 100` which is a sane default
-- for ~5k chunks. After bulk loading embeddings, REINDEX may improve
-- recall for higher chunk counts.

CREATE EXTENSION IF NOT EXISTS vector;

-- knowledge_chunks: drop text column, add vector(768) column
ALTER TABLE knowledge_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE knowledge_chunks ADD COLUMN embedding vector(768);

-- agent_memory_entries: restore vector column (was dropped during pgvector reset)
ALTER TABLE agent_memory_entries ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- IVFFlat indexes (cosine distance) for fast top-K lookup
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_ivfflat_idx
  ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS agent_memory_entries_embedding_ivfflat_idx
  ON agent_memory_entries
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

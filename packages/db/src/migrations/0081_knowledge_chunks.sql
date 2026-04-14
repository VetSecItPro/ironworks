-- Migration 0081: knowledge_chunks table for RAG over playbooks.
--
-- Enables agents to query playbook sections by semantic similarity
-- (cosine over pgvector embeddings) or text match (Postgres FTS)
-- instead of loading full playbook bodies on every prompt.
--
-- Requires postgres image with pgvector (pgvector/pgvector:pg17 or
-- equivalent). The vector extension is created in this migration.
--
-- Embedding model: nomic-embed-text (768 dims, Ollama Cloud flat-rate).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "page_id" uuid NOT NULL REFERENCES "knowledge_pages"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,

  -- Source metadata (denormalized from knowledge_pages for fast filtering)
  "department" text,
  "owner_role" text,
  "audience" text,
  "document_type" text,

  -- Chunk content
  "anchor" text NOT NULL,           -- e.g., "#cost-attribution-model"
  "heading" text NOT NULL,          -- e.g., "Cost Attribution Model"
  "heading_path" text NOT NULL,     -- e.g., "CFO Playbook > Cost Attribution Model"
  "body" text NOT NULL,
  "token_count" integer NOT NULL,
  "order_num" integer NOT NULL,     -- position within source doc

  -- Embedding (768d, nomic-embed-text via Ollama Cloud)
  "embedding" vector(768),

  -- Lifecycle
  "source_revision" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "knowledge_chunks_page_idx"
  ON "knowledge_chunks" ("page_id");

CREATE INDEX IF NOT EXISTS "knowledge_chunks_company_dept_idx"
  ON "knowledge_chunks" ("company_id", "department");

CREATE INDEX IF NOT EXISTS "knowledge_chunks_company_doc_type_idx"
  ON "knowledge_chunks" ("company_id", "document_type");

-- Full-text search index on heading_path + body for FTS fallback
-- (used when embedding pipeline is unavailable)
CREATE INDEX IF NOT EXISTS "knowledge_chunks_fts_idx"
  ON "knowledge_chunks"
  USING gin (to_tsvector('english', heading_path || ' ' || body));

-- IVFFlat cosine-distance index for fast top-K vector lookup.
-- lists = 100 is a sane default for ~5k chunks; rebuild if the table grows >50k.
CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_ivfflat_idx"
  ON "knowledge_chunks"
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

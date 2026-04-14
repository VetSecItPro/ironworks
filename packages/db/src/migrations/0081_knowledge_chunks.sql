-- Migration 0081: knowledge_chunks table for RAG over playbooks.
--
-- Enables agents to query playbook sections by semantic similarity or
-- text match instead of loading full playbook bodies on every prompt.
--
-- === PGVECTOR STATUS ===
-- The production postgres image (postgres:17-alpine) does NOT ship with
-- pgvector. The `$libdir/vector` shared library is missing, so vector(N)
-- columns cannot be queried even though pg_extension may have stale
-- records. Until the postgres image is upgraded to pgvector/pgvector:pg17
-- (tracked as a separate maintenance-window task), we store the embedding
-- as text and use ILIKE text-match fallback in playbook-rag.ts.
--
-- After the postgres image is upgraded:
--  1. Run migration 0082_knowledge_chunks_vector.sql which alters
--     embedding to vector(768) and rebuilds the IVFFlat index.
--  2. Trigger `POST /companies/:id/knowledge/reindex-all` to backfill
--     embeddings via Ollama's nomic-embed-text model.
--
-- Embedding model target: nomic-embed-text (768 dims, Ollama Cloud flat-rate).

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

  -- Embedding stored as text (JSON array) until pgvector is available.
  -- Migration 0082 will ALTER this column to vector(768) after the
  -- postgres image upgrade.
  "embedding" text,

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

-- Full-text search index on heading_path + body for text-mode lookup
-- (until embeddings are available)
CREATE INDEX IF NOT EXISTS "knowledge_chunks_fts_idx"
  ON "knowledge_chunks"
  USING gin (to_tsvector('english', heading_path || ' ' || body));

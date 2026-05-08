-- Migration 0098: knowledge_page_links table.
--
-- Wikilink graph for knowledge pages. Each row represents a single [[...]]
-- reference from one page (`from_id`) to either a resolved target page
-- (`to_id`) or, when the target slug doesn't match an existing page yet,
-- to an unresolved slug (`unresolved_slug`). Exactly one of those two
-- columns is set per row -- enforced by the XOR CHECK constraint below.
-- Optional `anchor` captures the `#section` portion of a wikilink.
--
-- Cascading deletes from `knowledge_pages` keep the link graph in sync
-- with page lifecycle: removing a page drops both inbound and outbound
-- edges. `company_id` mirrors the page tenancy and cascades from
-- `companies` so tenant teardown is clean.
--
-- Indexes:
--   from_idx / to_idx          -- forward + backlink traversal hot paths
--   unresolved_idx             -- "find pending links for slug X" within tenant
--   uniq_resolved              -- dedupe identical resolved edges (incl. anchor)
--   uniq_unresolved            -- dedupe identical unresolved edges (incl. anchor)

CREATE TABLE IF NOT EXISTS "knowledge_page_links" (
  "id"               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "from_id"          uuid        NOT NULL REFERENCES "knowledge_pages"("id") ON DELETE CASCADE,
  "to_id"            uuid        REFERENCES "knowledge_pages"("id") ON DELETE CASCADE,
  "unresolved_slug"  text,
  "anchor"           text,
  "company_id"       uuid        NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "knowledge_page_links_target_xor"
    CHECK (("to_id" IS NOT NULL) <> ("unresolved_slug" IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS "knowledge_page_links_from_idx"
  ON "knowledge_page_links" ("from_id");

CREATE INDEX IF NOT EXISTS "knowledge_page_links_to_idx"
  ON "knowledge_page_links" ("to_id");

CREATE INDEX IF NOT EXISTS "knowledge_page_links_unresolved_idx"
  ON "knowledge_page_links" ("company_id", "unresolved_slug");

CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_page_links_uniq_resolved"
  ON "knowledge_page_links" ("from_id", "to_id", "anchor");

CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_page_links_uniq_unresolved"
  ON "knowledge_page_links" ("from_id", "unresolved_slug", "anchor");

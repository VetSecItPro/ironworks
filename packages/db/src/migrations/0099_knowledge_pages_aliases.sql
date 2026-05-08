-- Migration 0099: knowledge_pages.aliases column.
--
-- Author-controlled YAML frontmatter aliases (KnowledgeFrontmatter.aliases)
-- need fast lookup during wikilink resolution. Re-parsing every page's
-- frontmatter on each link resolution would be O(N) per save; instead we
-- denormalize aliases into a text[] column so the resolver can match via:
--   slug = ANY($slugs) OR aliases && $slugs
--
-- The knowledge.create/update write paths (T5) parse the YAML frontmatter
-- of the body and persist into this column. Default empty array so existing
-- pages migrate cleanly without a backfill step (no aliases until next save).
--
-- A GIN index supports the array-overlap operator (`&&`) used by the
-- resolver. Slug matches use the existing knowledge_pages_company_slug_uq.

ALTER TABLE "knowledge_pages"
  ADD COLUMN IF NOT EXISTS "aliases" text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS "knowledge_pages_aliases_gin_idx"
  ON "knowledge_pages" USING gin ("aliases");

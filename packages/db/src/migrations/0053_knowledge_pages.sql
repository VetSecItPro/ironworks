CREATE TABLE IF NOT EXISTS "knowledge_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "visibility" text NOT NULL DEFAULT 'company',
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "revision_number" integer NOT NULL DEFAULT 1,
  "is_seeded" text,
  "created_by_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "created_by_user_id" text,
  "updated_by_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "updated_by_user_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_pages_company_slug_uq" ON "knowledge_pages" ("company_id", "slug");
CREATE INDEX IF NOT EXISTS "knowledge_pages_company_updated_idx" ON "knowledge_pages" ("company_id", "updated_at");
CREATE INDEX IF NOT EXISTS "knowledge_pages_company_visibility_idx" ON "knowledge_pages" ("company_id", "visibility");

CREATE TABLE IF NOT EXISTS "knowledge_page_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "page_id" uuid NOT NULL REFERENCES "knowledge_pages"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "revision_number" integer NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "change_summary" text,
  "edited_by_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "edited_by_user_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "knowledge_page_revisions_page_idx" ON "knowledge_page_revisions" ("page_id", "revision_number");

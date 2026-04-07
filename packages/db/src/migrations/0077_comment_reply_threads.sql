-- Add threaded reply support to issue comments
ALTER TABLE "issue_comments" ADD COLUMN IF NOT EXISTS "reply_to_id" uuid REFERENCES "issue_comments"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "issue_comments_reply_to_idx" ON "issue_comments" ("reply_to_id");

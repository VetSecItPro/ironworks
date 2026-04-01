ALTER TABLE "company_subscriptions" ADD COLUMN IF NOT EXISTS "llm_auth_method" text DEFAULT 'none';

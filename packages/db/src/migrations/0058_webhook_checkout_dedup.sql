-- SEC-ADV-004: Webhook event deduplication table (persistent, survives restarts)
CREATE TABLE IF NOT EXISTS "webhook_events" (
  "event_id" text PRIMARY KEY,
  "event_type" text NOT NULL,
  "processed_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Index for cleanup of old events
CREATE INDEX IF NOT EXISTS "webhook_events_processed_at_idx" ON "webhook_events" ("processed_at");
--> statement-breakpoint
-- SEC-ADV-009: Add polar_checkout_id column to company_subscriptions for checkout dedup
ALTER TABLE "company_subscriptions" ADD COLUMN IF NOT EXISTS "polar_checkout_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_subscriptions_checkout_id_unique" ON "company_subscriptions" ("polar_checkout_id") WHERE "polar_checkout_id" IS NOT NULL;

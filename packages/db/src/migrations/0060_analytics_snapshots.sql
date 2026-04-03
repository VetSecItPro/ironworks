CREATE TABLE IF NOT EXISTS "analytics_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "snapshot_date" date NOT NULL,
  "total_companies" integer NOT NULL DEFAULT 0,
  "total_users" integer NOT NULL DEFAULT 0,
  "total_agents" integer NOT NULL DEFAULT 0,
  "mrr_cents" integer NOT NULL DEFAULT 0,
  "new_signups" integer NOT NULL DEFAULT 0,
  "churn_count" integer NOT NULL DEFAULT 0,
  "total_issues" integer NOT NULL DEFAULT 0,
  "total_runs" integer NOT NULL DEFAULT 0,
  "success_rate" real NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "analytics_snapshots_date_unique" ON "analytics_snapshots" ("snapshot_date");

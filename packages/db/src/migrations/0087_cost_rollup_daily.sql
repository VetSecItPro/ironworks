-- Migration 0087: cost_rollup_daily table.
--
-- Pre-aggregated daily cost summaries sourced from cost_events.
-- A nightly cron job populates this table so time-series and leaderboard
-- queries read from a small, indexed rollup rather than scanning the full
-- cost_events table.
--
-- Design notes:
-- - Grain: one row per (day, company_id, agent_id, provider, source).
--   agent_id is nullable so playground or system calls (no agent) can be
--   represented if a future ingestion path adds them.
-- - source: 'agent' | 'playground' | 'unknown'
-- - cost_usd_micro: cost stored as micro-USD (1e-6 USD per unit) for integer
--   arithmetic precision across SUMs. Divide by 1_000_000 in app code for USD.
--   Conversion from cost_events: cost_cents * 10_000 = cost_usd_micro
--   (1 cent = 10_000 micro-USD, or 1/100 USD = 10_000 * 1/1_000_000 USD).
-- - Watermark: tracked in instance_settings.general.costRollupWatermark so
--   re-runs are idempotent — DELETE + re-INSERT for the target day only.
--
-- Authorization is app-layer only (assertBoard + assertCompanyAccess). No RLS —
-- consistent with every other production table in this codebase.

CREATE TABLE cost_rollup_daily (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  day            date        NOT NULL,
  company_id     uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id       uuid        REFERENCES agents(id) ON DELETE SET NULL,
  provider       text        NOT NULL,
  source         text        NOT NULL DEFAULT 'agent',
  call_count     integer     NOT NULL DEFAULT 0,
  input_tokens   bigint      NOT NULL DEFAULT 0,
  output_tokens  bigint      NOT NULL DEFAULT 0,
  cost_usd_micro bigint      NOT NULL DEFAULT 0,
  rolled_up_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crd_company_day      ON cost_rollup_daily(company_id, day);
CREATE INDEX idx_crd_company_agent    ON cost_rollup_daily(company_id, agent_id, day);
CREATE INDEX idx_crd_company_provider ON cost_rollup_daily(company_id, provider, day);
CREATE INDEX idx_crd_company_source   ON cost_rollup_daily(company_id, source, day);

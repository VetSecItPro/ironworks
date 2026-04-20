-- G.25 adapter-call audit log
-- One row per completed (success or error) adapter invocation.
-- Ring-buffer retention enforced at the application layer.

CREATE TABLE IF NOT EXISTS "adapter_calls" (
  "id"                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"               UUID NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "agent_id"                 UUID REFERENCES "agents"("id") ON DELETE SET NULL,
  "adapter_type"             TEXT NOT NULL,
  "model"                    TEXT NOT NULL,
  "status"                   TEXT NOT NULL,
  "latency_ms"               INTEGER,
  "input_tokens"             INTEGER,
  "output_tokens"            INTEGER,
  "cost_usd_cents"           INTEGER,
  "source"                   TEXT NOT NULL DEFAULT 'agent',
  "replay_of"                UUID,
  "error_code"               TEXT,
  "prompt_preview"           TEXT,
  "response_preview"         TEXT,
  "prompt_payload"           JSONB,
  "response_payload"         JSONB,
  "adapter_config_snapshot"  JSONB,
  "request_id"               TEXT,
  "occurred_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary list query: company + time desc
CREATE INDEX IF NOT EXISTS "idx_ac_company_occurred"
  ON "adapter_calls" ("company_id", "occurred_at");

-- Filter by agent
CREATE INDEX IF NOT EXISTS "idx_ac_company_agent"
  ON "adapter_calls" ("company_id", "agent_id");

-- Filter by adapter type
CREATE INDEX IF NOT EXISTS "idx_ac_company_adapter_type"
  ON "adapter_calls" ("company_id", "adapter_type");

-- Filter by source (agent / playground / replay)
CREATE INDEX IF NOT EXISTS "idx_ac_company_source"
  ON "adapter_calls" ("company_id", "source");

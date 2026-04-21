-- G.25 adapter-call audit log (O.4 Request/Response Explorer).
-- One row per completed (success or error) HTTP adapter invocation.
--
-- Migration number: 0086
--   0085 = workspace_provider_secrets (O.1 Playground PR)
--   0086 = adapter_calls (this migration — O.4 Explorer)
--   Reserve 0087 for O.2 cost_rollup_daily if needed.
--
-- Design decisions:
--   promptPayload / responsePayload store full JSONB for replay and diff.
--   Both nullable so list queries skip the large columns.
--   promptPreview / responsePreview are 120-char truncated text for list UIs.
--   adapterConfigSnapshot stores provider config at invocation time with
--   secret key values stripped before write (see adapter-call-writer.ts).
--   replayOf creates lineage: each replay row points at the original call id.
--   Retention is enforced at the application layer (ring-buffer), not via TTL,
--   to keep the migration simple and avoid per-row DELETE overhead.

CREATE TABLE IF NOT EXISTS "adapter_calls" (
  "id"                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"               UUID NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "agent_id"                 UUID REFERENCES "agents"("id") ON DELETE SET NULL,
  "adapter_type"             TEXT NOT NULL,
  "model"                    TEXT NOT NULL,
  "status"                   TEXT NOT NULL,          -- 'success' | 'error'
  "latency_ms"               INTEGER,
  "input_tokens"             INTEGER,
  "output_tokens"            INTEGER,
  "cost_usd_cents"           INTEGER,                -- integer cents avoids float drift
  "source"                   TEXT NOT NULL DEFAULT 'agent', -- 'agent' | 'playground' | 'replay'
  "replay_of"                UUID,                   -- non-null only for replay rows
  "error_code"               TEXT,
  "prompt_preview"           TEXT,                   -- truncated to 120 chars for list UIs
  "response_preview"         TEXT,
  "prompt_payload"           JSONB,                  -- full payload, only loaded on detail view
  "response_payload"         JSONB,
  "adapter_config_snapshot"  JSONB,                  -- provider config snapshot; secrets stripped
  "request_id"               TEXT,
  "occurred_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary list query: company ordered by time desc (cursor pagination anchor)
CREATE INDEX IF NOT EXISTS "idx_ac_company_occurred"
  ON "adapter_calls" ("company_id", "occurred_at" DESC, "id" DESC);

-- Filter by agent within a company
CREATE INDEX IF NOT EXISTS "idx_ac_company_agent"
  ON "adapter_calls" ("company_id", "agent_id");

-- Filter by adapter type (e.g. anthropic_api, openai_api)
CREATE INDEX IF NOT EXISTS "idx_ac_company_adapter_type"
  ON "adapter_calls" ("company_id", "adapter_type");

-- Filter by source (agent / playground / replay)
CREATE INDEX IF NOT EXISTS "idx_ac_company_source"
  ON "adapter_calls" ("company_id", "source");

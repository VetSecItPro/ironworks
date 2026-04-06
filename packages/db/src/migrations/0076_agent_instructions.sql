-- Provider-agnostic agent instructions (stored in DB, not filesystem)
-- system_prompt = SOUL.md content (identity, personality, principles)
-- agent_instructions = AGENTS.md content (responsibilities, channel rules, heartbeat process)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS system_prompt TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS agent_instructions TEXT;

-- Migrate existing promptTemplate data from adapter_config JSONB
UPDATE agents SET system_prompt = adapter_config->>'promptTemplate'
WHERE adapter_config->>'promptTemplate' IS NOT NULL AND system_prompt IS NULL;

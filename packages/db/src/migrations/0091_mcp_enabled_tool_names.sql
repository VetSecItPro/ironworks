-- Migration 0091: per-tool allowlist on mcp_servers.
--
-- Empty array (default) means all advertised tools from the server are visible
-- to enabled agents. Non-empty filters tools by name segment (the part after
-- `mcp__<server>__`). Backwards-compatible: existing rows default to [].
--
-- Filtering happens at heartbeat-context render time (see
-- server/src/services/heartbeat-context.ts:injectMcpTools). Tool-call validation
-- at invocation time is still pending the sidecar proxy noted as
-- MCP_INTEGRATION_TODO; until that lands, the allowlist is the only chokepoint
-- and works by hiding tools from the LLM's awareness rather than refusing them
-- at dispatch.

ALTER TABLE mcp_servers
  ADD COLUMN IF NOT EXISTS enabled_tool_names text[] NOT NULL DEFAULT '{}';

-- Migration 0088: mcp_servers table.
--
-- Stores external MCP (Model Context Protocol) server configurations per company.
-- Agents consume these servers as tool providers; each company has an isolated view.
--
-- Design notes:
-- - transport: 'stdio' spawns a local subprocess; 'http' calls a remote endpoint.
-- - command: only relevant for stdio transport (e.g. "npx @modelcontextprotocol/server-filesystem /workspace").
-- - url: only relevant for http transport.
-- - api_key_secret_name: references a row in company_secrets by name; the MCP service
--   resolves the actual secret value at call time and passes it as an Authorization header.
-- - enabled_for_agent_ids: empty array means all agents in the company may use this server;
--   a non-empty array restricts access to listed agent IDs.
-- - Authorization is app-layer only (assertBoard + assertCompanyAccess). No RLS —
--   consistent with every other production table in this codebase.

CREATE TABLE mcp_servers (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                  text        NOT NULL,
  description           text,
  transport             text        NOT NULL CHECK (transport IN ('stdio', 'http')),
  command               text,
  url                   text,
  api_key_secret_name   text,
  enabled_for_agent_ids text[]      NOT NULL DEFAULT '{}',
  status                text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mcp_servers_company_status_idx ON mcp_servers(company_id, status);

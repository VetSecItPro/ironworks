import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Registry of external MCP (Model Context Protocol) servers that agents can call as tools.
 * Each row is company-scoped — a server configured for company A is never visible to company B.
 * Enabled-agent filtering uses an app-layer check in the MCP service; an empty array means
 * all agents in the company may use the server.
 */
export const mcpServers = pgTable(
  "mcp_servers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // Transport type: 'stdio' spawns a subprocess; 'http' calls a remote endpoint.
    transport: text("transport").notNull().$type<"stdio" | "http">(),
    // stdio-only: the shell command to spawn (e.g. "npx @modelcontextprotocol/server-filesystem /workspace")
    command: text("command"),
    // http-only: the base URL of the remote MCP server
    url: text("url"),
    // References a company_secrets row by name; used to pass Authorization header for http transport
    apiKeySecretName: text("api_key_secret_name"),
    // Comma-separated agent UUIDs that may use this server. Empty string = all agents allowed.
    // Stored as text array in SQL; accessed via JSON in app layer for portability.
    enabledForAgentIds: text("enabled_for_agent_ids").array().notNull().default([]),
    // Tool-name allowlist filter. Empty array = all tools advertised by the server are allowed
    // (backwards-compatible default). When non-empty, only listed names pass through to agent
    // context. Server tool names follow the `mcp__<server>__<tool>` convention; entries here
    // store just the tool segment (e.g. "search_files"), not the prefixed form.
    enabledToolNames: text("enabled_tool_names").array().notNull().default([]),
    status: text("status").notNull().$type<"active" | "paused">().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("mcp_servers_company_status_idx").on(table.companyId, table.status),
  }),
);

export type McpServer = typeof mcpServers.$inferSelect;
export type NewMcpServer = typeof mcpServers.$inferInsert;

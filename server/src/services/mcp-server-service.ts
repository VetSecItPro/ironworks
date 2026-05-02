import type { Db } from "@ironworksai/db";
import { mcpServers } from "@ironworksai/db";
import type { McpTool } from "@ironworksai/mcp-client";
import { closeConnection, listTools } from "@ironworksai/mcp-client";
import { and, eq } from "drizzle-orm";
import { conflict, notFound, unprocessable } from "../errors.js";
import { secretService } from "./secrets.js";

/** How long (ms) to cache the tool list for a given server before re-querying. */
const TOOL_CACHE_TTL_MS = 60 * 60 * 1_000; // 1 hour

interface ToolCacheEntry {
  tools: McpTool[];
  fetchedAt: number;
}

// In-process cache keyed by mcp_servers.id.
// Cleared by closeConnection() when a server is deleted or updated.
const toolCache = new Map<string, ToolCacheEntry>();

function isCacheValid(entry: ToolCacheEntry): boolean {
  return Date.now() - entry.fetchedAt < TOOL_CACHE_TTL_MS;
}

export type CreateMcpServerInput = {
  name: string;
  description?: string | null;
  transport: "stdio" | "http";
  command?: string | null;
  url?: string | null;
  apiKeySecretName?: string | null;
  enabledForAgentIds?: string[];
  /**
   * Tool-name allowlist. Empty array = all advertised tools pass through
   * (back-compat). Names match the segment after `mcp__<server>__`, e.g.
   * `["read_file", "list_directory"]` not `["mcp__Filesystem__read_file"]`.
   */
  enabledToolNames?: string[];
  status?: "active" | "paused";
};

export type UpdateMcpServerInput = Partial<CreateMcpServerInput>;

export function mcpServerService(db: Db) {
  const secrets = secretService(db);

  /**
   * Resolve the plaintext API key for a server by looking up the named secret
   * in company_secrets. Returns null if no secret name is configured.
   */
  async function resolveApiKey(companyId: string, apiKeySecretName: string | null | undefined): Promise<string | null> {
    if (!apiKeySecretName) return null;
    const secret = await secrets.getByName(companyId, apiKeySecretName);
    if (!secret) {
      throw notFound(`Secret "${apiKeySecretName}" not found in company`);
    }
    return secrets.resolveSecretValue(companyId, secret.id, "latest");
  }

  return {
    list: async (companyId: string) => {
      return db.select().from(mcpServers).where(eq(mcpServers.companyId, companyId));
    },

    getById: async (id: string) => {
      return db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.id, id))
        .then((rows) => rows[0] ?? null);
    },

    create: async (companyId: string, input: CreateMcpServerInput) => {
      if (input.transport === "stdio" && !input.command) {
        throw unprocessable("command is required for stdio transport");
      }
      if (input.transport === "http" && !input.url) {
        throw unprocessable("url is required for http transport");
      }

      // Guard against duplicate names within a company.
      const existing = await db
        .select({ id: mcpServers.id })
        .from(mcpServers)
        .where(and(eq(mcpServers.companyId, companyId), eq(mcpServers.name, input.name)))
        .then((rows) => rows[0] ?? null);
      if (existing) {
        throw conflict(`MCP server named "${input.name}" already exists in this company`);
      }

      const [row] = await db
        .insert(mcpServers)
        .values({
          companyId,
          name: input.name,
          description: input.description,
          transport: input.transport,
          command: input.command,
          url: input.url,
          apiKeySecretName: input.apiKeySecretName,
          enabledForAgentIds: input.enabledForAgentIds ?? [],
          enabledToolNames: input.enabledToolNames ?? [],
          status: input.status ?? "active",
        })
        .returning();
      return row;
    },

    update: async (id: string, companyId: string, input: UpdateMcpServerInput) => {
      const existing = await db
        .select()
        .from(mcpServers)
        .where(and(eq(mcpServers.id, id), eq(mcpServers.companyId, companyId)))
        .then((rows) => rows[0] ?? null);
      if (!existing) throw notFound("MCP server not found");

      // Evict tool cache and connection pool so they reflect the new config on next use.
      toolCache.delete(id);
      await closeConnection(id);

      const [row] = await db
        .update(mcpServers)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(mcpServers.id, id))
        .returning();
      return row;
    },

    remove: async (id: string, companyId: string) => {
      const existing = await db
        .select({ id: mcpServers.id })
        .from(mcpServers)
        .where(and(eq(mcpServers.id, id), eq(mcpServers.companyId, companyId)))
        .then((rows) => rows[0] ?? null);
      if (!existing) throw notFound("MCP server not found");

      toolCache.delete(id);
      await closeConnection(id);
      await db.delete(mcpServers).where(eq(mcpServers.id, id));
    },

    /**
     * Return the tool list for a server, using a 1-hour in-process cache.
     * Bypasses cache when forceRefresh is true (used by the /test endpoint).
     */
    discoverTools: async (
      server: {
        id: string;
        companyId: string;
        name: string;
        transport: "stdio" | "http";
        command: string | null | undefined;
        url: string | null | undefined;
        apiKeySecretName: string | null | undefined;
      },
      forceRefresh = false,
    ): Promise<McpTool[]> => {
      const cached = toolCache.get(server.id);
      if (!forceRefresh && cached && isCacheValid(cached)) {
        return cached.tools;
      }

      const apiKey = await resolveApiKey(server.companyId, server.apiKeySecretName);
      const tools = await listTools({
        id: server.id,
        name: server.name,
        transport: server.transport,
        command: server.command,
        url: server.url,
        apiKey,
      });

      toolCache.set(server.id, { tools, fetchedAt: Date.now() });
      return tools;
    },

    /**
     * Fetch all active MCP servers for a company that a given agent is allowed to use.
     * Empty enabledForAgentIds means the server is open to all agents in the company.
     */
    listEnabledForAgent: async (companyId: string, agentId: string) => {
      const all = await db
        .select()
        .from(mcpServers)
        .where(and(eq(mcpServers.companyId, companyId), eq(mcpServers.status, "active")));

      return all.filter((s) => s.enabledForAgentIds.length === 0 || s.enabledForAgentIds.includes(agentId));
    },
  };
}

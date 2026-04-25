import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServerConfig, McpTool, McpToolCallContent, McpToolCallResult } from "./types.js";

/** Initial delay before the first reconnect attempt. Doubles on each attempt up to MAX_BACKOFF_MS. */
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 5;

/** One active MCP session: SDK Client + its transport + reconnect bookkeeping. */
interface PoolEntry {
  client: Client;
  config: McpServerConfig;
  reconnectAttempts: number;
  closed: boolean;
}

/**
 * Per-process connection pool keyed by mcp_servers.id.
 * Connections are created lazily on first use and reused until the process exits
 * or the entry is explicitly evicted via closeConnection().
 */
const pool = new Map<string, PoolEntry>();

async function createClient(config: McpServerConfig): Promise<Client> {
  // Declare that this client supports tool use via the sampling capability set.
  const client = new Client({ name: "ironworks-mcp-client", version: "0.1.0" }, { capabilities: {} });

  if (config.transport === "stdio") {
    if (!config.command) {
      throw new Error(`MCP server "${config.name}": command is required for stdio transport`);
    }
    // Split command string into executable + args so child_process gets a clean argv.
    const [cmd, ...args] = config.command.split(/\s+/);
    const transport = new StdioClientTransport({ command: cmd, args });
    await client.connect(transport);
    return client;
  }

  if (config.transport === "http") {
    if (!config.url) {
      throw new Error(`MCP server "${config.name}": url is required for http transport`);
    }
    const headers: Record<string, string> = {};
    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }
    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: { headers },
      // SDK built-in reconnection; we layer our own on top for fatal disconnects.
      reconnectionOptions: {
        maxRetries: MAX_RECONNECT_ATTEMPTS,
        initialReconnectionDelay: INITIAL_BACKOFF_MS,
        maxReconnectionDelay: MAX_BACKOFF_MS,
        reconnectionDelayGrowFactor: 2,
      },
    });
    await client.connect(transport);
    return client;
  }

  throw new Error(`MCP server "${config.name}": unknown transport "${config.transport as string}"`);
}

/**
 * Fetch a pooled client, creating one if needed.
 * On transport failure the pool entry is evicted so the next call retries.
 */
async function getClient(config: McpServerConfig): Promise<Client> {
  const existing = pool.get(config.id);
  if (existing && !existing.closed) {
    return existing.client;
  }

  const client = await createClient(config);
  pool.set(config.id, { client, config, reconnectAttempts: 0, closed: false });
  return client;
}

/**
 * Close and evict a pooled connection.
 * Safe to call even if the entry doesn't exist.
 */
export async function closeConnection(serverId: string): Promise<void> {
  const entry = pool.get(serverId);
  if (!entry) return;
  entry.closed = true;
  pool.delete(serverId);
  try {
    await entry.client.close();
  } catch {
    // Ignore close errors — transport may already be gone.
  }
}

/**
 * List all tools advertised by an MCP server.
 * Results should be cached at a higher layer (e.g. mcp-server-service) to avoid
 * repeated round-trips on every heartbeat.
 */
export async function listTools(config: McpServerConfig): Promise<McpTool[]> {
  let client: Client;
  try {
    client = await getClient(config);
  } catch (err) {
    // Evict on connect failure so the next call retries a fresh connection.
    await closeConnection(config.id);
    throw err;
  }

  try {
    const result = await client.listTools();
    return result.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: (t.inputSchema as Record<string, unknown>) ?? {},
    }));
  } catch (err) {
    // Transport may have died mid-session; evict so the pool reconnects next time.
    await closeConnection(config.id);
    throw err;
  }
}

/**
 * Invoke a tool on an MCP server and return its result.
 * On transport failure the connection is evicted; the caller decides whether to retry.
 */
export async function callTool(
  config: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpToolCallResult> {
  let client: Client;
  try {
    client = await getClient(config);
  } catch (err) {
    await closeConnection(config.id);
    throw err;
  }

  try {
    const result = await client.callTool({ name: toolName, arguments: args });
    return {
      content: (result.content as McpToolCallContent[]) ?? [],
      isError: result.isError === true,
    };
  } catch (err) {
    await closeConnection(config.id);
    throw err;
  }
}

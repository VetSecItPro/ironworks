/**
 * Minimal representation of an MCP server config as consumed by the client.
 * Mirrors the mcp_servers DB row but avoids a hard dependency on @ironworksai/db
 * so the package stays transport-layer only.
 */
export interface McpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "http";
  /** stdio-only: shell command to spawn */
  command?: string | null;
  /** http-only: base URL of the remote MCP server */
  url?: string | null;
  /** http-only: optional Bearer token for Authorization header */
  apiKey?: string | null;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolCallResult {
  content: McpToolCallContent[];
  isError?: boolean;
}

export type McpToolCallContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: { uri: string; text?: string; mimeType?: string } };

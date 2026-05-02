import { api } from "./client";

export interface McpServer {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  transport: "stdio" | "http";
  command: string | null;
  url: string | null;
  apiKeySecretName: string | null;
  enabledForAgentIds: string[];
  /**
   * Tool-name allowlist. Empty = all tools advertised by the server pass through
   * (back-compat). Non-empty = only listed names survive into agent context.
   */
  enabledToolNames: string[];
  status: "active" | "paused";
  createdAt: string;
  updatedAt: string;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface CreateMcpServerPayload {
  name: string;
  description?: string | null;
  transport: "stdio" | "http";
  command?: string | null;
  url?: string | null;
  apiKeySecretName?: string | null;
  enabledForAgentIds?: string[];
  enabledToolNames?: string[];
  status?: "active" | "paused";
}

export interface UpdateMcpServerPayload extends Partial<CreateMcpServerPayload> {}

export const mcpServersApi = {
  list: (companyId: string) => api.get<McpServer[]>(`/companies/${companyId}/mcp-servers`),

  create: (companyId: string, data: CreateMcpServerPayload) =>
    api.post<McpServer>(`/companies/${companyId}/mcp-servers`, data),

  update: (id: string, data: UpdateMcpServerPayload) => api.patch<McpServer>(`/mcp-servers/${id}`, data),

  remove: (id: string) => api.delete<{ ok: true }>(`/mcp-servers/${id}`),

  test: (id: string) => api.post<{ tools: McpTool[] }>(`/mcp-servers/${id}/test`, {}),
};

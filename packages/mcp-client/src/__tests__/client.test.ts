import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServerConfig } from "../types.js";

// ── SDK mocks ────────────────────────────────────────────────────────────────
// vitest requires constructor mocks to be real functions (not arrow fns).

// biome-ignore lint/suspicious/noExplicitAny: mock constructors must be real functions, not arrow fns
const MockStdioTransportCtor = vi.hoisted(() => vi.fn().mockImplementation(function (this: any) {}));

// biome-ignore lint/suspicious/noExplicitAny: mock constructors must be real functions, not arrow fns
const MockHttpTransportCtor = vi.hoisted(() => vi.fn().mockImplementation(function (this: any) {}));

const MockClientCtor = vi.hoisted(() => {
  const instance = {
    connect: vi.fn(),
    close: vi.fn(),
    listTools: vi.fn(),
    callTool: vi.fn(),
  };
  // biome-ignore lint/suspicious/noExplicitAny: mock constructors must be real functions, not arrow fns
  const ctor = vi.fn().mockImplementation(function (this: any) {
    return instance;
  });
  // Expose the instance so tests can set return values on it.
  (ctor as unknown as Record<string, unknown>)._instance = instance;
  return ctor;
});

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({ Client: MockClientCtor }));
vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: MockStdioTransportCtor,
}));
vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: MockHttpTransportCtor,
}));

// ── Typed accessors ──────────────────────────────────────────────────────────

type MockInstance = {
  connect: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  listTools: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
};

function getClientInstance(): MockInstance {
  return (MockClientCtor as unknown as { _instance: MockInstance })._instance;
}

// ── Config fixtures ──────────────────────────────────────────────────────────

const stdioConfig: McpServerConfig = {
  id: "server-stdio-1",
  name: "Filesystem",
  transport: "stdio",
  command: "npx @modelcontextprotocol/server-filesystem /workspace",
};

const httpConfig: McpServerConfig = {
  id: "server-http-1",
  name: "WebSearch",
  transport: "http",
  url: "https://mcp.example.com",
  apiKey: "secret-key-123",
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("listTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClientInstance().connect.mockResolvedValue(undefined);
    getClientInstance().close.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // Evict pool entries and reset the module graph so each test starts fresh.
    const mod = await import("../client.js");
    await mod.closeConnection(stdioConfig.id).catch(() => {});
    await mod.closeConnection(httpConfig.id).catch(() => {});
    vi.resetModules();
  });

  it("spawns stdio transport with split command args", async () => {
    getClientInstance().listTools.mockResolvedValue({ tools: [{ name: "read_file", inputSchema: {} }] });
    const { listTools } = await import("../client.js");

    const tools = await listTools(stdioConfig);

    expect(MockStdioTransportCtor).toHaveBeenCalledWith({
      command: "npx",
      args: ["@modelcontextprotocol/server-filesystem", "/workspace"],
    });
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("read_file");
  });

  it("connects to http transport with Authorization header when apiKey provided", async () => {
    getClientInstance().listTools.mockResolvedValue({
      tools: [{ name: "web_search", inputSchema: { type: "object" } }],
    });
    const { listTools } = await import("../client.js");

    const tools = await listTools(httpConfig);

    expect(MockHttpTransportCtor).toHaveBeenCalledWith(
      new URL("https://mcp.example.com"),
      expect.objectContaining({
        requestInit: { headers: { Authorization: "Bearer secret-key-123" } },
      }),
    );
    expect(tools[0].name).toBe("web_search");
  });

  it("does not set Authorization header when apiKey is absent", async () => {
    getClientInstance().listTools.mockResolvedValue({ tools: [] });
    const { listTools, closeConnection } = await import("../client.js");
    const noKeyConfig: McpServerConfig = { ...httpConfig, id: "server-http-nokey", apiKey: null };

    await listTools(noKeyConfig);

    expect(MockHttpTransportCtor).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ requestInit: { headers: {} } }),
    );
    await closeConnection(noKeyConfig.id).catch(() => {});
  });

  it("evicts pool entry and re-throws on connect failure", async () => {
    getClientInstance().connect.mockRejectedValueOnce(new Error("ENOENT"));
    const { listTools, closeConnection } = await import("../client.js");

    await expect(listTools(stdioConfig)).rejects.toThrow("ENOENT");

    // After eviction a second call must attempt a fresh connect.
    getClientInstance().connect.mockResolvedValue(undefined);
    getClientInstance().listTools.mockResolvedValue({ tools: [] });
    await expect(listTools(stdioConfig)).resolves.toEqual([]);
    await closeConnection(stdioConfig.id).catch(() => {});
  });

  it("throws if stdio command is missing", async () => {
    const { listTools, closeConnection } = await import("../client.js");
    const broken: McpServerConfig = { ...stdioConfig, id: "server-nocommand", command: null };

    await expect(listTools(broken)).rejects.toThrow("command is required");
    await closeConnection(broken.id).catch(() => {});
  });
});

describe("callTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClientInstance().connect.mockResolvedValue(undefined);
    getClientInstance().close.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    const mod = await import("../client.js");
    await mod.closeConnection(stdioConfig.id).catch(() => {});
    vi.resetModules();
  });

  it("forwards tool name and args to the SDK and returns normalized content", async () => {
    getClientInstance().callTool.mockResolvedValue({
      content: [{ type: "text", text: "Hello from MCP" }],
      isError: false,
    });
    const { callTool } = await import("../client.js");

    const result = await callTool(stdioConfig, "read_file", { path: "/tmp/foo.txt" });

    expect(getClientInstance().callTool).toHaveBeenCalledWith({
      name: "read_file",
      arguments: { path: "/tmp/foo.txt" },
    });
    expect(result.content).toHaveLength(1);
    expect(result.isError).toBe(false);
  });

  it("marks isError true when the server reports a tool error", async () => {
    getClientInstance().callTool.mockResolvedValue({
      content: [{ type: "text", text: "Permission denied" }],
      isError: true,
    });
    const { callTool } = await import("../client.js");

    const result = await callTool(stdioConfig, "write_file", { path: "/etc/shadow" });

    expect(result.isError).toBe(true);
  });
});

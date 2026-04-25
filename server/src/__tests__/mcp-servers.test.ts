import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeChainableDb } from "./helpers/drizzle-mock.js";

// ── Mock data ────────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();
const SERVER_ID = randomUUID();

const MOCK_SERVER = {
  id: SERVER_ID,
  companyId: COMPANY_ID,
  name: "Filesystem",
  description: "Local filesystem access",
  transport: "stdio",
  command: "npx @modelcontextprotocol/server-filesystem /workspace",
  url: null,
  apiKeySecretName: null,
  enabledForAgentIds: [],
  status: "active",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const MOCK_TOOLS = [
  { name: "read_file", description: "Read a file", inputSchema: { type: "object" } },
  { name: "write_file", description: "Write a file", inputSchema: { type: "object" } },
];

// ── Service mocks ────────────────────────────────────────────────────────────

const mockMcpServerService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  discoverTools: vi.fn(),
  listEnabledForAgent: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", async () => {
  const { makeFullServicesMock } = await import("./helpers/mock-services.js");
  return makeFullServicesMock({
    mcpServerService: () => mockMcpServerService,
    logActivity: mockLogActivity,
  });
});

vi.mock("../services/activity-log.js", () => ({
  logActivity: mockLogActivity,
  setPluginEventBus: vi.fn(),
}));

vi.mock("../services/billing.js", () => ({
  billingService: () => ({}),
}));

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ── App builder ──────────────────────────────────────────────────────────────

async function createApp(actor: Record<string, unknown>) {
  const { mcpServerRoutes } = await import("../routes/mcp-servers.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: actor prop attached by middleware but not in Express types
    (req as any).actor = actor;
    next();
  });
  const fakeDb = makeChainableDb([{ membershipRole: "owner" }]);
  app.use("/api", mcpServerRoutes(fakeDb));
  app.use(errorHandler);
  return app;
}

function boardUser(userId: string, companyIds: string[]) {
  return { type: "board", userId, companyIds, isInstanceAdmin: false, source: "session" };
}

function noActor() {
  return { type: "none" };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/companies/:companyId/mcp-servers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMcpServerService.list.mockResolvedValue([MOCK_SERVER]);
  });

  it("returns the server list for an authorized board user", async () => {
    const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
    const res = await request(app).get(`/api/companies/${COMPANY_ID}/mcp-servers`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ name: "Filesystem" });
  });

  it("rejects non-board actors with 403", async () => {
    const app = await createApp(noActor());
    const res = await request(app).get(`/api/companies/${COMPANY_ID}/mcp-servers`);
    expect(res.status).toBe(403);
  });

  it("rejects cross-company access with 403", async () => {
    const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
    const res = await request(app).get(`/api/companies/${randomUUID()}/mcp-servers`);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/companies/:companyId/mcp-servers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMcpServerService.create.mockResolvedValue(MOCK_SERVER);
  });

  it("creates a stdio server", async () => {
    const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
    const res = await request(app).post(`/api/companies/${COMPANY_ID}/mcp-servers`).send({
      name: "Filesystem",
      transport: "stdio",
      command: "npx @modelcontextprotocol/server-filesystem /workspace",
    });

    expect(res.status).toBe(201);
    expect(mockMcpServerService.create).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.objectContaining({ name: "Filesystem", transport: "stdio" }),
    );
  });

  it("creates an http server with an api key reference", async () => {
    mockMcpServerService.create.mockResolvedValue({
      ...MOCK_SERVER,
      transport: "http",
      url: "https://mcp.example.com",
    });
    const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
    const res = await request(app).post(`/api/companies/${COMPANY_ID}/mcp-servers`).send({
      name: "WebSearch",
      transport: "http",
      url: "https://mcp.example.com",
      apiKeySecretName: "MCP_WEB_SEARCH_KEY",
    });

    expect(res.status).toBe(201);
    expect(mockMcpServerService.create).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.objectContaining({ apiKeySecretName: "MCP_WEB_SEARCH_KEY" }),
    );
  });

  it("rejects invalid transport with 422", async () => {
    const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
    const res = await request(app)
      .post(`/api/companies/${COMPANY_ID}/mcp-servers`)
      .send({ name: "Bad", transport: "websocket" });

    expect(res.status).toBe(422);
  });

  it("rejects missing name with 422", async () => {
    const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
    const res = await request(app).post(`/api/companies/${COMPANY_ID}/mcp-servers`).send({ transport: "stdio" });

    expect(res.status).toBe(422);
  });
});

describe("PATCH /api/mcp-servers/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMcpServerService.getById.mockResolvedValue(MOCK_SERVER);
    mockMcpServerService.update.mockResolvedValue({ ...MOCK_SERVER, status: "paused" });
  });

  it("updates the server status", async () => {
    const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
    const res = await request(app).patch(`/api/mcp-servers/${SERVER_ID}`).send({ status: "paused" });

    expect(res.status).toBe(200);
    expect(mockMcpServerService.update).toHaveBeenCalledWith(
      SERVER_ID,
      COMPANY_ID,
      expect.objectContaining({ status: "paused" }),
    );
  });

  it("returns 404 when server not found", async () => {
    mockMcpServerService.getById.mockResolvedValue(null);
    const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
    const res = await request(app).patch(`/api/mcp-servers/${randomUUID()}`).send({ status: "paused" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/mcp-servers/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMcpServerService.getById.mockResolvedValue(MOCK_SERVER);
    mockMcpServerService.remove.mockResolvedValue(undefined);
  });

  it("deletes the server", async () => {
    const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
    const res = await request(app).delete(`/api/mcp-servers/${SERVER_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockMcpServerService.remove).toHaveBeenCalledWith(SERVER_ID, COMPANY_ID);
  });

  it("returns 404 when server not found", async () => {
    mockMcpServerService.getById.mockResolvedValue(null);
    const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
    const res = await request(app).delete(`/api/mcp-servers/${randomUUID()}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/mcp-servers/:id/test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMcpServerService.getById.mockResolvedValue(MOCK_SERVER);
    mockMcpServerService.discoverTools.mockResolvedValue(MOCK_TOOLS);
  });

  it("returns the discovered tool list", async () => {
    const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
    const res = await request(app).post(`/api/mcp-servers/${SERVER_ID}/test`);

    expect(res.status).toBe(200);
    expect(res.body.tools).toHaveLength(2);
    expect(res.body.tools[0].name).toBe("read_file");
    // forceRefresh must be true for the test endpoint
    expect(mockMcpServerService.discoverTools).toHaveBeenCalledWith(MOCK_SERVER, true);
  });

  it("returns 404 when server not found", async () => {
    mockMcpServerService.getById.mockResolvedValue(null);
    const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
    const res = await request(app).post(`/api/mcp-servers/${randomUUID()}/test`);
    expect(res.status).toBe(404);
  });
});

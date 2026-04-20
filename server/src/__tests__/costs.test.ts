import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock data ───────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();
const AGENT_ID = randomUUID();

const MOCK_SUMMARY = { totalCents: 1500, eventCount: 10 };
const MOCK_BY_AGENT = [{ agentId: AGENT_ID, agentName: "Test Agent", costCents: 750 }];
const MOCK_BY_AGENT_MODEL = [
  {
    agentId: AGENT_ID,
    model: "claude-sonnet",
    costCents: 500,
    inputTokens: 1000,
    cachedInputTokens: 0,
    outputTokens: 500,
    billingType: "metered_api",
  },
];
const MOCK_BY_PROVIDER = [{ provider: "anthropic", costCents: 1500 }];
const MOCK_BY_BILLER = [{ biller: "anthropic", costCents: 1500 }];
const MOCK_OVERVIEW = { policies: [], incidents: [] };
const MOCK_COMPANY = { id: COMPANY_ID, name: "Test Co", budgetMonthlyCents: 10000 };
const MOCK_AGENT_RECORD = { id: AGENT_ID, companyId: COMPANY_ID, name: "Test Agent", budgetMonthlyCents: 5000 };

// ── Service mocks ───────────────────────────────────────────────────────────

const mockCostService = vi.hoisted(() => ({
  createEvent: vi.fn(),
  summary: vi.fn(),
  byAgent: vi.fn(),
  byAgentModel: vi.fn(),
  byProvider: vi.fn(),
  byBiller: vi.fn(),
  byProject: vi.fn(),
  windowSpend: vi.fn(),
}));

const mockFinanceService = vi.hoisted(() => ({
  createEvent: vi.fn(),
  summary: vi.fn(),
  byBiller: vi.fn(),
  byKind: vi.fn(),
  list: vi.fn(),
}));

const mockBudgetService = vi.hoisted(() => ({
  overview: vi.fn(),
  upsertPolicy: vi.fn(),
  resolveIncident: vi.fn(),
}));

const mockCompanyService = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  cancelBudgetScopeWork: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", async () => {
  const { makeFullServicesMock } = await import("./helpers/mock-services.js");
  return makeFullServicesMock({
    costService: () => mockCostService,
    financeService: () => mockFinanceService,
    budgetService: () => mockBudgetService,
    companyService: () => mockCompanyService,
    agentService: () => mockAgentService,
    heartbeatService: () => mockHeartbeatService,
    logActivity: mockLogActivity,
  });
});

vi.mock("../services/costs.js", () => ({
  costPerIssue: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/quota-windows.js", () => ({
  fetchAllQuotaWindows: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/equivalent-spend.js", () => ({
  calculateTotalEquivalentSpend: vi.fn().mockReturnValue(0),
  getRateCard: vi.fn().mockReturnValue({ models: {} }),
}));

vi.mock("../services/activity-log.js", () => ({
  logActivity: mockLogActivity,
  setPluginEventBus: vi.fn(),
}));

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ── App builder ─────────────────────────────────────────────────────────────

async function createApp(actor: Record<string, unknown>) {
  const { costRoutes } = await import("../routes/costs.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: actor prop is attached to Express Request by middleware but not declared in its TypeScript type
    (req as any).actor = actor;
    next();
  });
  // biome-ignore lint/suspicious/noExplicitAny: mock Drizzle DB or storage object for unit tests; real type requires full schema-aware Drizzle instance
  const fakeDb = {} as any;
  app.use("/api", costRoutes(fakeDb));
  app.use(errorHandler);
  return app;
}

function boardUser(userId: string, companyIds: string[]) {
  return { type: "board", userId, companyIds, isInstanceAdmin: false, source: "session" };
}

function noActor() {
  return { type: "none" };
}

function agentActor(agentId: string, companyId: string) {
  return { type: "agent", agentId, companyId };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("cost routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCostService.summary.mockResolvedValue(MOCK_SUMMARY);
    mockCostService.byAgent.mockResolvedValue(MOCK_BY_AGENT);
    mockCostService.byAgentModel.mockResolvedValue(MOCK_BY_AGENT_MODEL);
    mockCostService.byProvider.mockResolvedValue(MOCK_BY_PROVIDER);
    mockCostService.byBiller.mockResolvedValue(MOCK_BY_BILLER);
    mockCostService.byProject.mockResolvedValue([]);
    mockCostService.windowSpend.mockResolvedValue([]);
    mockBudgetService.overview.mockResolvedValue(MOCK_OVERVIEW);
    mockCompanyService.getById.mockResolvedValue(MOCK_COMPANY);
    mockCompanyService.update.mockResolvedValue(MOCK_COMPANY);
    mockAgentService.getById.mockResolvedValue(MOCK_AGENT_RECORD);
    mockAgentService.update.mockResolvedValue(MOCK_AGENT_RECORD);
  });

  describe("GET /api/companies/:companyId/costs/summary", () => {
    it("returns cost summary for authorized user", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/costs/summary`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ totalCents: 1500, eventCount: 10 });
    });

    it("rejects unauthenticated requests with 401", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/costs/summary`);
      expect(res.status).toBe(401);
    });

    it("rejects cross-company access with 403", async () => {
      const otherCompany = randomUUID();
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${otherCompany}/costs/summary`);
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/companies/:companyId/costs/by-agent", () => {
    it("returns costs grouped by agent", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/costs/by-agent`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ agentName: "Test Agent" });
    });
  });

  describe("GET /api/companies/:companyId/costs/by-provider", () => {
    it("returns costs grouped by provider", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/costs/by-provider`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ provider: "anthropic" });
    });
  });

  describe("GET /api/companies/:companyId/budgets/overview", () => {
    it("returns budget overview for authorized user", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/budgets/overview`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject(MOCK_OVERVIEW);
    });
  });

  describe("GET /api/companies/:companyId/costs/quota-windows", () => {
    it("requires board access", async () => {
      const app = await createApp(agentActor(AGENT_ID, COMPANY_ID));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/costs/quota-windows`);
      expect(res.status).toBe(403);
    });

    it("returns 404 for non-existent company", async () => {
      mockCompanyService.getById.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/costs/quota-windows`);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/costs/rate-card", () => {
    it("returns rate card without auth", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get("/api/costs/rate-card");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("models");
    });
  });

  describe("GET /api/companies/:companyId/costs/equivalent-spend", () => {
    it("returns equivalent spend breakdown", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/costs/equivalent-spend`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("billingMode");
      expect(res.body).toHaveProperty("totalEquivalentCents");
    });
  });

  describe("PATCH /api/companies/:companyId/budgets", () => {
    it("requires board access to update company budget", async () => {
      const app = await createApp(agentActor(AGENT_ID, COMPANY_ID));
      const res = await request(app).patch(`/api/companies/${COMPANY_ID}/budgets`).send({ budgetMonthlyCents: 20000 });
      expect(res.status).toBe(403);
    });
  });

  describe("PATCH /api/agents/:agentId/budgets", () => {
    it("returns 404 for non-existent agent", async () => {
      mockAgentService.getById.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).patch(`/api/agents/${randomUUID()}/budgets`).send({ budgetMonthlyCents: 5000 });
      expect(res.status).toBe(404);
    });

    it("rejects agent updating another agent's budget", async () => {
      const otherAgentId = randomUUID();
      mockAgentService.getById.mockResolvedValue({ ...MOCK_AGENT_RECORD, id: otherAgentId });
      const app = await createApp(agentActor(AGENT_ID, COMPANY_ID));
      const res = await request(app).patch(`/api/agents/${otherAgentId}/budgets`).send({ budgetMonthlyCents: 5000 });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/companies/:companyId/costs/project-export", () => {
    it("requires projectId query parameter", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/costs/project-export`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("projectId");
    });
  });

  describe("GET /api/companies/:companyId/cost-per-issue", () => {
    it("rejects invalid days parameter", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/cost-per-issue?days=-1`);
      expect(res.status).toBe(400);
    });
  });
});

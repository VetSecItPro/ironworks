import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock data ───────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();

const MOCK_COMPANY = {
  id: COMPANY_ID,
  name: "Acme Corp",
  slug: "acme-corp",
  status: "active",
  budgetMonthlyCents: 10000,
  branding: {},
};

// ── Service mocks ───────────────────────────────────────────────────────────

const mockCompanyService = vi.hoisted(() => ({
  list: vi.fn(),
  stats: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  ensureMembership: vi.fn(),
}));

const mockBudgetService = vi.hoisted(() => ({
  upsertPolicy: vi.fn(),
}));

const mockPortabilityService = vi.hoisted(() => ({
  exportBundle: vi.fn(),
  importBundle: vi.fn(),
  previewImport: vi.fn(),
  previewExport: vi.fn(),
}));

const mockPlaybookService = vi.hoisted(() => ({
  seedDefaults: vi.fn(),
}));

const mockRoutineService = vi.hoisted(() => ({
  seedDefaults: vi.fn(),
}));

const mockKnowledgeService = vi.hoisted(() => ({
  seedDefaults: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());
const mockSeedSystemRoleTemplates = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", async () => {
  const { makeFullServicesMock } = await import("./helpers/mock-services.js");
  return makeFullServicesMock({
    companyService: () => mockCompanyService,
    agentService: () => mockAgentService,
    accessService: () => mockAccessService,
    budgetService: () => mockBudgetService,
    companyPortabilityService: () => mockPortabilityService,
    playbookService: () => mockPlaybookService,
    routineService: () => mockRoutineService,
    logActivity: mockLogActivity,
    seedSystemRoleTemplates: mockSeedSystemRoleTemplates,
  });
});

vi.mock("../services/knowledge.js", () => ({
  knowledgeService: () => mockKnowledgeService,
}));

vi.mock("../services/channels.js", () => ({
  seedDefaultChannels: vi.fn(),
}));

vi.mock("../services/activity-log.js", () => ({
  logActivity: mockLogActivity,
  setPluginEventBus: vi.fn(),
}));

vi.mock("../services/role-defaults.js", () => ({
  ROLE_DEFAULT_CAPABILITIES: {
    default: {
      canManagePermissions: false,
      canCreateAgents: false,
    },
  },
}));

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ── App builder ─────────────────────────────────────────────────────────────

async function createApp(actor: Record<string, unknown>) {
  const { companyRoutes } = await import("../routes/companies.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  const fakeDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    // biome-ignore lint/suspicious/noThenProperty: test mock drizzle thenable contract
    then: vi.fn().mockResolvedValue([{ membershipRole: "owner" }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  } as any;
  app.use("/api/companies", companyRoutes(fakeDb));
  app.use(errorHandler);
  return app;
}

function boardUser(userId: string, companyIds: string[]) {
  return { type: "board", userId, companyIds, isInstanceAdmin: false, source: "session" };
}

function instanceAdmin(userId: string) {
  return { type: "board", userId, companyIds: [], isInstanceAdmin: true, source: "local_implicit" };
}

function noActor() {
  return { type: "none" };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("company routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompanyService.list.mockResolvedValue([MOCK_COMPANY]);
    mockCompanyService.stats.mockResolvedValue({ [COMPANY_ID]: { agentCount: 3 } });
    mockCompanyService.getById.mockResolvedValue(MOCK_COMPANY);
    mockCompanyService.create.mockResolvedValue(MOCK_COMPANY);
    mockCompanyService.update.mockResolvedValue(MOCK_COMPANY);
    mockCompanyService.archive.mockResolvedValue(MOCK_COMPANY);
    mockCompanyService.remove.mockResolvedValue(MOCK_COMPANY);
  });

  describe("GET /api/companies", () => {
    it("lists companies for board user", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get("/api/companies");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ name: "Acme Corp" });
    });

    it("rejects non-board actors with 403", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get("/api/companies");
      expect(res.status).toBe(403);
    });

    it("filters companies by user access for non-admin board users", async () => {
      mockCompanyService.list.mockResolvedValue([
        MOCK_COMPANY,
        { ...MOCK_COMPANY, id: randomUUID(), name: "Other Corp" },
      ]);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get("/api/companies");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe("Acme Corp");
    });
  });

  describe("GET /api/companies/stats", () => {
    it("returns stats for board user", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get("/api/companies/stats");

      expect(res.status).toBe(200);
      expect(res.body[COMPANY_ID]).toMatchObject({ agentCount: 3 });
    });
  });

  describe("GET /api/companies/:companyId", () => {
    it("returns company details for authorized board user", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: COMPANY_ID, name: "Acme Corp" });
    });

    it("returns 404 for non-existent company", async () => {
      mockCompanyService.getById.mockResolvedValue(null);
      const app = await createApp(instanceAdmin(USER_ID));
      const res = await request(app).get(`/api/companies/${randomUUID()}`);
      expect(res.status).toBe(404);
    });

    it("rejects unauthenticated requests with 401", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get(`/api/companies/${COMPANY_ID}`);
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/companies", () => {
    it("creates a company for instance admin", async () => {
      const app = await createApp(instanceAdmin(USER_ID));
      const res = await request(app).post("/api/companies").send({ name: "Acme Corp" });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: "Acme Corp" });
      expect(mockAccessService.ensureMembership).toHaveBeenCalled();
    });

    it("rejects non-admin board user with 403", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post("/api/companies").send({ name: "New Corp" });
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/companies/:companyId/archive", () => {
    it("archives a company", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post(`/api/companies/${COMPANY_ID}/archive`);

      expect(res.status).toBe(200);
      expect(mockCompanyService.archive).toHaveBeenCalledWith(COMPANY_ID);
    });

    it("returns 404 for non-existent company", async () => {
      mockCompanyService.archive.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post(`/api/companies/${COMPANY_ID}/archive`);
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/companies/:companyId", () => {
    it("deletes a company", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).delete(`/api/companies/${COMPANY_ID}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it("returns 404 for non-existent company", async () => {
      mockCompanyService.remove.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).delete(`/api/companies/${COMPANY_ID}`);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/companies/issues", () => {
    it("returns 400 for missing companyId sentinel route", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get("/api/companies/issues");
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Missing companyId");
    });
  });
});

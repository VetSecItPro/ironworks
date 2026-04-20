import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock data ───────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();
const HIRING_ID = randomUUID();

const MOCK_HIRING_REQUEST = {
  id: HIRING_ID,
  companyId: COMPANY_ID,
  role: "engineer",
  title: "Software Engineer",
  employmentType: "full_time",
  department: "Engineering",
  justification: "Team needs more capacity",
  status: "draft",
  requestedByUserId: USER_ID,
  requestedByAgentId: null,
  projectId: null,
  contractDurationDays: null,
  contractBudgetCents: null,
  onboardingKbPageIds: [],
  reportsToAgentId: null,
  approvalId: null,
  fulfilledAgentId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ── DB mock ─────────────────────────────────────────────────────────────────

const mockDbRows = vi.hoisted(() => vi.fn());
const mockInsertRow = vi.hoisted(() => vi.fn());
const mockUpdateRow = vi.hoisted(() => vi.fn());

function createFakeDb() {
  // select chain
  const selectLimit = vi.fn().mockImplementation(() => mockDbRows());
  const selectOrderBy = vi.fn().mockReturnValue({ limit: selectLimit });
  const selectWhere = vi.fn().mockReturnValue({
    orderBy: selectOrderBy,
    limit: selectLimit,
    then: vi.fn().mockImplementation((cb: any) => mockDbRows().then(cb)),
  });
  const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
  const selectObj = vi.fn().mockReturnValue({ from: selectFrom });

  // insert chain
  const insertThen = vi.fn().mockImplementation((cb: any) => mockInsertRow().then(cb));
  const insertReturning = vi.fn().mockReturnValue({ then: insertThen });
  const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
  const insertInto = vi.fn().mockReturnValue({ values: insertValues });

  // update chain
  const updateThen = vi.fn().mockImplementation((cb: any) => mockUpdateRow().then(cb));
  const updateReturning = vi.fn().mockReturnValue({ then: updateThen });
  const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const updateFrom = vi.fn().mockReturnValue({ set: updateSet });

  return {
    select: selectObj,
    insert: insertInto,
    update: updateFrom,
    transaction: vi.fn(),
  } as any;
}

// ── Service mocks ───────────────────────────────────────────────────────────

const mockLogActivity = vi.hoisted(() => vi.fn());
const mockApprovalCreate = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  logActivity: mockLogActivity,
  approvalService: () => ({ create: mockApprovalCreate }),
  createAgentWorkspace: vi.fn(),
  createHiringRecord: vi.fn(),
  createEmploymentHistoryEntry: vi.fn(),
  buildOnboardingPacket: vi.fn().mockResolvedValue({}),
}));

vi.mock("../services/activity-log.js", () => ({
  logActivity: mockLogActivity,
  setPluginEventBus: vi.fn(),
}));

vi.mock("../services/channels.js", () => ({
  findCompanyChannel: vi.fn().mockResolvedValue(null),
  postMessage: vi.fn(),
}));

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Mock assertCanWrite to avoid DB calls
vi.mock("../routes/authz.js", async (importOriginal) => {
  const original = (await importOriginal()) as any;
  return {
    ...original,
    assertCanWrite: vi.fn().mockResolvedValue(undefined),
  };
});

// ── App builder ─────────────────────────────────────────────────────────────

async function createApp(actor: Record<string, unknown>, fakeDb?: any) {
  const { hiringRoutes } = await import("../routes/hiring.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", hiringRoutes(fakeDb ?? createFakeDb()));
  app.use(errorHandler);
  return app;
}

function boardUser(userId: string, companyIds: string[]) {
  return { type: "board", userId, companyIds, isInstanceAdmin: false, source: "session" };
}

function noActor() {
  return { type: "none" };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("hiring routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbRows.mockResolvedValue([MOCK_HIRING_REQUEST]);
    mockInsertRow.mockResolvedValue([MOCK_HIRING_REQUEST]);
    mockUpdateRow.mockResolvedValue([MOCK_HIRING_REQUEST]);
    mockLogActivity.mockResolvedValue(undefined);
    mockApprovalCreate.mockResolvedValue({ id: randomUUID() });
  });

  describe("GET /api/companies/:companyId/hiring-requests", () => {
    it("returns hiring requests for authorized user", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/hiring-requests`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ role: "engineer", status: "draft" });
    });

    it("rejects unauthenticated requests with 401", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/hiring-requests`);
      expect(res.status).toBe(401);
    });

    it("rejects cross-company access with 403", async () => {
      const otherCompany = randomUUID();
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${otherCompany}/hiring-requests`);
      expect(res.status).toBe(403);
    });

    it("accepts status filter query param", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/hiring-requests?status=pending`);
      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/companies/:companyId/hiring-requests", () => {
    it("creates hiring request with valid payload", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/hiring-requests`)
        .send({ role: "engineer", title: "Software Engineer" });

      expect(res.status).toBe(201);
    });

    it("rejects missing role with 400", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/hiring-requests`)
        .send({ title: "Software Engineer" });

      expect(res.status).toBe(400);
    });

    it("rejects missing title with 400", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post(`/api/companies/${COMPANY_ID}/hiring-requests`).send({ role: "engineer" });

      expect(res.status).toBe(400);
    });

    it("accepts optional fields like department and justification", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post(`/api/companies/${COMPANY_ID}/hiring-requests`).send({
        role: "engineer",
        title: "SE",
        department: "Platform",
        justification: "Scaling needs",
      });

      expect(res.status).toBe(201);
    });
  });

  describe("PATCH /api/companies/:companyId/hiring-requests/:id", () => {
    it("updates draft hiring request fields", async () => {
      mockDbRows.mockResolvedValue([MOCK_HIRING_REQUEST]);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .patch(`/api/companies/${COMPANY_ID}/hiring-requests/${HIRING_ID}`)
        .send({ role: "senior_engineer" });

      expect(res.status).toBe(200);
    });

    it("returns 404 for non-existent request", async () => {
      mockDbRows.mockResolvedValue([]);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .patch(`/api/companies/${COMPANY_ID}/hiring-requests/${randomUUID()}`)
        .send({ role: "x" });

      expect(res.status).toBe(404);
    });

    it("rejects editing non-draft request with 422", async () => {
      mockDbRows.mockResolvedValue([{ ...MOCK_HIRING_REQUEST, status: "pending" }]);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .patch(`/api/companies/${COMPANY_ID}/hiring-requests/${HIRING_ID}`)
        .send({ role: "x" });

      expect(res.status).toBe(422);
    });
  });
});

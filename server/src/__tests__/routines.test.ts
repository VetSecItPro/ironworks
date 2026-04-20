import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock data ───────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();
const ROUTINE_ID = randomUUID();
const TRIGGER_ID = randomUUID();
const AGENT_ID = randomUUID();

const MOCK_ROUTINE = {
  id: ROUTINE_ID,
  companyId: COMPANY_ID,
  title: "Daily Standup Report",
  description: "Generate daily standup summary",
  status: "active",
  assigneeAgentId: AGENT_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_TRIGGER = {
  id: TRIGGER_ID,
  routineId: ROUTINE_ID,
  kind: "cron",
  cronExpression: "0 9 * * *",
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_RUN = {
  id: randomUUID(),
  routineId: ROUTINE_ID,
  status: "completed",
  source: "cron",
  startedAt: new Date(),
  completedAt: new Date(),
};

// ── Service mocks ───────────────────────────────────────────────────────────

const mockRoutineService = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  getDetail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  seedDefaults: vi.fn(),
  listRuns: vi.fn(),
  runRoutine: vi.fn(),
  createTrigger: vi.fn(),
  getTrigger: vi.fn(),
  updateTrigger: vi.fn(),
  deleteTrigger: vi.fn(),
  rotateTriggerSecret: vi.fn(),
  firePublicTrigger: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn().mockResolvedValue(true),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", async () => {
  const { makeFullServicesMock } = await import("./helpers/mock-services.js");
  return makeFullServicesMock({
    routineService: () => mockRoutineService,
    accessService: () => mockAccessService,
    logActivity: mockLogActivity,
  });
});

vi.mock("../services/activity-log.js", () => ({
  logActivity: mockLogActivity,
  setPluginEventBus: vi.fn(),
}));

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../middleware/validate.js", () => ({
  validate: () => (_req: any, _res: any, next: any) => next(),
}));

// ── App builder ─────────────────────────────────────────────────────────────

async function createApp(actor: Record<string, unknown>) {
  const { routineRoutes } = await import("../routes/routines.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  const fakeDb = {} as any;
  app.use("/api", routineRoutes(fakeDb));
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

describe("routine routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoutineService.list.mockResolvedValue([MOCK_ROUTINE]);
    mockRoutineService.get.mockResolvedValue(MOCK_ROUTINE);
    mockRoutineService.getDetail.mockResolvedValue(MOCK_ROUTINE);
    mockRoutineService.create.mockResolvedValue(MOCK_ROUTINE);
    mockRoutineService.update.mockResolvedValue(MOCK_ROUTINE);
    mockRoutineService.seedDefaults.mockResolvedValue([MOCK_ROUTINE]);
    mockRoutineService.listRuns.mockResolvedValue([MOCK_RUN]);
    mockRoutineService.runRoutine.mockResolvedValue(MOCK_RUN);
    mockRoutineService.createTrigger.mockResolvedValue({ trigger: MOCK_TRIGGER });
    mockRoutineService.getTrigger.mockResolvedValue(MOCK_TRIGGER);
    mockRoutineService.updateTrigger.mockResolvedValue(MOCK_TRIGGER);
    mockRoutineService.deleteTrigger.mockResolvedValue(undefined);
    mockRoutineService.rotateTriggerSecret.mockResolvedValue({ secret: "new-secret" });
    mockRoutineService.firePublicTrigger.mockResolvedValue({ runId: randomUUID() });
    mockLogActivity.mockResolvedValue(undefined);
  });

  describe("GET /api/companies/:companyId/routines", () => {
    it("lists routines for authorized user", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/routines`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ title: "Daily Standup Report" });
    });

    it("rejects unauthenticated requests with 401", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/routines`);
      expect(res.status).toBe(401);
    });

    it("rejects cross-company access with 403", async () => {
      const otherCompany = randomUUID();
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${otherCompany}/routines`);
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/companies/:companyId/routines", () => {
    it("creates a routine for authorized user", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/routines`)
        .send({ title: "Daily Standup Report", assigneeAgentId: AGENT_ID });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ title: "Daily Standup Report" });
      expect(mockLogActivity).toHaveBeenCalled();
    });

    it("rejects unauthenticated create with 401", async () => {
      const app = await createApp(noActor());
      const res = await request(app).post(`/api/companies/${COMPANY_ID}/routines`).send({ title: "Test" });
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/companies/:companyId/routines/seed", () => {
    it("seeds default routines", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post(`/api/companies/${COMPANY_ID}/routines/seed`);

      expect(res.status).toBe(200);
      expect(mockRoutineService.seedDefaults).toHaveBeenCalledWith(COMPANY_ID);
    });
  });

  describe("GET /api/routines/:id", () => {
    it("returns routine detail by ID", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/routines/${ROUTINE_ID}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: ROUTINE_ID, title: "Daily Standup Report" });
    });

    it("returns 404 for non-existent routine", async () => {
      mockRoutineService.getDetail.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/routines/${randomUUID()}`);
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/routines/:id", () => {
    it("updates a routine", async () => {
      const updated = { ...MOCK_ROUTINE, title: "Weekly Report" };
      mockRoutineService.update.mockResolvedValue(updated);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).patch(`/api/routines/${ROUTINE_ID}`).send({ title: "Weekly Report" });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Weekly Report");
    });

    it("returns 404 for non-existent routine update", async () => {
      mockRoutineService.get.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).patch(`/api/routines/${randomUUID()}`).send({ title: "Updated" });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/routines/:id/runs", () => {
    it("lists runs for a routine", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/routines/${ROUTINE_ID}/runs`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ status: "completed" });
    });

    it("returns 404 for runs of non-existent routine", async () => {
      mockRoutineService.get.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/routines/${randomUUID()}/runs`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/routines/:id/triggers", () => {
    it("creates a trigger for a routine", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post(`/api/routines/${ROUTINE_ID}/triggers`)
        .send({ kind: "cron", cronExpression: "0 9 * * *" });

      expect(res.status).toBe(201);
      expect(res.body.trigger).toMatchObject({ kind: "cron" });
    });
  });

  describe("DELETE /api/routine-triggers/:id", () => {
    it("deletes a trigger", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).delete(`/api/routine-triggers/${TRIGGER_ID}`);

      expect(res.status).toBe(204);
      expect(mockRoutineService.deleteTrigger).toHaveBeenCalledWith(TRIGGER_ID);
    });

    it("returns 404 for non-existent trigger", async () => {
      mockRoutineService.getTrigger.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).delete(`/api/routine-triggers/${randomUUID()}`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/routines/:id/run", () => {
    it("manually runs a routine", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post(`/api/routines/${ROUTINE_ID}/run`).send({});

      expect(res.status).toBe(202);
      expect(mockRoutineService.runRoutine).toHaveBeenCalled();
    });
  });
});

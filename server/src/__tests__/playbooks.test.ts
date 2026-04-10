import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Mock data ───────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();
const PLAYBOOK_ID = randomUUID();
const RUN_ID = randomUUID();

const MOCK_PLAYBOOK = {
  id: PLAYBOOK_ID,
  companyId: COMPANY_ID,
  name: "Deploy Pipeline",
  description: "Standard deployment playbook",
  category: "engineering",
  estimatedMinutes: 30,
};

const MOCK_PLAYBOOK_WITH_STEPS = {
  ...MOCK_PLAYBOOK,
  steps: [
    { id: randomUUID(), order: 1, title: "Run tests", agentRole: "engineer" },
    { id: randomUUID(), order: 2, title: "Build artifacts", agentRole: "engineer" },
  ],
};

const MOCK_RUN = {
  id: RUN_ID,
  companyId: COMPANY_ID,
  playbookId: PLAYBOOK_ID,
  status: "running",
  triggeredBy: USER_ID,
};

// ── Service mocks ───────────────────────────────────────────────────────────

const mockPlaybookService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  getWithSteps: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deletePlaybook: vi.fn(),
  seedDefaults: vi.fn(),
}));

const mockPlaybookExecService = vi.hoisted(() => ({
  runPlaybook: vi.fn(),
  getRunWithSteps: vi.fn(),
  listRuns: vi.fn(),
  onIssueCompleted: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn().mockResolvedValue(true),
}));

vi.mock("../services/playbooks.js", () => ({
  playbookService: () => mockPlaybookService,
}));

vi.mock("../services/playbook-execution.js", () => ({
  playbookExecutionService: () => mockPlaybookExecService,
}));

vi.mock("../services/activity-log.js", () => ({
  logActivity: mockLogActivity,
  setPluginEventBus: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  logActivity: mockLogActivity,
}));

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ── App builder ─────────────────────────────────────────────────────────────

async function createApp(actor: Record<string, unknown>) {
  const { playbookRoutes } = await import("../routes/playbooks.js");
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
    then: vi.fn().mockResolvedValue([{ membershipRole: "owner" }]),
  } as any;
  app.use("/api", playbookRoutes(fakeDb));
  app.use(errorHandler);
  return app;
}

function boardUser(userId: string, companyIds: string[]) {
  return { type: "board", userId, companyIds, isInstanceAdmin: false, source: "session" };
}

function instanceAdmin(userId: string) {
  return { type: "board", userId, companyIds: [], isInstanceAdmin: true, source: "session" };
}

function noActor() {
  return { type: "none" };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("playbook routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlaybookService.list.mockResolvedValue([MOCK_PLAYBOOK]);
    mockPlaybookService.getById.mockResolvedValue(MOCK_PLAYBOOK);
    mockPlaybookService.getWithSteps.mockResolvedValue(MOCK_PLAYBOOK_WITH_STEPS);
    mockPlaybookService.create.mockResolvedValue(MOCK_PLAYBOOK_WITH_STEPS);
    mockPlaybookService.update.mockResolvedValue(MOCK_PLAYBOOK);
    mockPlaybookService.seedDefaults.mockResolvedValue({ created: 7 });
    mockPlaybookExecService.runPlaybook.mockResolvedValue(MOCK_RUN);
    mockPlaybookExecService.getRunWithSteps.mockResolvedValue(MOCK_RUN);
    mockPlaybookExecService.listRuns.mockResolvedValue([MOCK_RUN]);
    mockPlaybookExecService.onIssueCompleted.mockResolvedValue({ unblocked: 1, runComplete: false });
  });

  describe("GET /api/companies/:companyId/playbooks", () => {
    it("lists playbooks for authorized user", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/playbooks`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ name: "Deploy Pipeline" });
    });

    it("rejects unauthenticated requests with 401", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/playbooks`);
      expect(res.status).toBe(401);
    });

    it("rejects cross-company access with 403", async () => {
      const otherCompany = randomUUID();
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${otherCompany}/playbooks`);
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/companies/:companyId/playbooks/:playbookId", () => {
    it("returns playbook with steps", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/playbooks/${PLAYBOOK_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.steps).toHaveLength(2);
    });

    it("returns 404 for non-existent playbook", async () => {
      mockPlaybookService.getWithSteps.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/playbooks/${randomUUID()}`);
      expect(res.status).toBe(404);
    });

    it("returns 404 when playbook belongs to different company", async () => {
      mockPlaybookService.getWithSteps.mockResolvedValue({ ...MOCK_PLAYBOOK_WITH_STEPS, companyId: randomUUID() });
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/playbooks/${PLAYBOOK_ID}`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/companies/:companyId/playbooks", () => {
    it("creates a new playbook", async () => {
      const app = await createApp(instanceAdmin(USER_ID));
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/playbooks`)
        .send({ name: "Deploy Pipeline", description: "Standard deployment", steps: [] });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: "Deploy Pipeline" });
    });

    it("rejects missing name with 400", async () => {
      const app = await createApp(instanceAdmin(USER_ID));
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/playbooks`)
        .send({ description: "No name provided" });
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/companies/:companyId/playbooks/:playbookId", () => {
    it("updates a playbook", async () => {
      const app = await createApp(instanceAdmin(USER_ID));
      const res = await request(app)
        .patch(`/api/companies/${COMPANY_ID}/playbooks/${PLAYBOOK_ID}`)
        .send({ description: "Updated description" });

      expect(res.status).toBe(200);
      expect(mockPlaybookService.update).toHaveBeenCalled();
    });
  });

  describe("DELETE /api/companies/:companyId/playbooks/:playbookId", () => {
    it("deletes a playbook and returns 204", async () => {
      const app = await createApp(instanceAdmin(USER_ID));
      const res = await request(app).delete(`/api/companies/${COMPANY_ID}/playbooks/${PLAYBOOK_ID}`);

      expect(res.status).toBe(204);
      expect(mockPlaybookService.deletePlaybook).toHaveBeenCalledWith(PLAYBOOK_ID);
    });

    it("returns 404 for non-existent playbook", async () => {
      mockPlaybookService.getById.mockResolvedValue(null);
      const app = await createApp(instanceAdmin(USER_ID));
      const res = await request(app).delete(`/api/companies/${COMPANY_ID}/playbooks/${randomUUID()}`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/companies/:companyId/playbooks/:playbookId/run", () => {
    it("runs a playbook and returns 201", async () => {
      const app = await createApp(instanceAdmin(USER_ID));
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/playbooks/${PLAYBOOK_ID}/run`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: "running" });
    });
  });

  describe("GET /api/companies/:companyId/playbook-runs", () => {
    it("lists playbook runs", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/playbook-runs`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe("POST /api/companies/:companyId/playbook-runs/issue-completed", () => {
    it("resolves dependencies when issue completes", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/playbook-runs/issue-completed`)
        .send({ issueId: randomUUID() });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ unblocked: 1 });
    });

    it("rejects missing issueId with 400", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/playbook-runs/issue-completed`)
        .send({});
      expect(res.status).toBe(400);
    });
  });
});

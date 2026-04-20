import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock data ───────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();
const AGENT_ID = randomUUID();
const ISSUE_ID = randomUUID();
const _RUN_ID = randomUUID();

const MOCK_ACTIVITY = {
  id: randomUUID(),
  companyId: COMPANY_ID,
  actorType: "agent",
  actorId: AGENT_ID,
  action: "issue.updated",
  entityType: "issue",
  entityId: ISSUE_ID,
  details: { status: "in_progress" },
  createdAt: new Date().toISOString(),
};

const MOCK_ISSUE = {
  id: ISSUE_ID,
  companyId: COMPANY_ID,
  identifier: "ENG-42",
  title: "Test issue",
};

// ── Service mocks ───────────────────────────────────────────────────────────

const mockActivityService = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  forIssue: vi.fn(),
  runsForIssue: vi.fn(),
  issuesForRun: vi.fn(),
}));

const mockIssueService = vi.hoisted(() => ({
  getById: vi.fn(),
  getByIdentifier: vi.fn(),
  list: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/activity.js", () => ({
  activityService: () => mockActivityService,
}));

vi.mock("../services/index.js", async () => {
  const { makeFullServicesMock } = await import("./helpers/mock-services.js");
  return makeFullServicesMock({
    issueService: () => mockIssueService,
  });
});

vi.mock("../services/activity-log.js", () => ({
  logActivity: vi.fn(),
  setPluginEventBus: vi.fn(),
}));

vi.mock("../redaction.js", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: vi.fn mock type erasure; pass-through identity function for testing
  sanitizeRecord: vi.fn((x: any) => x),
}));

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ── App builder ─────────────────────────────────────────────────────────────

async function createApp(actor: Record<string, unknown>) {
  const { activityRoutes } = await import("../routes/activity.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: actor prop is attached to Express Request by middleware but not declared in its TypeScript type
    (req as any).actor = actor;
    next();
  });
  const fakeDb = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ companyId: COMPANY_ID }]),
        }),
      }),
    }),
    // biome-ignore lint/suspicious/noExplicitAny: type assertion on mock/test object whose full shape is irrelevant to test logic
  } as any;
  app.use("/api", activityRoutes(fakeDb));
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

describe("activity routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActivityService.list.mockResolvedValue([MOCK_ACTIVITY]);
    mockActivityService.create.mockResolvedValue(MOCK_ACTIVITY);
    mockActivityService.forIssue.mockResolvedValue([MOCK_ACTIVITY]);
    mockActivityService.runsForIssue.mockResolvedValue([]);
    mockActivityService.issuesForRun.mockResolvedValue([]);
    mockIssueService.getById.mockResolvedValue(MOCK_ISSUE);
    mockIssueService.getByIdentifier.mockResolvedValue(MOCK_ISSUE);
  });

  describe("GET /api/companies/:companyId/activity", () => {
    it("returns activity log for authorized user", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/activity`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ action: "issue.updated", entityType: "issue" });
    });

    it("rejects unauthenticated requests with 401", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/activity`);
      expect(res.status).toBe(401);
    });

    it("rejects cross-company access with 403", async () => {
      const otherCompany = randomUUID();
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${otherCompany}/activity`);
      expect(res.status).toBe(403);
    });

    it("passes agentId filter to service", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      await request(app).get(`/api/companies/${COMPANY_ID}/activity?agentId=${AGENT_ID}`);

      expect(mockActivityService.list).toHaveBeenCalledWith(expect.objectContaining({ agentId: AGENT_ID }));
    });

    it("passes entityType filter to service", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      await request(app).get(`/api/companies/${COMPANY_ID}/activity?entityType=issue`);

      expect(mockActivityService.list).toHaveBeenCalledWith(expect.objectContaining({ entityType: "issue" }));
    });

    it("clamps limit to valid range", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      await request(app).get(`/api/companies/${COMPANY_ID}/activity?limit=9999`);

      expect(mockActivityService.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 500 }));
    });
  });

  describe("POST /api/companies/:companyId/activity", () => {
    it("creates activity event for board user", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post(`/api/companies/${COMPANY_ID}/activity`).send({
        actorType: "system",
        actorId: "test",
        action: "test.action",
        entityType: "test",
        entityId: randomUUID(),
      });

      expect(res.status).toBe(201);
      expect(mockActivityService.create).toHaveBeenCalled();
    });

    it("rejects non-board user with 403", async () => {
      const app = await createApp(noActor());
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/activity`)
        .send({ actorId: "x", action: "y", entityType: "z", entityId: "w" });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/issues/:id/activity", () => {
    it("returns activity for issue by UUID", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/issues/${ISSUE_ID}/activity`);

      expect(res.status).toBe(200);
      expect(mockActivityService.forIssue).toHaveBeenCalledWith(ISSUE_ID);
    });

    it("returns activity for issue by identifier", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/issues/ENG-42/activity`);

      expect(res.status).toBe(200);
      expect(mockIssueService.getByIdentifier).toHaveBeenCalledWith("ENG-42");
    });

    it("returns 404 for non-existent issue", async () => {
      mockIssueService.getById.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/issues/${randomUUID()}/activity`);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/issues/:id/runs", () => {
    it("returns runs for a valid issue", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/issues/${ISSUE_ID}/runs`);

      expect(res.status).toBe(200);
      expect(mockActivityService.runsForIssue).toHaveBeenCalledWith(COMPANY_ID, ISSUE_ID);
    });
  });
});

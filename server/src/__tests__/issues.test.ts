import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock data ───────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();
const _AGENT_ID = randomUUID();
const ISSUE_ID = randomUUID();

const MOCK_ISSUE = {
  id: ISSUE_ID,
  companyId: COMPANY_ID,
  identifier: "TST-1",
  title: "Test issue",
  description: "A test issue",
  status: "backlog",
  priority: "medium",
  assigneeAgentId: null,
  assigneeUserId: null,
  projectId: null,
  goalId: null,
  parentId: null,
  createdByAgentId: null,
  createdByUserId: USER_ID,
};

// ── Service mocks ───────────────────────────────────────────────────────────

const mockIssueService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  getByIdentifier: vi.fn().mockResolvedValue(null),
  findByIdentifierUnsafe: vi.fn().mockResolvedValue(null),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  getAncestors: vi.fn().mockResolvedValue([]),
  findMentionedProjectIds: vi.fn().mockResolvedValue([]),
  findMentionedAgents: vi.fn().mockResolvedValue([]),
  addComment: vi.fn(),
  listComments: vi.fn().mockResolvedValue([]),
  getComment: vi.fn().mockResolvedValue(null),
  archiveInbox: vi.fn(),
  unarchiveInbox: vi.fn(),
  listLabels: vi.fn().mockResolvedValue([]),
  listAttachments: vi.fn().mockResolvedValue([]),
  createLabel: vi.fn(),
  getLabelById: vi.fn().mockResolvedValue(null),
  deleteLabel: vi.fn(),
  removeLabel: vi.fn(),
  markRead: vi.fn(),
  getBlockers: vi.fn().mockResolvedValue([]),
  getDependants: vi.fn().mockResolvedValue([]),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn().mockResolvedValue(true),
  ensureMembership: vi.fn(),
  setMemberPermissions: vi.fn(),
  setPrincipalPermission: vi.fn(),
  listMembers: vi.fn().mockResolvedValue([]),
  listPermissions: vi.fn().mockResolvedValue([]),
  hasPermission: vi.fn().mockResolvedValue(true),
  getMembership: vi.fn().mockResolvedValue(null),
  listPrincipalPermissions: vi.fn().mockResolvedValue([]),
  listPrincipalGrants: vi.fn().mockResolvedValue([]),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", async () => {
  const { makeFullServicesMock } = await import("./helpers/mock-services.js");
  return makeFullServicesMock({
    accessService: () => mockAccessService,
    agentService: () => ({ getById: vi.fn().mockResolvedValue(null), list: vi.fn().mockResolvedValue([]) }),
    executionWorkspaceService: () => ({ getById: vi.fn() }),
    goalService: () => ({
      getById: vi.fn().mockResolvedValue(null),
      getDefaultCompanyGoal: vi.fn().mockResolvedValue(null),
    }),
    heartbeatService: () => ({ wakeup: vi.fn(), getActiveRun: vi.fn(), listRuns: vi.fn().mockResolvedValue([]) }),
    issueApprovalService: () => ({
      list: vi.fn().mockResolvedValue([]),
      listApprovalsForIssue: vi.fn().mockResolvedValue([]),
      link: vi.fn(),
      unlink: vi.fn(),
    }),
    issueService: () => mockIssueService,
    documentService: () => ({ getIssueDocumentPayload: vi.fn().mockResolvedValue({}) }),
    logActivity: mockLogActivity,
    projectService: () => ({ getById: vi.fn().mockResolvedValue(null), listByIds: vi.fn().mockResolvedValue([]) }),
    routineService: () => ({
      list: vi.fn().mockResolvedValue([]),
      syncRunStatusForIssue: vi.fn().mockResolvedValue(undefined),
    }),
    workProductService: () => ({
      listForIssue: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    }),
  });
});

vi.mock("../services/activity-log.js", () => ({
  logActivity: mockLogActivity,
}));

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../services/issue-assignment-wakeup.js", () => ({
  queueIssueAssignmentWakeup: vi.fn(),
}));

vi.mock("../services/playbook-execution.js", () => ({
  playbookExecutionService: () => ({ execute: vi.fn() }),
  ensureLibraryAgentFolder: vi.fn(),
}));

vi.mock("../services/goal-progress.js", () => ({
  recalculateGoalProgress: vi.fn(),
}));

vi.mock("../services/agent-reflection.js", () => ({
  performPostTaskReflection: vi.fn(),
}));

vi.mock("../services/channels.js", () => ({
  findCompanyChannel: vi.fn().mockResolvedValue(null),
  postMessage: vi.fn(),
}));

vi.mock("../services/spec-validation.js", () => ({
  validateSpec: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock("../services/quality-gate.js", () => ({
  createQualityGateReview: vi.fn(),
}));

vi.mock("../services/issues.js", () => ({
  issueService: () => mockIssueService,
}));

// ── App builder ─────────────────────────────────────────────────────────────

async function createApp(actor: Record<string, unknown>) {
  const { issueRoutes } = await import("../routes/issues.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: actor prop is attached to Express Request by middleware but not declared in its TypeScript type
    (req as any).actor = actor;
    next();
  });
  const fakeDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    // biome-ignore lint/suspicious/noThenProperty: test mock drizzle thenable contract
    then: vi.fn().mockResolvedValue([]),
    // biome-ignore lint/suspicious/noExplicitAny: type assertion on mock/test object whose full shape is irrelevant to test logic
  } as any;
  const fakeStorage = {
    putFile: vi.fn(),
    getFile: vi.fn(),
    deleteFile: vi.fn(),
    listFiles: vi.fn().mockResolvedValue([]),
    getSignedUrl: vi.fn(),
    // biome-ignore lint/suspicious/noExplicitAny: type assertion on mock/test object whose full shape is irrelevant to test logic
  } as any;
  app.use("/api", issueRoutes(fakeDb, fakeStorage));
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

describe("issue routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueService.list.mockResolvedValue([MOCK_ISSUE]);
    mockIssueService.getById.mockResolvedValue(MOCK_ISSUE);
    // biome-ignore lint/suspicious/noExplicitAny: unused or loosely typed parameter in vi.fn mock implementation
    mockIssueService.create.mockImplementation((_companyId: string, data: any) => ({
      id: randomUUID(),
      companyId: COMPANY_ID,
      identifier: "TST-2",
      status: "backlog",
      ...data,
    }));
  });

  describe("GET /api/companies/:companyId/issues", () => {
    it("lists issues for authorized user", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/issues`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ identifier: "TST-1", status: "backlog" });
    });

    it("rejects unauthenticated requests with 401", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/issues`);
      expect(res.status).toBe(401);
    });

    it("rejects cross-company access with 403", async () => {
      const otherCompany = randomUUID();
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${otherCompany}/issues`);
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/issues (missing companyId)", () => {
    it("returns 400 with guidance to use company-scoped path", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get("/api/issues");
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Missing companyId");
    });
  });

  describe("POST /api/companies/:companyId/issues", () => {
    it("creates an issue with required fields", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post(`/api/companies/${COMPANY_ID}/issues`).send({ title: "New bug" });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ title: "New bug", status: "backlog" });
      expect(mockIssueService.create).toHaveBeenCalledWith(COMPANY_ID, expect.objectContaining({ title: "New bug" }));
    });

    it("rejects issue creation without title (validation error)", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post(`/api/companies/${COMPANY_ID}/issues`).send({});

      // Zod validation should catch missing title
      expect(res.status).toBe(400);
    });

    it("enforces company access on issue creation", async () => {
      const otherCompany = randomUUID();
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post(`/api/companies/${otherCompany}/issues`).send({ title: "Exploit" });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/issues/:id", () => {
    it("returns issue by ID", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/issues/${ISSUE_ID}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: ISSUE_ID, title: "Test issue" });
    });

    it("returns 404 for non-existent issue", async () => {
      mockIssueService.getById.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/issues/${randomUUID()}`);
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/issues/:id", () => {
    it("updates an issue's title", async () => {
      mockIssueService.update.mockResolvedValue({ ...MOCK_ISSUE, title: "Renamed" });
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).patch(`/api/issues/${ISSUE_ID}`).send({ title: "Renamed" });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Renamed");
      expect(mockIssueService.update).toHaveBeenCalledWith(ISSUE_ID, expect.objectContaining({ title: "Renamed" }));
    });

    it("returns 404 when patching a non-existent issue", async () => {
      mockIssueService.getById.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).patch(`/api/issues/${randomUUID()}`).send({ title: "x" });
      expect(res.status).toBe(404);
    });

    it("blocks transition to in_progress when blockers are not done", async () => {
      mockIssueService.getById.mockResolvedValue({
        ...MOCK_ISSUE,
        status: "todo",
        dependsOn: ["blocker-1"],
      });
      mockIssueService.getBlockers.mockResolvedValue([
        { id: "blocker-1", identifier: "TST-99", status: "in_progress" },
      ]);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).patch(`/api/issues/${ISSUE_ID}`).send({ status: "in_progress" });

      expect(res.status).toBe(422);
      expect(res.body.error).toContain("Blocked by");
    });
  });

  describe("DELETE /api/issues/:id", () => {
    it("deletes an issue and returns the removed record", async () => {
      mockIssueService.remove.mockResolvedValue(MOCK_ISSUE);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).delete(`/api/issues/${ISSUE_ID}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: ISSUE_ID });
      expect(mockIssueService.remove).toHaveBeenCalledWith(ISSUE_ID);
    });

    it("returns 404 when deleting a non-existent issue", async () => {
      mockIssueService.getById.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).delete(`/api/issues/${randomUUID()}`);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/issues/:id/comments", () => {
    it("lists comments for an issue", async () => {
      const comments = [
        { id: randomUUID(), issueId: ISSUE_ID, body: "Looks good", createdAt: new Date().toISOString() },
      ];
      mockIssueService.listComments.mockResolvedValue(comments);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/issues/${ISSUE_ID}/comments`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].body).toBe("Looks good");
    });

    it("returns 404 when issue does not exist", async () => {
      mockIssueService.getById.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/issues/${randomUUID()}/comments`);
      expect(res.status).toBe(404);
    });

    it("forwards pagination params (limit, order, after) to service", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const cursorId = randomUUID();
      await request(app).get(`/api/issues/${ISSUE_ID}/comments`).query({ limit: "10", order: "asc", after: cursorId });

      expect(mockIssueService.listComments).toHaveBeenCalledWith(
        ISSUE_ID,
        expect.objectContaining({ afterCommentId: cursorId, order: "asc", limit: 10 }),
      );
    });
  });

  describe("POST /api/issues/:id/comments", () => {
    it("adds a comment to an issue", async () => {
      const COMMENT_ID = randomUUID();
      mockIssueService.addComment.mockResolvedValue({
        id: COMMENT_ID,
        issueId: ISSUE_ID,
        body: "New comment",
      });
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post(`/api/issues/${ISSUE_ID}/comments`).send({ body: "New comment" });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: COMMENT_ID, body: "New comment" });
    });

    it("rejects empty body via Zod validation", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post(`/api/issues/${ISSUE_ID}/comments`).send({ body: "" });
      expect(res.status).toBe(400);
    });

    it("returns 404 when issue does not exist", async () => {
      mockIssueService.getById.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post(`/api/issues/${randomUUID()}/comments`).send({ body: "hi" });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/companies/:companyId/labels", () => {
    it("lists labels for a company", async () => {
      mockIssueService.listLabels.mockResolvedValue([{ id: "l1", companyId: COMPANY_ID, name: "bug", color: "#f00" }]);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/labels`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe("bug");
    });

    it("rejects label list across companies with 403", async () => {
      const otherCompany = randomUUID();
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${otherCompany}/labels`);
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/companies/:companyId/labels", () => {
    it("creates a new label", async () => {
      const LABEL = { id: "lbl-1", companyId: COMPANY_ID, name: "feature", color: "#00aa00" };
      mockIssueService.createLabel.mockResolvedValue(LABEL);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/labels`)
        .send({ name: "feature", color: "#00aa00" });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: "feature", color: "#00aa00" });
    });

    it("rejects label creation without name (Zod)", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post(`/api/companies/${COMPANY_ID}/labels`).send({});
      expect(res.status).toBe(400);
    });
  });
});

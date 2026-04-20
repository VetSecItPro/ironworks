import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock data ───────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();
const PROJECT_ID = randomUUID();
const WORKSPACE_ID = randomUUID();

const MOCK_PROJECT = {
  id: PROJECT_ID,
  companyId: COMPANY_ID,
  name: "Ironworks Core",
  shortName: "ironworks-core",
  description: "Core platform project",
  status: "active",
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_WORKSPACE = {
  id: WORKSPACE_ID,
  projectId: PROJECT_ID,
  name: "main",
  cwd: "/opt/projects/ironworks",
  isPrimary: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── Service mocks ───────────────────────────────────────────────────────────

const mockProjectService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  resolveByReference: vi.fn(),
  listWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  removeWorkspace: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());
const mockGenerateClientUpdate = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", async () => {
  const { makeFullServicesMock } = await import("./helpers/mock-services.js");
  return makeFullServicesMock({
    projectService: () => mockProjectService,
    logActivity: mockLogActivity,
    generateClientUpdate: mockGenerateClientUpdate,
  });
});

vi.mock("../services/activity-log.js", () => ({
  logActivity: mockLogActivity,
  setPluginEventBus: vi.fn(),
}));

vi.mock("../services/playbook-execution.js", () => ({
  ensureLibraryProjectFolderExternal: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../middleware/validate.js", () => ({
  validate: () => (req: any, _res: any, next: any) => next(),
}));

// ── App builder ─────────────────────────────────────────────────────────────

async function createApp(actor: Record<string, unknown>) {
  const { projectRoutes } = await import("../routes/projects.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  const fakeDb = {} as any;
  app.use("/api", projectRoutes(fakeDb));
  app.use(errorHandler);
  return app;
}

function boardUser(userId: string, companyIds: string[], isInstanceAdmin = false) {
  return { type: "board", userId, companyIds, isInstanceAdmin, source: "session" };
}

function noActor() {
  return { type: "none" };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("project routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectService.list.mockResolvedValue([MOCK_PROJECT]);
    mockProjectService.getById.mockResolvedValue(MOCK_PROJECT);
    mockProjectService.create.mockResolvedValue(MOCK_PROJECT);
    mockProjectService.update.mockResolvedValue(MOCK_PROJECT);
    mockProjectService.remove.mockResolvedValue(MOCK_PROJECT);
    mockProjectService.listWorkspaces.mockResolvedValue([MOCK_WORKSPACE]);
    mockProjectService.createWorkspace.mockResolvedValue(MOCK_WORKSPACE);
    mockProjectService.updateWorkspace.mockResolvedValue(MOCK_WORKSPACE);
    mockProjectService.removeWorkspace.mockResolvedValue(MOCK_WORKSPACE);
    mockLogActivity.mockResolvedValue(undefined);
  });

  describe("GET /api/companies/:companyId/projects", () => {
    it("lists projects for authorized user", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/projects`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ name: "Ironworks Core" });
    });

    it("rejects unauthenticated requests with 401", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/projects`);
      expect(res.status).toBe(401);
    });

    it("rejects cross-company access with 403", async () => {
      const otherCompany = randomUUID();
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${otherCompany}/projects`);
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/projects/:id", () => {
    it("returns project by ID", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/projects/${PROJECT_ID}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: PROJECT_ID, name: "Ironworks Core" });
    });

    it("returns 404 for non-existent project", async () => {
      mockProjectService.getById.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/projects/${randomUUID()}`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/companies/:companyId/projects", () => {
    it("creates a project for authorized user", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/projects`)
        .send({ name: "Ironworks Core", description: "Core platform" });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: "Ironworks Core" });
      expect(mockLogActivity).toHaveBeenCalled();
    });

    it("rejects unauthenticated create with 401", async () => {
      const app = await createApp(noActor());
      const res = await request(app).post(`/api/companies/${COMPANY_ID}/projects`).send({ name: "Test" });
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/projects/:id", () => {
    it("updates a project", async () => {
      const updated = { ...MOCK_PROJECT, name: "Ironworks Pro" };
      mockProjectService.update.mockResolvedValue(updated);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).patch(`/api/projects/${PROJECT_ID}`).send({ name: "Ironworks Pro" });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Ironworks Pro");
    });

    it("supports archiving via archivedAt date string", async () => {
      const archived = { ...MOCK_PROJECT, archivedAt: new Date().toISOString() };
      mockProjectService.update.mockResolvedValue(archived);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}`)
        .send({ archivedAt: new Date().toISOString() });

      expect(res.status).toBe(200);
      expect(mockProjectService.update).toHaveBeenCalled();
    });

    it("returns 404 for non-existent project update", async () => {
      mockProjectService.getById.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).patch(`/api/projects/${randomUUID()}`).send({ name: "Updated" });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/projects/:id", () => {
    it("deletes a project", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).delete(`/api/projects/${PROJECT_ID}`);

      expect(res.status).toBe(200);
      expect(mockProjectService.remove).toHaveBeenCalledWith(PROJECT_ID);
    });

    it("returns 404 for non-existent project", async () => {
      mockProjectService.getById.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).delete(`/api/projects/${randomUUID()}`);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/projects/:id/workspaces", () => {
    it("lists workspaces for a project", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/projects/${PROJECT_ID}/workspaces`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ name: "main", isPrimary: true });
    });
  });

  describe("POST /api/projects/:id/workspaces", () => {
    it("creates a workspace for a project", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/workspaces`)
        .send({ name: "staging", cwd: "/opt/staging" });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: "main" });
    });

    it("rejects shell commands from non-admin users with 403", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID], false));
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/workspaces`)
        .send({ name: "staging", cwd: "/opt/staging", provisionCommand: "rm -rf /" });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("instance admins");
    });
  });

  describe("POST /api/companies/:companyId/projects/:projectId/client-update", () => {
    it("generates a client update report", async () => {
      mockGenerateClientUpdate.mockResolvedValue("## Weekly Update\nAll good.");
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post(`/api/companies/${COMPANY_ID}/projects/${PROJECT_ID}/client-update`);

      expect(res.status).toBe(201);
      expect(res.body.markdown).toContain("Weekly Update");
    });
  });
});

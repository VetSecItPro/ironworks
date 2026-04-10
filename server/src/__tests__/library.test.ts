import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Mock data ───────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();

const MOCK_FILE_META = {
  id: randomUUID(),
  companyId: COMPANY_ID,
  filePath: "shared/reports/test-report.md",
  ownerAgentId: null,
  ownerUserId: USER_ID,
  visibility: "company",
  projectId: null,
  lastModifiedByAgentId: null,
  lastModifiedAt: new Date(),
  createdAt: new Date(),
  sizeBytes: 256,
};

// ── Service mocks ───────────────────────────────────────────────────────────

const mockLibraryService = vi.hoisted(() => ({
  getFileByPath: vi.fn(),
  getFileEvents: vi.fn().mockResolvedValue([]),
  getFileContributors: vi.fn().mockResolvedValue([]),
  registerFile: vi.fn(),
  registerFileWithEvent: vi.fn(),
}));

const mockResolveVisibleOwnerAgentIds = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ seeAll: true, visibleOwnerAgentIds: [] }),
);

const mockGetAgentProjectIds = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("../services/library.js", () => ({
  libraryService: () => mockLibraryService,
}));

vi.mock("../services/org-visibility.js", () => ({
  resolveVisibleOwnerAgentIds: mockResolveVisibleOwnerAgentIds,
  getAgentProjectIds: mockGetAgentProjectIds,
}));

vi.mock("../services/activity-log.js", () => ({
  logActivity: vi.fn(),
  setPluginEventBus: vi.fn(),
}));

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Mock fs to avoid real filesystem access
const mockFs = vi.hoisted(() => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ default: mockFs }));

vi.mock("../home-paths.js", () => ({
  resolveIronworksInstanceRoot: () => "/tmp/test-ironworks",
}));

// ── App builder ─────────────────────────────────────────────────────────────

async function createApp(actor: Record<string, unknown>) {
  const { libraryRoutes } = await import("../routes/library.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  const fakeDb = {} as any;
  app.use("/api", libraryRoutes(fakeDb));
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

describe("library routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLibraryService.getFileByPath.mockResolvedValue(null);
  });

  describe("GET /api/companies/:companyId/library/tree", () => {
    it("returns directory listing for authorized user", async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true });
      mockFs.readdir.mockResolvedValue([
        { name: "shared", isDirectory: () => true },
        { name: "agents", isDirectory: () => true },
      ]);
      // stat for each entry
      mockFs.stat
        .mockResolvedValueOnce({ isDirectory: () => true }) // target dir
        .mockResolvedValueOnce({ size: 0, mtime: new Date() }) // shared
        .mockResolvedValueOnce({ size: 0, mtime: new Date() }); // agents

      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/library/tree`);

      expect(res.status).toBe(200);
      expect(res.body.path).toBe("/");
      expect(res.body.entries).toBeDefined();
    });

    it("rejects unauthenticated requests with 401", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/library/tree`);
      expect(res.status).toBe(401);
    });

    it("rejects cross-company access with 403", async () => {
      const otherCompany = randomUUID();
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${otherCompany}/library/tree`);
      expect(res.status).toBe(403);
    });

    it("rejects path traversal with 400", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(
        `/api/companies/${COMPANY_ID}/library/tree?path=../../etc`,
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent directory", async () => {
      mockFs.stat.mockRejectedValue(new Error("ENOENT"));
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(
        `/api/companies/${COMPANY_ID}/library/tree?path=nonexistent`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/companies/:companyId/library/file", () => {
    it("returns file content for authorized user", async () => {
      mockFs.stat.mockResolvedValue({ isFile: () => true, size: 100, mtime: new Date() });
      mockFs.readFile.mockResolvedValue("# Test Content");

      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(
        `/api/companies/${COMPANY_ID}/library/file?path=shared/test.md`,
      );

      expect(res.status).toBe(200);
      expect(res.body.content).toBe("# Test Content");
      expect(res.body.name).toBe("test.md");
    });

    it("rejects missing path parameter with 400", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/library/file`);
      expect(res.status).toBe(400);
    });

    it("returns null content for files exceeding 2MB", async () => {
      const bigSize = 3 * 1024 * 1024;
      mockFs.stat.mockResolvedValue({ isFile: () => true, size: bigSize, mtime: new Date() });

      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(
        `/api/companies/${COMPANY_ID}/library/file?path=shared/big.bin`,
      );

      expect(res.status).toBe(200);
      expect(res.body.content).toBeNull();
      expect(res.body.error).toContain("too large");
    });
  });

  describe("GET /api/companies/:companyId/library/search", () => {
    it("rejects missing query parameter with 400", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/library/search`);
      expect(res.status).toBe(400);
    });

    it("returns search results for name matches", async () => {
      mockFs.readdir.mockResolvedValue([
        { name: "test-report.md", isDirectory: () => false },
      ]);
      mockFs.stat.mockResolvedValue({ size: 100, mtime: new Date() });

      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(
        `/api/companies/${COMPANY_ID}/library/search?q=test-report`,
      );

      expect(res.status).toBe(200);
      expect(res.body.query).toBe("test-report");
    });
  });

  describe("POST /api/companies/:companyId/library/register", () => {
    it("rejects missing filePath with 400", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/library/register`)
        .send({});
      expect(res.status).toBe(400);
    });
  });
});

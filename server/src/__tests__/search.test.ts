import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock data ───────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();

const MOCK_RESULTS = [
  { title: "Result 1", url: "https://example.com/1", content: "First result", engine: "google" },
  { title: "Result 2", url: "https://example.com/2", content: "Second result", engine: "bing" },
];

// ── Service mocks ───────────────────────────────────────────────────────────

const mockWebSearch = vi.hoisted(() => vi.fn());

vi.mock("../services/web-search.js", () => ({
  webSearch: mockWebSearch,
}));

vi.mock("../services/activity-log.js", () => ({
  logActivity: vi.fn(),
  setPluginEventBus: vi.fn(),
}));

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ── App builder ─────────────────────────────────────────────────────────────

async function createApp(actor: Record<string, unknown>) {
  const { searchRoutes } = await import("../routes/search.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: actor prop is attached to Express Request by middleware but not declared in its TypeScript type
    (req as any).actor = actor;
    next();
  });
  app.use("/api", searchRoutes());
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

describe("search routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWebSearch.mockResolvedValue(MOCK_RESULTS);
  });

  describe("GET /api/companies/:companyId/search", () => {
    it("returns search results for valid query", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/search?q=test+query`);

      expect(res.status).toBe(200);
      expect(res.body.query).toBe("test query");
      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0]).toMatchObject({ title: "Result 1", url: "https://example.com/1" });
    });

    it("rejects unauthenticated requests with 401", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/search?q=test`);
      expect(res.status).toBe(401);
    });

    it("rejects cross-company access with 403", async () => {
      const otherCompany = randomUUID();
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${otherCompany}/search?q=test`);
      expect(res.status).toBe(403);
    });

    it("returns 400 when query param q is missing", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/search`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Missing required query parameter");
    });

    it("returns 400 when q is empty string", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/search?q=`);

      expect(res.status).toBe(400);
    });

    it("returns 400 when q is whitespace only", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/search?q=%20%20`);

      expect(res.status).toBe(400);
    });

    it("passes custom limit to webSearch", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      await request(app).get(`/api/companies/${COMPANY_ID}/search?q=test&limit=10`);

      expect(mockWebSearch).toHaveBeenCalledWith("test", 10);
    });

    it("clamps limit to max 20", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      await request(app).get(`/api/companies/${COMPANY_ID}/search?q=test&limit=100`);

      expect(mockWebSearch).toHaveBeenCalledWith("test", 20);
    });

    it("defaults limit to 5 when not specified", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      await request(app).get(`/api/companies/${COMPANY_ID}/search?q=test`);

      expect(mockWebSearch).toHaveBeenCalledWith("test", 5);
    });

    it("clamps limit to min 1", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      await request(app).get(`/api/companies/${COMPANY_ID}/search?q=test&limit=0`);

      expect(mockWebSearch).toHaveBeenCalledWith("test", 1);
    });

    it("returns empty results when webSearch returns empty", async () => {
      mockWebSearch.mockResolvedValue([]);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/search?q=obscure+query`);

      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([]);
    });
  });
});

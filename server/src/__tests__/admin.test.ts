import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock data ───────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();

const MOCK_COMPANY = {
  id: COMPANY_ID,
  name: "Test Corp",
  issuePrefix: "TC",
  status: "active",
  createdAt: new Date(),
  budgetMonthlyCents: 10000,
  spentMonthlyCents: 5000,
};

// ── DB mock ─────────────────────────────────────────────────────────────────

const mockSelect = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn());
const mockOrderBy = vi.hoisted(() => vi.fn());
const mockLimit = vi.hoisted(() => vi.fn());
const mockGroupBy = vi.hoisted(() => vi.fn());
const mockLeftJoin = vi.hoisted(() => vi.fn());
const mockInnerJoin = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockSet = vi.hoisted(() => vi.fn());
const mockReturning = vi.hoisted(() => vi.fn());
const mockExecute = vi.hoisted(() => vi.fn());
const mockThen = vi.hoisted(() => vi.fn());

function buildChainableQuery(defaultResult: unknown = []) {
  const chain: Record<string, any> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.set = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockReturnValue(chain);
  chain.execute = vi.fn().mockResolvedValue(defaultResult);
  chain.then = vi.fn().mockImplementation((resolve: any) => resolve(defaultResult));
  return chain;
}

const mockLogActivity = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../services/index.js", async () => {
  const { makeFullServicesMock } = await import("./helpers/mock-services.js");
  return makeFullServicesMock({
    logActivity: mockLogActivity,
  });
});

vi.mock("../services/activity-log.js", () => ({
  logActivity: mockLogActivity,
  setPluginEventBus: vi.fn(),
}));

vi.mock("../services/analytics.js", () => ({
  gatherLiveMetrics: vi.fn().mockResolvedValue({
    totalCompanies: 1,
    totalUsers: 2,
    totalAgents: 3,
  }),
}));

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("./support.js", () => ({
  supportAdminRoutes: () => {
    const { Router } = require("express");
    return Router();
  },
}));

// ── App builder ─────────────────────────────────────────────────────────────

async function createApp(actor: Record<string, unknown>) {
  const { adminRoutes } = await import("../routes/admin.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });

  // Build a fake DB that returns empty results for all queries
  const fakeDb = buildChainableQuery([]);
  // Make the db itself callable for select/update/execute
  const dbProxy = new Proxy(fakeDb, {
    get(target, prop) {
      if (prop === "select")
        return (...args: any[]) => {
          const chain = buildChainableQuery([{ count: 0 }]);
          return chain;
        };
      if (prop === "update")
        return (...args: any[]) => {
          const chain = buildChainableQuery([MOCK_COMPANY]);
          return chain;
        };
      if (prop === "execute") return vi.fn().mockResolvedValue([{ size_bytes: 1024 }]);
      return target[prop as string];
    },
  });

  app.use("/api/admin", adminRoutes(dbProxy as any));
  app.use(errorHandler);
  return app;
}

function instanceAdmin(userId: string) {
  return { type: "board", userId, companyIds: [COMPANY_ID], isInstanceAdmin: true, source: "session" };
}

function boardUser(userId: string, companyIds: string[]) {
  return { type: "board", userId, companyIds, isInstanceAdmin: false, source: "session" };
}

function noActor() {
  return { type: "none" };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("admin routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/admin/dashboard", () => {
    it("returns dashboard data for instance admin", async () => {
      const app = await createApp(instanceAdmin(USER_ID));
      const res = await request(app).get("/api/admin/dashboard");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("totalCompanies");
      expect(res.body).toHaveProperty("totalAgents");
      expect(res.body).toHaveProperty("totalUsers");
      expect(res.body).toHaveProperty("agentSuccessRate");
    });

    it("rejects non-admin users with 403", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get("/api/admin/dashboard");
      expect(res.status).toBe(403);
    });

    it("rejects unauthenticated requests with 403", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get("/api/admin/dashboard");
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/admin/companies", () => {
    it("returns company list for instance admin", async () => {
      const app = await createApp(instanceAdmin(USER_ID));
      const res = await request(app).get("/api/admin/companies");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("rejects non-admin users with 403", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get("/api/admin/companies");
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/admin/companies/:id", () => {
    it("rejects invalid UUID format with 400", async () => {
      const app = await createApp(instanceAdmin(USER_ID));
      const res = await request(app).get("/api/admin/companies/not-a-uuid");
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid company ID format");
    });
  });

  describe("GET /api/admin/users", () => {
    it("returns user list for instance admin", async () => {
      const app = await createApp(instanceAdmin(USER_ID));
      const res = await request(app).get("/api/admin/users");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("rejects non-admin users with 403", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get("/api/admin/users");
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/admin/audit-log", () => {
    it("returns audit log entries for instance admin", async () => {
      const app = await createApp(instanceAdmin(USER_ID));
      const res = await request(app).get("/api/admin/audit-log");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("rejects non-admin users with 403", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get("/api/admin/audit-log");
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/admin/analytics/current", () => {
    it("returns live metrics for instance admin", async () => {
      const app = await createApp(instanceAdmin(USER_ID));
      const res = await request(app).get("/api/admin/analytics/current");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("totalCompanies");
    });
  });
});

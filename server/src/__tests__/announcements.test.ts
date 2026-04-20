import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock data ───────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();
const ANNOUNCEMENT_ID = randomUUID();

const MOCK_ANNOUNCEMENT = {
  id: ANNOUNCEMENT_ID,
  companyId: COMPANY_ID,
  slug: "announcement-test-20260408",
  title: "Test Announcement",
  body: "This is a test announcement body.",
  visibility: "company_announcement",
  documentType: "announcement",
  createdByUserId: USER_ID,
  createdByAgentId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── DB mock ─────────────────────────────────────────────────────────────────

function buildChainableQuery(defaultResult: unknown = []) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.values = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.set = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockReturnValue(chain);
  chain.and = vi.fn().mockReturnValue(chain);
  // biome-ignore lint/suspicious/noThenProperty: test mock drizzle thenable contract
  // biome-ignore lint/suspicious/noExplicitAny: vi.fn mock type erasure; pass-through identity function for testing
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

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ── App builder ─────────────────────────────────────────────────────────────

async function createApp(actor: Record<string, unknown>, dbOverrides?: Record<string, unknown>) {
  const { announcementRoutes } = await import("../routes/announcements.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: actor prop is attached to Express Request by middleware but not declared in its TypeScript type
    (req as any).actor = actor;
    next();
  });

  const fakeDb = {
    select: vi.fn().mockImplementation(() => {
      const chain = buildChainableQuery([MOCK_ANNOUNCEMENT]);
      return chain;
    }),
    insert: vi.fn().mockImplementation(() => {
      const chain = buildChainableQuery([MOCK_ANNOUNCEMENT]);
      return chain;
    }),
    update: vi.fn().mockImplementation(() => {
      const chain = buildChainableQuery([MOCK_ANNOUNCEMENT]);
      return chain;
    }),
    ...dbOverrides,
    // biome-ignore lint/suspicious/noExplicitAny: type assertion on mock/test object whose full shape is irrelevant to test logic
  } as any;

  app.use("/api", announcementRoutes(fakeDb));
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

describe("announcement routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/companies/:companyId/announcements", () => {
    it("returns announcements for authorized user", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/announcements`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("rejects unauthenticated requests with 401", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/announcements`);
      expect(res.status).toBe(401);
    });

    it("rejects cross-company access with 403", async () => {
      const otherCompany = randomUUID();
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${otherCompany}/announcements`);
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/companies/:companyId/announcements", () => {
    it("creates an announcement with valid data", async () => {
      // Need to mock select for slug uniqueness check to return empty (no conflict)
      const _selectChain = buildChainableQuery([]);
      const insertChain = buildChainableQuery([MOCK_ANNOUNCEMENT]);
      let selectCallCount = 0;

      const fakeDb = {
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          // First select is the membership check from assertCanWrite, return non-viewer
          if (selectCallCount <= 1) {
            return buildChainableQuery([{ membershipRole: "admin" }]);
          }
          // Subsequent selects are slug uniqueness checks
          return buildChainableQuery([]);
        }),
        insert: vi.fn().mockImplementation(() => insertChain),
        update: vi.fn().mockImplementation(() => buildChainableQuery([])),
      };

      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]), fakeDb);
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/announcements`)
        .send({ title: "New Feature Release", body: "We just shipped a major update." });

      expect(res.status).toBe(201);
    });

    it("rejects missing title with 400", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/announcements`)
        .send({ body: "Body without title" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("title is required");
    });

    it("rejects empty title with 400", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/announcements`)
        .send({ title: "   ", body: "Some body" });

      expect(res.status).toBe(400);
    });

    it("rejects title exceeding 200 characters with 400", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const longTitle = "A".repeat(201);
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/announcements`)
        .send({ title: longTitle, body: "Body" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("200 characters");
    });
  });

  describe("DELETE /api/companies/:companyId/announcements/:id", () => {
    it("archives an announcement for authorized user", async () => {
      // select finds the existing announcement, update archives it
      const fakeDb = {
        select: vi.fn().mockImplementation(() => {
          return buildChainableQuery([{ id: ANNOUNCEMENT_ID, membershipRole: "admin" }]);
        }),
        update: vi.fn().mockImplementation(() => buildChainableQuery([])),
      };

      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]), fakeDb);
      const res = await request(app).delete(`/api/companies/${COMPANY_ID}/announcements/${ANNOUNCEMENT_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("returns 404 for non-existent announcement", async () => {
      const fakeDb = {
        select: vi.fn().mockImplementation(() => {
          return buildChainableQuery([]);
        }),
        update: vi.fn().mockImplementation(() => buildChainableQuery([])),
      };

      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]), fakeDb);
      const res = await request(app).delete(`/api/companies/${COMPANY_ID}/announcements/${randomUUID()}`);

      expect(res.status).toBe(404);
    });

    it("rejects unauthenticated delete with 401", async () => {
      const app = await createApp(noActor());
      const res = await request(app).delete(`/api/companies/${COMPANY_ID}/announcements/${ANNOUNCEMENT_ID}`);
      expect(res.status).toBe(401);
    });
  });
});

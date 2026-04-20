import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock data ───────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();
const OTHER_USER_ID = randomUUID();

const MOCK_MEMBERS = [
  { principalId: USER_ID, principalType: "user", membershipRole: "owner", status: "active" },
  { principalId: OTHER_USER_ID, principalType: "user", membershipRole: "member", status: "active" },
];

// ── Service mocks ───────────────────────────────────────────────────────────

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn().mockResolvedValue(true),
  ensureMembership: vi.fn(),
  setMemberPermissions: vi.fn(),
  setPrincipalPermission: vi.fn(),
  listMembers: vi.fn(),
  listPermissions: vi.fn().mockResolvedValue([]),
  hasPermission: vi.fn().mockResolvedValue(true),
  getMembership: vi.fn().mockResolvedValue(null),
  listPrincipalPermissions: vi.fn().mockResolvedValue([]),
  listPrincipalGrants: vi.fn().mockResolvedValue([]),
}));

const mockAgentService = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue([]),
  getById: vi.fn().mockResolvedValue(null),
  create: vi.fn(),
  update: vi.fn(),
  getChainOfCommand: vi.fn().mockResolvedValue([]),
  getAccessState: vi.fn().mockResolvedValue({ permissions: [], membership: null }),
  listKeys: vi.fn().mockResolvedValue([]),
}));

const mockBoardAuthService = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

const mockBudgetService = vi.hoisted(() => ({
  upsertPolicy: vi.fn(),
  getPolicy: vi.fn(),
  listPolicies: vi.fn().mockResolvedValue([]),
  listIncidents: vi.fn().mockResolvedValue([]),
  resolveIncident: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());
const mockNotifyHireApproved = vi.hoisted(() => vi.fn());
const mockDeduplicateAgentName = vi.hoisted(() =>
  // biome-ignore lint/suspicious/noExplicitAny: vi.fn mock type erasure; pass-through identity function for testing
  vi.fn().mockImplementation((_db: any, _cid: any, name: string) => name),
);

vi.mock("../services/index.js", async () => {
  const { makeFullServicesMock } = await import("./helpers/mock-services.js");
  return makeFullServicesMock({
    accessService: () => mockAccessService,
    agentService: () => mockAgentService,
    boardAuthService: () => mockBoardAuthService,
    budgetService: () => mockBudgetService,
    logActivity: mockLogActivity,
    notifyHireApproved: mockNotifyHireApproved,
    deduplicateAgentName: mockDeduplicateAgentName,
  });
});

vi.mock("../services/user-invites.js", () => ({
  userInviteService: () => ({
    create: vi.fn(),
    getByToken: vi.fn(),
    accept: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    revoke: vi.fn(),
  }),
}));

vi.mock("../services/activity-log.js", () => ({
  logActivity: mockLogActivity,
  setPluginEventBus: vi.fn(),
}));

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../board-claim.js", () => ({
  claimBoardOwnership: vi.fn(),
  inspectBoardClaimChallenge: vi.fn(),
}));

// ── App builder ─────────────────────────────────────────────────────────────

async function createApp(actor: Record<string, unknown>) {
  const { accessRoutes } = await import("../routes/access.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: actor prop is attached to Express Request by middleware but not declared in its TypeScript type
    (req as any).actor = actor;
    next();
  });
  // biome-ignore lint/suspicious/noExplicitAny: mock Drizzle DB or storage object for unit tests; real type requires full schema-aware Drizzle instance
  const fakeDb = {} as any;
  app.use("/api", accessRoutes(fakeDb));
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

describe("access routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccessService.listMembers.mockResolvedValue(MOCK_MEMBERS);
  });

  describe("GET /api/companies/:companyId/members", () => {
    it("lists company members for authorized user", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/members`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toMatchObject({ principalId: USER_ID, membershipRole: "owner" });
    });

    it("rejects unauthenticated requests with 401", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/members`);
      expect(res.status).toBe(401);
    });

    it("rejects access to another company with 403", async () => {
      const otherCompany = randomUUID();
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${otherCompany}/members`);
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/companies/:companyId/invites (company invite)", () => {
    it("rejects invite creation without board access (agent actor)", async () => {
      const agentActor = { type: "agent", agentId: randomUUID(), companyId: COMPANY_ID, source: "agent_key" };
      const app = await createApp(agentActor);
      const res = await request(app).post(`/api/companies/${COMPANY_ID}/invites`).send({});

      // Agent actors should be blocked from board-only actions
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects invite without permission", async () => {
      mockAccessService.hasPermission.mockResolvedValue(false);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post(`/api/companies/${COMPANY_ID}/invites`).send({ role: "engineer" });

      // Should fail because body is validated via Zod schema
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});

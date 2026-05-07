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
  setPrincipalGrants: vi.fn(),
  listMembers: vi.fn(),
  listPermissions: vi.fn().mockResolvedValue([]),
  hasPermission: vi.fn().mockResolvedValue(true),
  getMembership: vi.fn().mockResolvedValue(null),
  getMembershipById: vi.fn().mockResolvedValue(null),
  removeMembership: vi.fn(),
  listPrincipalPermissions: vi.fn().mockResolvedValue([]),
  listPrincipalGrants: vi.fn().mockResolvedValue([]),
  listUserCompanyAccess: vi.fn().mockResolvedValue([]),
  setUserCompanyAccess: vi.fn().mockResolvedValue([]),
  isInstanceAdmin: vi.fn().mockResolvedValue(false),
  promoteInstanceAdmin: vi.fn(),
  demoteInstanceAdmin: vi.fn(),
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
  createCliAuthChallenge: vi.fn(),
  describeCliAuthChallenge: vi.fn(),
  approveCliAuthChallenge: vi.fn(),
  cancelCliAuthChallenge: vi.fn(),
  resolveBoardAccess: vi.fn(),
  resolveBoardActivityCompanyIds: vi.fn().mockResolvedValue([]),
  assertCurrentBoardKey: vi.fn(),
  revokeBoardApiKey: vi.fn(),
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
    mockAccessService.canUser.mockResolvedValue(true);
    mockAccessService.hasPermission.mockResolvedValue(true);
    mockAccessService.isInstanceAdmin.mockResolvedValue(false);
    mockAccessService.listUserCompanyAccess.mockResolvedValue([]);
    mockBoardAuthService.resolveBoardActivityCompanyIds.mockResolvedValue([]);
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

  describe("DELETE /api/companies/:companyId/members/:memberId", () => {
    it("removes a member when caller has permission", async () => {
      const memberId = randomUUID();
      mockAccessService.getMembershipById.mockResolvedValue({
        principalType: "user",
        principalId: OTHER_USER_ID,
      });
      mockAccessService.removeMembership.mockResolvedValue({ id: memberId });
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).delete(`/api/companies/${COMPANY_ID}/members/${memberId}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ removed: true, memberId });
    });

    it("returns 404 when membership does not exist", async () => {
      mockAccessService.getMembershipById.mockResolvedValue(null);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).delete(`/api/companies/${COMPANY_ID}/members/${randomUUID()}`);
      expect(res.status).toBe(404);
    });

    it("blocks self-removal with 409", async () => {
      const memberId = randomUUID();
      mockAccessService.getMembershipById.mockResolvedValue({
        principalType: "user",
        principalId: USER_ID,
      });
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).delete(`/api/companies/${COMPANY_ID}/members/${memberId}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("Cannot remove yourself");
    });

    it("rejects deletion without permission with 403", async () => {
      mockAccessService.canUser.mockResolvedValue(false);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).delete(`/api/companies/${COMPANY_ID}/members/${randomUUID()}`);
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/me/access", () => {
    it("returns instance admin flag and memberships for board user", async () => {
      mockAccessService.isInstanceAdmin.mockResolvedValue(true);
      mockAccessService.listUserCompanyAccess.mockResolvedValue([
        { companyId: COMPANY_ID, membershipRole: "owner", status: "active" },
      ]);
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get("/api/me/access");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        isInstanceAdmin: true,
        memberships: [{ companyId: COMPANY_ID, role: "owner", status: "active" }],
      });
    });

    it("returns empty body for unauthenticated actor", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get("/api/me/access");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ isInstanceAdmin: false, memberships: [] });
    });
  });

  describe("POST /api/admin/users/:userId/promote-instance-admin", () => {
    it("promotes a user when caller is instance admin", async () => {
      mockAccessService.isInstanceAdmin.mockResolvedValue(true);
      mockAccessService.promoteInstanceAdmin.mockResolvedValue({ userId: OTHER_USER_ID });
      const adminActor = {
        type: "board",
        userId: USER_ID,
        companyIds: [COMPANY_ID],
        isInstanceAdmin: true,
        source: "session",
      };
      const app = await createApp(adminActor);
      const res = await request(app).post(`/api/admin/users/${OTHER_USER_ID}/promote-instance-admin`);

      expect(res.status).toBe(201);
      expect(mockAccessService.promoteInstanceAdmin).toHaveBeenCalledWith(OTHER_USER_ID);
    });

    it("rejects non-instance-admin caller with 403", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).post(`/api/admin/users/${OTHER_USER_ID}/promote-instance-admin`);
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/admin/users/:userId/demote-instance-admin", () => {
    it("returns 404 when user is not an instance admin", async () => {
      mockAccessService.isInstanceAdmin.mockResolvedValue(true);
      mockAccessService.demoteInstanceAdmin.mockResolvedValue(null);
      const adminActor = {
        type: "board",
        userId: USER_ID,
        companyIds: [COMPANY_ID],
        isInstanceAdmin: true,
        source: "session",
      };
      const app = await createApp(adminActor);
      const res = await request(app).post(`/api/admin/users/${OTHER_USER_ID}/demote-instance-admin`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/cli-auth/challenges", () => {
    it("creates a CLI auth challenge", async () => {
      const challengeId = randomUUID();
      const expiresAt = new Date(Date.now() + 60_000);
      mockBoardAuthService.createCliAuthChallenge.mockResolvedValue({
        challenge: {
          id: challengeId,
          expiresAt,
          boardApiKeyId: "key-1",
        },
        challengeSecret: "challenge-secret",
        pendingBoardToken: "pending-token",
      });
      const app = await createApp(noActor());
      const res = await request(app)
        .post("/api/cli-auth/challenges")
        .send({ command: "ironworks login", clientName: "test-cli" });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: challengeId,
        token: "challenge-secret",
        boardApiToken: "pending-token",
      });
    });
  });

  describe("GET /api/cli-auth/me", () => {
    it("returns 401 for unauthenticated caller", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get("/api/cli-auth/me");
      expect(res.status).toBe(401);
    });

    it("returns access snapshot for board user", async () => {
      mockBoardAuthService.resolveBoardAccess.mockResolvedValue({
        user: { id: USER_ID, name: "Test" },
        isInstanceAdmin: false,
        companyIds: [COMPANY_ID],
      });
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get("/api/cli-auth/me");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        userId: USER_ID,
        isInstanceAdmin: false,
        companyIds: [COMPANY_ID],
      });
    });
  });

  describe("GET /api/skills/available", () => {
    it("returns 200 (public route, no auth required)", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get("/api/skills/available");
      expect(res.status).toBe(200);
    });
  });
});

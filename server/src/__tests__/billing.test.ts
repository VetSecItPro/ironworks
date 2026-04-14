import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Mock data ───────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();

const MOCK_SUBSCRIPTION = {
  id: randomUUID(),
  companyId: COMPANY_ID,
  planTier: "starter",
  status: "active",
  polarCustomerId: null,
  polarSubscriptionId: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
};

const MOCK_PLAN = {
  name: "Starter",
  priceMonthly: 0,
  agentLimit: 5,
  storageGb: 1,
  projectLimit: 3,
  productId: null,
};

// ── Service mock ────────────────────────────────────────────────────────────

const mockBillingService = vi.hoisted(() => ({
  getOrCreateSubscription: vi.fn(),
  getProjectCount: vi.fn(),
  getStorageUsageBytes: vi.fn(),
  createCheckoutSession: vi.fn(),
  createCustomerPortalSession: vi.fn(),
  handleWebhook: vi.fn(),
}));

const mockVerifyPolarWebhookSignature = vi.hoisted(() => vi.fn());

vi.mock("../services/billing.js", () => ({
  billingService: () => mockBillingService,
  verifyPolarWebhookSignature: mockVerifyPolarWebhookSignature,
  PLAN_DEFINITIONS: {
    starter: { name: "Starter", priceMonthly: 0, agentLimit: 5, storageGb: 1, projectLimit: 3, productId: null },
    growth: { name: "Growth", priceMonthly: 2900, agentLimit: 20, storageGb: 10, projectLimit: 10, productId: "prod_growth" },
    business: { name: "Business", priceMonthly: 9900, agentLimit: 100, storageGb: 50, projectLimit: 50, productId: "prod_business" },
  },
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
  const { billingRoutes, polarWebhookRoute } = await import("../routes/billing.js");
  const { errorHandler } = await import("../middleware/error-handler.js");

  const app = express();
  app.use(express.json({
    verify: (req: any, _res, buf) => { req.rawBody = buf; },
  }));
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  const fakeDb = {} as any;
  app.use("/api", billingRoutes(fakeDb));
  app.use(polarWebhookRoute(fakeDb));
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

describe("billing routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBillingService.getOrCreateSubscription.mockResolvedValue(MOCK_SUBSCRIPTION);
    mockBillingService.getProjectCount.mockResolvedValue(2);
    mockBillingService.getStorageUsageBytes.mockResolvedValue(1024);
  });

  describe("GET /api/companies/:companyId/billing/subscription", () => {
    it("returns subscription and usage for authorized user", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/billing/subscription`);

      expect(res.status).toBe(200);
      expect(res.body.subscription).toMatchObject({ planTier: "starter", status: "active" });
      expect(res.body.plan).toBeDefined();
      expect(res.body.usage).toEqual({ projects: 2, storageBytes: 1024 });
    });

    it("rejects unauthenticated requests with 401", async () => {
      const app = await createApp(noActor());
      const res = await request(app).get(`/api/companies/${COMPANY_ID}/billing/subscription`);
      expect(res.status).toBe(401);
    });

    it("rejects access to another company with 403", async () => {
      const otherCompany = randomUUID();
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app).get(`/api/companies/${otherCompany}/billing/subscription`);
      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/companies/:companyId/billing/checkout", () => {
    it("rejects invalid planTier with 400", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/billing/checkout`)
        .send({ planTier: "invalid_tier", successUrl: "/success", cancelUrl: "/cancel" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid planTier");
    });

    it("rejects missing successUrl/cancelUrl with 400", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/billing/checkout`)
        .send({ planTier: "growth" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("successUrl and cancelUrl are required");
    });

    it("rejects absolute redirect URLs with 400 (open redirect prevention)", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/billing/checkout`)
        .send({ planTier: "growth", successUrl: "https://evil.com", cancelUrl: "/cancel" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("relative paths");
    });

    it("returns checkout URL for valid request", async () => {
      mockBillingService.createCheckoutSession.mockResolvedValue("https://polar.sh/checkout/123");
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/billing/checkout`)
        .send({ planTier: "growth", successUrl: "/success", cancelUrl: "/cancel" });

      expect(res.status).toBe(200);
      expect(res.body.url).toBe("https://polar.sh/checkout/123");
    });

    it("enforces company access authorization", async () => {
      const app = await createApp(noActor());
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/billing/checkout`)
        .send({ planTier: "growth", successUrl: "/success", cancelUrl: "/cancel" });
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/webhooks/polar", () => {
    it("rejects missing webhook headers with 400", async () => {
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post("/api/webhooks/polar")
        .send({ type: "subscription.created" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Missing required Standard Webhooks headers");
    });

    it("rejects invalid signature with 400", async () => {
      mockVerifyPolarWebhookSignature.mockImplementation(() => {
        throw new Error("Invalid signature");
      });
      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post("/api/webhooks/polar")
        .set("webhook-id", "wh_123")
        .set("webhook-timestamp", String(Math.floor(Date.now() / 1000)))
        .set("webhook-signature", "v1,bad_signature")
        .send({ type: "subscription.created" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid signature");
    });

    it("processes valid webhook and returns received: true", async () => {
      const mockEvent = { type: "subscription.updated", data: {} };
      mockVerifyPolarWebhookSignature.mockReturnValue(mockEvent);
      mockBillingService.handleWebhook.mockResolvedValue(undefined);

      const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
      const res = await request(app)
        .post("/api/webhooks/polar")
        .set("webhook-id", "wh_123")
        .set("webhook-timestamp", String(Math.floor(Date.now() / 1000)))
        .set("webhook-signature", "v1,valid_sig")
        .send({ type: "subscription.updated" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(mockBillingService.handleWebhook).toHaveBeenCalledWith(mockEvent);
    });
  });
});

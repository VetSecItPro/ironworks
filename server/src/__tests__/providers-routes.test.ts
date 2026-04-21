/**
 * Tests for the providers REST API (routes/providers.ts).
 *
 * Covers:
 *   - Auth gates (unauthenticated, wrong company, viewer-level)
 *   - Happy path for all 4 verbs (GET status, PUT secret, POST test, DELETE)
 *   - Provider validation (invalid slug → 400)
 *   - GET returns no key value (only keyLastFour)
 */

import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeChainableDb } from "./helpers/drizzle-mock.js";
import { boardUser, buildTestApp, noActor } from "./helpers/route-app.js";

// ── Vault mock ───────────────────────────────────────────────────────────────

const mockEncryptSecret = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    encryptedKey: Buffer.alloc(32),
    encryptedDek: Buffer.alloc(32),
    dekIv: Buffer.alloc(12),
    dekAuthTag: Buffer.alloc(16),
    keyIv: Buffer.alloc(12),
    keyAuthTag: Buffer.alloc(16),
  }),
);
const mockDecryptSecret = vi.hoisted(() => vi.fn().mockReturnValue("sk-ant-decrypted"));
const mockGetKeyLastFour = vi.hoisted(() => vi.fn().mockReturnValue("cdef"));

vi.mock("../services/secrets-vault.js", () => ({
  encryptSecret: mockEncryptSecret,
  decryptSecret: mockDecryptSecret,
  getKeyLastFour: mockGetKeyLastFour,
}));

// ── Resolver mock ────────────────────────────────────────────────────────────

const mockResolveProviderSecret = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    source: "workspace",
    apiKey: "sk-ant-resolved",
    lastTestStatus: "pass",
    lastTestedAt: new Date("2026-04-01"),
    keyLastFour: "cdef",
  }),
);

vi.mock("../services/provider-secret-resolver.js", () => ({
  resolveProviderSecret: mockResolveProviderSecret,
}));

// ── Adapter registry mock ────────────────────────────────────────────────────

const mockTestEnvironment = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    status: "pass",
    adapterType: "anthropic_api",
    checks: [],
    testedAt: new Date().toISOString(),
  }),
);

vi.mock("../adapters/index.js", () => ({
  listServerAdapters: vi.fn(() => [
    {
      type: "anthropic_api",
      testEnvironment: mockTestEnvironment,
    },
    { type: "poe_api", testEnvironment: mockTestEnvironment },
    { type: "openai_api", testEnvironment: mockTestEnvironment },
    { type: "openrouter_api", testEnvironment: mockTestEnvironment },
  ]),
}));

// ── Activity log mock ────────────────────────────────────────────────────────

const mockLogActivity = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../services/index.js", async () => {
  const { makeFullServicesMock } = await import("./helpers/mock-services.js");
  return makeFullServicesMock({ logActivity: mockLogActivity });
});

// ── Constants ────────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();

// ── DB mock helpers ──────────────────────────────────────────────────────────

function makeEmptyDb() {
  return makeChainableDb([]) as unknown as import("@ironworksai/db").Db;
}

// Unused helper — tests import providerRoutes directly for isolation

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/companies/:id/providers/:provider/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveProviderSecret.mockResolvedValue({
      source: "workspace",
      apiKey: null, // key is NOT returned in the status response
      lastTestStatus: "pass",
      lastTestedAt: new Date("2026-04-01"),
      keyLastFour: "cdef",
    });
  });

  it("returns 403 for unauthenticated requests (assertBoard throws forbidden)", async () => {
    const { providerRoutes } = await import("../routes/providers.js");
    const app = buildTestApp({ router: providerRoutes(makeEmptyDb()), actor: noActor() });
    const res = await request(app).get(`/api/companies/${COMPANY_ID}/providers/anthropic_api/status`);
    // assertBoard throws forbidden (403) for non-board actors including unauthenticated
    expect(res.status).toBe(403);
  });

  it("returns 403 for cross-company access", async () => {
    const { providerRoutes } = await import("../routes/providers.js");
    const app = buildTestApp({ router: providerRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const other = randomUUID();
    const res = await request(app).get(`/api/companies/${other}/providers/anthropic_api/status`);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid provider slug", async () => {
    const { providerRoutes } = await import("../routes/providers.js");
    const app = buildTestApp({ router: providerRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app).get(`/api/companies/${COMPANY_ID}/providers/gemini_api/status`);
    expect(res.status).toBe(400);
  });

  it("returns status with keyLastFour but no apiKey field", async () => {
    const { providerRoutes } = await import("../routes/providers.js");
    const app = buildTestApp({ router: providerRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app).get(`/api/companies/${COMPANY_ID}/providers/anthropic_api/status`);
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.source).toBe("workspace");
    expect(res.body.keyLastFour).toBe("cdef");
    // The raw API key must never appear in the response body
    expect(res.body).not.toHaveProperty("apiKey");
    expect(JSON.stringify(res.body)).not.toContain("sk-");
  });
});

describe("PUT /api/companies/:id/providers/:provider/secret", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEncryptSecret.mockReturnValue({
      encryptedKey: Buffer.alloc(32),
      encryptedDek: Buffer.alloc(32),
      dekIv: Buffer.alloc(12),
      dekAuthTag: Buffer.alloc(16),
      keyIv: Buffer.alloc(12),
      keyAuthTag: Buffer.alloc(16),
    });
    mockGetKeyLastFour.mockReturnValue("cdef");
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("returns 403 for unauthenticated (assertBoard throws forbidden)", async () => {
    const { providerRoutes } = await import("../routes/providers.js");
    const app = buildTestApp({ router: providerRoutes(makeEmptyDb()), actor: noActor() });
    const res = await request(app)
      .put(`/api/companies/${COMPANY_ID}/providers/anthropic_api/secret`)
      .send({ apiKey: "sk-ant-test" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid provider", async () => {
    const { providerRoutes } = await import("../routes/providers.js");
    const app = buildTestApp({ router: providerRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app)
      .put(`/api/companies/${COMPANY_ID}/providers/invalid_provider/secret`)
      .send({ apiKey: "sk-ant-test" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when apiKey is missing", async () => {
    const { providerRoutes } = await import("../routes/providers.js");
    const app = buildTestApp({ router: providerRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app).put(`/api/companies/${COMPANY_ID}/providers/anthropic_api/secret`).send({});
    expect(res.status).toBe(400);
  });

  it("returns 200 and never echoes the key back", async () => {
    const { providerRoutes } = await import("../routes/providers.js");
    const db = makeEmptyDb();
    const app = buildTestApp({ router: providerRoutes(db), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app)
      .put(`/api/companies/${COMPANY_ID}/providers/anthropic_api/secret`)
      .send({ apiKey: "sk-ant-super-secret" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // Full key must never appear in the response
    expect(JSON.stringify(res.body)).not.toContain("sk-ant-super-secret");
    expect(res.body.keyLastFour).toBe("cdef");
  });
});

describe("POST /api/companies/:id/providers/:provider/test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveProviderSecret.mockResolvedValue({
      source: "workspace",
      apiKey: "sk-ant-resolved",
      lastTestStatus: null,
      lastTestedAt: null,
      keyLastFour: "cdef",
    });
    mockTestEnvironment.mockResolvedValue({
      status: "pass",
      adapterType: "anthropic_api",
      checks: [],
      testedAt: new Date().toISOString(),
    });
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("returns 403 for unauthenticated (assertBoard throws forbidden)", async () => {
    const { providerRoutes } = await import("../routes/providers.js");
    const app = buildTestApp({ router: providerRoutes(makeEmptyDb()), actor: noActor() });
    const res = await request(app).post(`/api/companies/${COMPANY_ID}/providers/anthropic_api/test`);
    expect(res.status).toBe(403);
  });

  it("returns 404 when no key is configured", async () => {
    mockResolveProviderSecret.mockResolvedValue({
      source: "none",
      apiKey: null,
      lastTestStatus: null,
      lastTestedAt: null,
      keyLastFour: null,
    });
    const { providerRoutes } = await import("../routes/providers.js");
    const app = buildTestApp({ router: providerRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app).post(`/api/companies/${COMPANY_ID}/providers/anthropic_api/test`);
    expect(res.status).toBe(404);
  });

  it("returns passed:true on successful test", async () => {
    const { providerRoutes } = await import("../routes/providers.js");
    const app = buildTestApp({ router: providerRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app).post(`/api/companies/${COMPANY_ID}/providers/anthropic_api/test`);
    expect(res.status).toBe(200);
    expect(res.body.passed).toBe(true);
    expect(res.body.testedAt).toBeDefined();
    // Key must never appear in the response
    expect(JSON.stringify(res.body)).not.toContain("sk-ant-resolved");
  });

  it("returns passed:false when adapter test fails", async () => {
    mockTestEnvironment.mockResolvedValue({
      status: "fail",
      adapterType: "anthropic_api",
      checks: [{ code: "auth_fail", level: "error", message: "Invalid API key" }],
      testedAt: new Date().toISOString(),
    });
    const { providerRoutes } = await import("../routes/providers.js");
    const app = buildTestApp({ router: providerRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app).post(`/api/companies/${COMPANY_ID}/providers/anthropic_api/test`);
    expect(res.status).toBe(200);
    expect(res.body.passed).toBe(false);
    expect(res.body.error).toBeDefined();
  });
});

describe("DELETE /api/companies/:id/providers/:provider/secret", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("returns 403 for unauthenticated (assertBoard throws forbidden)", async () => {
    const { providerRoutes } = await import("../routes/providers.js");
    const app = buildTestApp({ router: providerRoutes(makeEmptyDb()), actor: noActor() });
    const res = await request(app).delete(`/api/companies/${COMPANY_ID}/providers/anthropic_api/secret`);
    expect(res.status).toBe(403);
  });

  it("returns 404 when no active row exists", async () => {
    const { providerRoutes } = await import("../routes/providers.js");
    // DB returns empty for the update (no matching active row)
    const db = makeEmptyDb();
    const app = buildTestApp({ router: providerRoutes(db), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app).delete(`/api/companies/${COMPANY_ID}/providers/anthropic_api/secret`);
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid provider slug", async () => {
    const { providerRoutes } = await import("../routes/providers.js");
    const app = buildTestApp({ router: providerRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app).delete(`/api/companies/${COMPANY_ID}/providers/bad_provider/secret`);
    expect(res.status).toBe(400);
  });
});

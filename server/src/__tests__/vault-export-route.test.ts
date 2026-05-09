import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const COMPANY_ID = randomUUID();
const OTHER_COMPANY_ID = randomUUID();
const USER_ID = randomUUID();

const mockCompanyService = vi.hoisted(() => ({
  list: vi.fn(),
  stats: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  ensureMembership: vi.fn(),
}));

// streamVaultExport is mocked: it writes the headers + a real zip-magic
// preamble to the response so the route test can assert on Content-Type,
// Content-Disposition, and the leading zip bytes without spinning up the
// full DB-backed renderer chain (covered by service-level tests).
const mockStreamVaultExport = vi.hoisted(() =>
  vi.fn(async (_deps: unknown, args: { companyName: string; res: import("express").Response }) => {
    const safe = args.companyName.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || "vault";
    const datePart = new Date().toISOString().slice(0, 10);
    args.res.setHeader("Content-Type", "application/zip");
    args.res.setHeader("Content-Disposition", `attachment; filename="${safe}-vault-${datePart}.zip"`);
    // Real PKZip local file header magic: 50 4B 03 04
    args.res.end(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]));
    return { knowledge: 0, agents: 0, issues: 0, skills: 0, decisions: 0, costRollups: 0 };
  }),
);

vi.mock("../services/vault-export/index.js", () => ({
  streamVaultExport: mockStreamVaultExport,
}));

vi.mock("../services/index.js", async () => {
  const { makeFullServicesMock } = await import("./helpers/mock-services.js");
  return makeFullServicesMock({
    accessService: () => mockAccessService,
    agentService: () => mockAgentService,
    budgetService: () => ({ upsertPolicy: vi.fn() }),
    companyPortabilityService: () => ({}),
    companyService: () => mockCompanyService,
    logActivity: vi.fn(),
    playbookService: () => ({ seedDefaults: vi.fn() }),
  });
});

vi.mock("../middleware/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

async function createApp(actor: Record<string, unknown> | null) {
  const { companyRoutes } = await import("../routes/companies.js");
  const { errorHandler } = await import("../middleware/index.js");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // biome-ignore lint/suspicious/noExplicitAny: actor attached at runtime by middleware
    (req as any).actor = actor ?? { type: "none" };
    next();
  });
  // biome-ignore lint/suspicious/noExplicitAny: stub Drizzle DB; queries are mocked
  app.use("/api/companies", companyRoutes({} as any));
  app.use(errorHandler);
  return app;
}

function boardUser(userId: string, companyIds: string[]) {
  return { type: "board", userId, companyIds, isInstanceAdmin: false, source: "session" };
}

describe("GET /api/companies/:companyId/vault-export.zip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompanyService.getById.mockImplementation(async (id: string) => {
      if (id === COMPANY_ID) return { id: COMPANY_ID, name: "Acme Corp" };
      return null;
    });
  });

  it("returns 200 with application/zip + Content-Disposition + zip magic bytes", async () => {
    const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
    const res = await request(app)
      .get(`/api/companies/${COMPANY_ID}/vault-export.zip`)
      .buffer(true)
      .parse((response, cb) => {
        const chunks: Buffer[] = [];
        response.on("data", (c: Buffer) => chunks.push(c));
        response.on("end", () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="/);
    expect(res.headers["content-disposition"]).toMatch(/\.zip"$/);

    const body = res.body as Buffer;
    // PK\x03\x04 — local file header magic
    expect(body[0]).toBe(0x50);
    expect(body[1]).toBe(0x4b);
    expect(body[2]).toBe(0x03);
    expect(body[3]).toBe(0x04);
  });

  it("Content-Disposition filename includes a YYYY-MM-DD date", async () => {
    const app = await createApp(boardUser(USER_ID, [COMPANY_ID]));
    const res = await request(app).get(`/api/companies/${COMPANY_ID}/vault-export.zip`);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/\d{4}-\d{2}-\d{2}\.zip"$/);
  });

  it("returns 404 on non-existent company", async () => {
    const app = await createApp(boardUser(USER_ID, [randomUUID(), COMPANY_ID]));
    const missingId = randomUUID();
    // Actor must be allowed to access the id to reach the lookup; grant it.
    const app2 = await createApp({ ...boardUser(USER_ID, [missingId]) });
    const res = await request(app2).get(`/api/companies/${missingId}/vault-export.zip`);
    expect(res.status).toBe(404);
    expect(mockStreamVaultExport).not.toHaveBeenCalled();
    void app;
  });

  it("returns 403 when board actor lacks company access", async () => {
    const app = await createApp(boardUser(USER_ID, [OTHER_COMPANY_ID]));
    const res = await request(app).get(`/api/companies/${COMPANY_ID}/vault-export.zip`);
    expect(res.status).toBe(403);
    expect(mockStreamVaultExport).not.toHaveBeenCalled();
  });

  it("returns 401 when no actor is authenticated", async () => {
    const app = await createApp(null);
    const res = await request(app).get(`/api/companies/${COMPANY_ID}/vault-export.zip`);
    expect(res.status).toBe(401);
    expect(mockStreamVaultExport).not.toHaveBeenCalled();
  });
});

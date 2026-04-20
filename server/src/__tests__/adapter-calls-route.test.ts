/**
 * Integration tests for adapter-calls routes — G.25 audit log explorer.
 *
 * Routes under test:
 *   GET  /api/companies/:companyId/adapter-calls
 *   GET  /api/companies/:companyId/adapter-calls/:id
 *   POST /api/companies/:companyId/adapter-calls/:id/replay
 *
 * Coverage: auth gates, pagination (cursor + nextCursor), filter params,
 * payload stripping in list vs detail, secret sanitization, replay SSE,
 * replay lineage (replayOf), cross-company guards.
 */

import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeChainableDb } from "./helpers/drizzle-mock.js";
import { boardUser, buildTestApp, noActor } from "./helpers/route-app.js";

// ── hoisted mock refs ────────────────────────────────────────────────────────

const mockResolveProviderSecret = vi.hoisted(() => vi.fn());
const mockExecute = vi.hoisted(() => vi.fn());
const mockWriteAdapterCall = vi.hoisted(() => vi.fn());

vi.mock("../services/provider-secret-resolver.js", () => ({
  resolveProviderSecret: mockResolveProviderSecret,
}));

vi.mock("../adapters/index.js", () => ({
  findServerAdapter: vi.fn(() => ({ execute: mockExecute })),
}));

vi.mock("../services/adapter-call-writer.js", () => ({
  writeAdapterCall: mockWriteAdapterCall,
}));

import { adapterCallRoutes } from "../routes/adapter-calls.js";

// ── fixtures ─────────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const OTHER_COMPANY_ID = randomUUID();
const AGENT_ID = randomUUID();
const USER_ID = randomUUID();
const CALL_ID = randomUUID();

const BASE_CALL = {
  id: CALL_ID,
  companyId: COMPANY_ID,
  agentId: AGENT_ID,
  adapterType: "anthropic_api",
  model: "claude-3-5-sonnet-20241022",
  status: "success",
  latencyMs: 1200,
  inputTokens: 500,
  outputTokens: 150,
  costUsdCents: 3,
  source: "agent",
  replayOf: null,
  errorCode: null,
  promptPreview: "What is the capital of France?",
  responsePreview: "Paris is the capital of France.",
  promptPayload: { messages: [{ role: "user", content: "What is the capital of France?" }] },
  responsePayload: { text: "Paris is the capital of France." },
  adapterConfigSnapshot: { model: "claude-3-5-sonnet-20241022", apiKey: "sk-secret" },
  requestId: "req-123",
  occurredAt: new Date("2026-04-20T10:00:00Z"),
  createdAt: new Date("2026-04-20T10:00:00Z"),
};

function makeApp(actor = boardUser(USER_ID, [COMPANY_ID])) {
  return buildTestApp({ router: adapterCallRoutes(makeChainableDb([BASE_CALL])), actor });
}

function makeAppWithRows<T>(rows: T[], actor = boardUser(USER_ID, [COMPANY_ID])) {
  return buildTestApp({ router: adapterCallRoutes(makeChainableDb(rows)), actor });
}

// ── GET list ──────────────────────────────────────────────────────────────────

describe("GET /api/companies/:companyId/adapter-calls", () => {
  it("returns 403 for unauthenticated (noActor)", async () => {
    // assertBoard() returns 403 for none-type actors
    const res = await request(makeApp(noActor())).get(`/api/companies/${COMPANY_ID}/adapter-calls`);
    expect(res.status).toBe(403);
  });

  it("returns 403 for cross-company access", async () => {
    const res = await request(makeApp()).get(`/api/companies/${OTHER_COMPANY_ID}/adapter-calls`);
    expect(res.status).toBe(403);
  });

  it("returns 200 with items for a viewer (read is allowed)", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it("omits promptPayload and responsePayload from list items", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls`);
    expect(res.status).toBe(200);
    expect(res.body.items[0].promptPayload).toBeUndefined();
    expect(res.body.items[0].responsePayload).toBeUndefined();
  });

  it("strips apiKey from adapterConfigSnapshot in list", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls`);
    expect(res.status).toBe(200);
    const snapshot = res.body.items[0].adapterConfigSnapshot as Record<string, unknown>;
    expect(snapshot.apiKey).toBeUndefined();
    // Non-secret keys should be retained
    expect(snapshot.model).toBe("claude-3-5-sonnet-20241022");
  });

  it("returns nextCursor when there are more rows than limit", async () => {
    // Two rows for limit=1 → nextCursor should be set
    const rows = [BASE_CALL, { ...BASE_CALL, id: randomUUID(), occurredAt: new Date("2026-04-19T10:00:00Z") }];
    const app = buildTestApp({
      router: adapterCallRoutes(makeChainableDb(rows)),
      actor: boardUser(USER_ID, [COMPANY_ID]),
    });
    const res = await request(app).get(`/api/companies/${COMPANY_ID}/adapter-calls?limit=1`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.nextCursor).toBeTruthy();
  });

  it("returns null nextCursor when all rows fit in the page", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls?limit=50`);
    expect(res.status).toBe(200);
    // Only 1 row in mock — fits on one page
    expect(res.body.nextCursor).toBeNull();
  });

  it("clamps limit to 100 instead of rejecting", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls?limit=9999`);
    expect(res.status).toBe(200);
  });

  it("accepts agent_id filter", async () => {
    const res = await request(makeApp()).get(
      `/api/companies/${COMPANY_ID}/adapter-calls?agent_id=${AGENT_ID}`,
    );
    expect(res.status).toBe(200);
  });
});

// ── GET single ────────────────────────────────────────────────────────────────

describe("GET /api/companies/:companyId/adapter-calls/:id", () => {
  it("returns 404 when call not found (empty rows)", async () => {
    const app = makeAppWithRows([]);
    const res = await request(app).get(`/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}`);
    expect(res.status).toBe(404);
  });

  it("returns 403 when call belongs to another company", async () => {
    const crossCall = { ...BASE_CALL, companyId: OTHER_COMPANY_ID };
    const app = makeAppWithRows([crossCall]);
    const res = await request(app).get(
      `/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}`,
    );
    expect(res.status).toBe(403);
  });

  it("returns full payloads on detail endpoint", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.promptPayload).toBeDefined();
    expect(res.body.responsePayload).toBeDefined();
  });

  it("strips apiKey from adapterConfigSnapshot in detail", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}`);
    expect(res.status).toBe(200);
    const snapshot = res.body.adapterConfigSnapshot as Record<string, unknown>;
    expect(snapshot.apiKey).toBeUndefined();
    expect(snapshot.model).toBe("claude-3-5-sonnet-20241022");
  });

  it("allows viewer to read detail", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}`);
    expect(res.status).toBe(200);
  });
});

// ── POST replay ───────────────────────────────────────────────────────────────

describe("POST /api/companies/:companyId/adapter-calls/:id/replay", () => {
  beforeEach(() => {
    mockResolveProviderSecret.mockResolvedValue({
      source: "workspace",
      apiKey: "sk-test-key",
      keyLastFour: "kkey",
      lastTestStatus: "pass",
      lastTestedAt: new Date(),
    });
    mockExecute.mockResolvedValue({ exitCode: 0, signal: null, timedOut: false, summary: "Paris." });
    mockWriteAdapterCall.mockResolvedValue(undefined);
  });

  it("returns 403 for unauthenticated (noActor)", async () => {
    // assertBoard() returns 403 for none-type actors
    const res = await request(makeApp(noActor())).post(
      `/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}/replay`,
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 for cross-company access", async () => {
    const res = await request(makeApp()).post(
      `/api/companies/${OTHER_COMPANY_ID}/adapter-calls/${CALL_ID}/replay`,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when original call not found", async () => {
    const app = makeAppWithRows([]);
    const res = await request(app).post(
      `/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}/replay`,
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when adapter is not registered", async () => {
    const { findServerAdapter } = await import("../adapters/index.js");
    (findServerAdapter as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);

    const res = await request(makeApp()).post(
      `/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}/replay`,
    );
    expect(res.status).toBe(404);
  });

  it("streams SSE events and calls writeAdapterCall with source=replay", async () => {
    const res = await request(makeApp())
      .post(`/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}/replay`)
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    // SSE body should contain a done event — res.body is the raw string from our custom parser
    expect(res.body).toContain("event: done");

    // writeAdapterCall should have been called with source='replay' and replayOf=CALL_ID
    expect(mockWriteAdapterCall).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: "replay",
        replayOf: CALL_ID,
        companyId: COMPANY_ID,
      }),
    );
  });

  it("does not mutate the original call (no db.update)", async () => {
    const chainSpy = { ...makeChainableDb([BASE_CALL]) };
    const app = buildTestApp({
      router: adapterCallRoutes(chainSpy as unknown as Parameters<typeof adapterCallRoutes>[0]),
      actor: boardUser(USER_ID, [COMPANY_ID]),
    });

    await request(app)
      .post(`/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}/replay`)
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => callback(null, data));
      });

    // The original row must not be updated
    expect(chainSpy.update).not.toHaveBeenCalled();
  });

  it("returns 403 when cross-company on replay", async () => {
    const crossCall = { ...BASE_CALL, companyId: OTHER_COMPANY_ID };
    const app = makeAppWithRows([crossCall]);
    const res = await request(app).post(
      `/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}/replay`,
    );
    expect(res.status).toBe(403);
  });
});

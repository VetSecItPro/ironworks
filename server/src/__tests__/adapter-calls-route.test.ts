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
 * replay lineage (replayOf), cross-company guards, original immutability.
 */

import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeChainableDb } from "./helpers/drizzle-mock.js";
import { boardUser, buildTestApp, noActor } from "./helpers/route-app.js";

// ── hoisted mock refs ────────────────────────────────────────────────────────

const mockResolveProviderSecret = vi.hoisted(() => vi.fn());
const mockExecute = vi.hoisted(() => vi.fn());
const mockFindServerAdapter = vi.hoisted(() => vi.fn());
const mockWriteAdapterCall = vi.hoisted(() => vi.fn());

vi.mock("../services/provider-secret-resolver.js", () => ({
  resolveProviderSecret: mockResolveProviderSecret,
}));

vi.mock("../adapters/index.js", () => ({
  findServerAdapter: mockFindServerAdapter,
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
    const res = await request(makeApp(noActor())).get(`/api/companies/${COMPANY_ID}/adapter-calls`);
    expect(res.status).toBe(403);
  });

  it("returns 403 for cross-company access", async () => {
    const res = await request(makeApp()).get(`/api/companies/${OTHER_COMPANY_ID}/adapter-calls`);
    expect(res.status).toBe(403);
  });

  it("returns 200 with items for an authenticated viewer", async () => {
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

  it("strips secret keys from adapterConfigSnapshot in list response", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls`);
    expect(res.status).toBe(200);
    const snapshot = res.body.items[0].adapterConfigSnapshot as Record<string, unknown>;
    // apiKey is in the SNAPSHOT_SECRET_KEYS blocklist — must not appear
    expect(snapshot.apiKey).toBeUndefined();
    // Non-secret keys should be retained
    expect(snapshot.model).toBe("claude-3-5-sonnet-20241022");
  });

  it("returns nextCursor when rows exceed limit", async () => {
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
    expect(res.body.nextCursor).toBeNull();
  });

  it("clamps limit to 100 instead of rejecting out-of-range values", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls?limit=9999`);
    expect(res.status).toBe(200);
  });

  it("accepts and passes agent_id filter", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls?agent_id=${AGENT_ID}`);
    expect(res.status).toBe(200);
  });

  it("accepts status filter", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls?status=success`);
    expect(res.status).toBe(200);
  });

  it("accepts source filter", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls?source=agent`);
    expect(res.status).toBe(200);
  });

  it("accepts adapter_type filter", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls?adapter_type=anthropic_api`);
    expect(res.status).toBe(200);
  });

  it("returns 400 for malformed agent_id (not a UUID)", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls?agent_id=not-a-uuid`);
    expect(res.status).toBe(400);
  });

  it("accepts a cursor query param without erroring", async () => {
    // A valid-looking base64url cursor should not cause a 400
    const fakeCursor = Buffer.from(JSON.stringify({ occurredAt: "2026-04-20T10:00:00Z", id: CALL_ID })).toString(
      "base64url",
    );
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls?cursor=${fakeCursor}`);
    expect(res.status).toBe(200);
  });
});

// ── GET single ────────────────────────────────────────────────────────────────

describe("GET /api/companies/:companyId/adapter-calls/:id", () => {
  it("returns 404 when call is not found", async () => {
    const app = makeAppWithRows([]);
    const res = await request(app).get(`/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}`);
    expect(res.status).toBe(404);
  });

  it("returns 403 when call belongs to another company", async () => {
    const crossCall = { ...BASE_CALL, companyId: OTHER_COMPANY_ID };
    const app = makeAppWithRows([crossCall]);
    const res = await request(app).get(`/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}`);
    expect(res.status).toBe(403);
  });

  it("returns 200 with full payloads on detail endpoint", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.promptPayload).toBeDefined();
    expect(res.body.responsePayload).toBeDefined();
  });

  it("strips secret keys from adapterConfigSnapshot in detail response", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}`);
    expect(res.status).toBe(200);
    const snapshot = res.body.adapterConfigSnapshot as Record<string, unknown>;
    expect(snapshot.apiKey).toBeUndefined();
    expect(snapshot.model).toBe("claude-3-5-sonnet-20241022");
  });

  it("allows a viewer to read detail (read is always allowed)", async () => {
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
    mockExecute.mockResolvedValue({
      exitCode: 0,
      signal: null,
      timedOut: false,
      summary: "Paris is the capital of France.",
    });
    mockFindServerAdapter.mockReturnValue({ execute: mockExecute });
    mockWriteAdapterCall.mockResolvedValue(undefined);
  });

  it("returns 403 for unauthenticated (noActor)", async () => {
    const res = await request(makeApp(noActor())).post(`/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}/replay`);
    expect(res.status).toBe(403);
  });

  it("returns 403 for cross-company access", async () => {
    const res = await request(makeApp()).post(`/api/companies/${OTHER_COMPANY_ID}/adapter-calls/${CALL_ID}/replay`);
    expect(res.status).toBe(403);
  });

  it("returns 404 when original call is not found", async () => {
    const app = makeAppWithRows([]);
    const res = await request(app).post(`/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}/replay`);
    expect(res.status).toBe(404);
  });

  it("returns 404 when adapter is not registered", async () => {
    mockFindServerAdapter.mockReturnValueOnce(null);
    const res = await request(makeApp()).post(`/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}/replay`);
    expect(res.status).toBe(404);
  });

  it("returns 403 for cross-company call on replay", async () => {
    const crossCall = { ...BASE_CALL, companyId: OTHER_COMPANY_ID };
    const app = makeAppWithRows([crossCall]);
    const res = await request(app).post(`/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}/replay`);
    expect(res.status).toBe(403);
  });

  it("streams SSE and emits a done event", async () => {
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
    expect(res.body).toContain("event: done");
  });

  it("calls writeAdapterCall with source=replay and replayOf pointing at original", async () => {
    await request(makeApp())
      .post(`/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}/replay`)
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => callback(null, data));
      });

    expect(mockWriteAdapterCall).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: "replay",
        replayOf: CALL_ID,
        companyId: COMPANY_ID,
      }),
    );
  });

  it("does not call db.update — original call is immutable", async () => {
    // Use a fresh chainable and verify update is never called
    const chainDb = makeChainableDb([BASE_CALL]);
    const app = buildTestApp({
      router: adapterCallRoutes(chainDb as unknown as Parameters<typeof adapterCallRoutes>[0]),
      actor: boardUser(USER_ID, [COMPANY_ID]),
    });

    await request(app)
      .post(`/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}/replay`)
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => callback(null, data));
      });

    expect(chainDb.update).not.toHaveBeenCalled();
  });

  it("returns 422 when no API key is configured for the provider", async () => {
    mockResolveProviderSecret.mockResolvedValueOnce({
      source: "none",
      apiKey: null,
    });
    const res = await request(makeApp()).post(`/api/companies/${COMPANY_ID}/adapter-calls/${CALL_ID}/replay`);
    expect(res.status).toBe(422);
  });
});

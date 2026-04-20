/**
 * Tests for the adapter playground route.
 *
 * Route: POST /companies/:companyId/providers/:provider/playground
 *
 * Streams SSE chunks from a real adapter execute() call (mocked transport)
 * back to the caller as Server-Sent Events. Only owners and operators may call
 * it — viewers and unauthenticated requests are rejected.
 *
 * These tests cover:
 *   - Auth gates (unauthenticated, viewer role, cross-company)
 *   - Invalid provider slug → 400
 *   - No key configured → 404
 *   - Happy path: SSE frames emitted in order, final cost/usage payload
 *   - Adapter error mid-stream: graceful SSE error event
 *   - Invalid body (missing prompt) → 400
 */

import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeChainableDb } from "./helpers/drizzle-mock.js";
import { boardUser, buildTestApp, noActor } from "./helpers/route-app.js";

// ── Resolver mock ─────────────────────────────────────────────────────────────

const mockResolveProviderSecret = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    source: "workspace",
    apiKey: "sk-ant-test-key",
    lastTestStatus: "pass",
    lastTestedAt: new Date("2026-04-01"),
    keyLastFour: "tkey",
  }),
);

vi.mock("../services/provider-secret-resolver.js", () => ({
  resolveProviderSecret: mockResolveProviderSecret,
}));

// ── Adapter execute mock ──────────────────────────────────────────────────────

/**
 * Captured onLog calls so tests can assert the text streamed to the client.
 * The playground route calls ctx.onLog as SSE data events.
 */
let _capturedLogs: { channel: string; text: string }[] = [];

const mockExecute = vi.hoisted(() =>
  vi.fn(async (ctx: { onLog: (ch: string, t: string) => Promise<void>; onMeta?: (m: unknown) => Promise<void> }) => {
    // Simulate streaming: emit text deltas then return final usage
    await ctx.onLog("stdout", "Hello");
    await ctx.onLog("stdout", " world");
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      usage: { inputTokens: 10, outputTokens: 5 },
      costUsd: 0.00015,
    };
  }),
);

vi.mock("../adapters/index.js", () => ({
  findServerAdapter: vi.fn((type: string) => {
    if (["poe_api", "anthropic_api", "openai_api", "openrouter_api"].includes(type)) {
      return {
        type,
        execute: mockExecute,
        models: [{ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" }],
      };
    }
    return null;
  }),
  listServerAdapters: vi.fn(() => []),
}));

// ── Activity log mock ─────────────────────────────────────────────────────────

const mockLogActivity = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../services/index.js", async () => {
  const { makeFullServicesMock } = await import("./helpers/mock-services.js");
  return makeFullServicesMock({ logActivity: mockLogActivity });
});

// ── Membership mock for viewer-role tests ─────────────────────────────────────

const VIEWER_MEMBERSHIP_ROW = vi.hoisted(() => ({
  membershipRole: "viewer",
}));

// ── Constants ─────────────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();

function makeEmptyDb() {
  return makeChainableDb([]) as unknown as import("@ironworksai/db").Db;
}

function makeDbWithViewerMembership() {
  return makeChainableDb([VIEWER_MEMBERSHIP_ROW]) as unknown as import("@ironworksai/db").Db;
}

// ─── SSE response parser ──────────────────────────────────────────────────────
// Parses the raw SSE text body into typed event objects for assertions.

interface SseEvent {
  event?: string;
  data: string;
}

function parseSseBody(body: string): SseEvent[] {
  const events: SseEvent[] = [];
  const blocks = body.split("\n\n").filter((b) => b.trim().length > 0);
  for (const block of blocks) {
    const lines = block.split("\n");
    let event: string | undefined;
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (data) events.push({ event, data });
  }
  return events;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/companies/:id/providers/:provider/playground", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _capturedLogs = [];
    mockResolveProviderSecret.mockResolvedValue({
      source: "workspace",
      apiKey: "sk-ant-test-key",
      lastTestStatus: "pass",
      lastTestedAt: new Date("2026-04-01"),
      keyLastFour: "tkey",
    });
    mockExecute.mockImplementation(async (ctx: { onLog: (ch: string, t: string) => Promise<void> }) => {
      await ctx.onLog("stdout", "Hello");
      await ctx.onLog("stdout", " world");
      return {
        exitCode: 0,
        signal: null,
        timedOut: false,
        usage: { inputTokens: 10, outputTokens: 5 },
        costUsd: 0.00015,
      };
    });
  });

  it("returns 403 for unauthenticated requests", async () => {
    const { playgroundRoutes } = await import("../routes/playground.js");
    const app = buildTestApp({ router: playgroundRoutes(makeEmptyDb()), actor: noActor() });
    const res = await request(app)
      .post(`/api/companies/${COMPANY_ID}/providers/anthropic_api/playground`)
      .send({ prompt: "test", model: "claude-sonnet-4-6" });
    expect(res.status).toBe(403);
  });

  it("returns 403 for cross-company access", async () => {
    const { playgroundRoutes } = await import("../routes/playground.js");
    const other = randomUUID();
    const app = buildTestApp({ router: playgroundRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app)
      .post(`/api/companies/${other}/providers/anthropic_api/playground`)
      .send({ prompt: "test", model: "claude-sonnet-4-6" });
    expect(res.status).toBe(403);
  });

  it("returns 403 for viewer-role users (playground is operator+ only)", async () => {
    const { playgroundRoutes } = await import("../routes/playground.js");
    const app = buildTestApp({
      router: playgroundRoutes(makeDbWithViewerMembership()),
      actor: boardUser(USER_ID, [COMPANY_ID]),
    });
    const res = await request(app)
      .post(`/api/companies/${COMPANY_ID}/providers/anthropic_api/playground`)
      .send({ prompt: "test", model: "claude-sonnet-4-6" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid provider slug", async () => {
    const { playgroundRoutes } = await import("../routes/playground.js");
    const app = buildTestApp({ router: playgroundRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app)
      .post(`/api/companies/${COMPANY_ID}/providers/gemini_api/playground`)
      .send({ prompt: "test", model: "gemini-pro" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when prompt is missing", async () => {
    const { playgroundRoutes } = await import("../routes/playground.js");
    const app = buildTestApp({ router: playgroundRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app)
      .post(`/api/companies/${COMPANY_ID}/providers/anthropic_api/playground`)
      .send({ model: "claude-sonnet-4-6" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when model is missing", async () => {
    const { playgroundRoutes } = await import("../routes/playground.js");
    const app = buildTestApp({ router: playgroundRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app)
      .post(`/api/companies/${COMPANY_ID}/providers/anthropic_api/playground`)
      .send({ prompt: "hello" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when no key is configured for the provider", async () => {
    mockResolveProviderSecret.mockResolvedValue({
      source: "none",
      apiKey: null,
      lastTestStatus: null,
      lastTestedAt: null,
      keyLastFour: null,
    });
    const { playgroundRoutes } = await import("../routes/playground.js");
    const app = buildTestApp({ router: playgroundRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app)
      .post(`/api/companies/${COMPANY_ID}/providers/anthropic_api/playground`)
      .send({ prompt: "hello", model: "claude-sonnet-4-6" });
    expect(res.status).toBe(404);
  });

  it("streams SSE events for text deltas and a final done event", async () => {
    const { playgroundRoutes } = await import("../routes/playground.js");
    const app = buildTestApp({ router: playgroundRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app)
      .post(`/api/companies/${COMPANY_ID}/providers/anthropic_api/playground`)
      .send({ prompt: "Say hello", model: "claude-sonnet-4-6" })
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);

    const events = parseSseBody(res.body as string);

    // Must have at least one delta event per text chunk
    const deltaEvents = events.filter((e) => e.event === "delta");
    expect(deltaEvents.length).toBeGreaterThanOrEqual(2);

    const deltaTexts = deltaEvents.map((e) => JSON.parse(e.data).text as string);
    expect(deltaTexts).toContain("Hello");
    expect(deltaTexts).toContain(" world");

    // Must end with a single done event containing usage and cost
    const doneEvents = events.filter((e) => e.event === "done");
    expect(doneEvents).toHaveLength(1);

    const donePayload = JSON.parse(doneEvents[0].data) as {
      usage: { inputTokens: number; outputTokens: number };
      costUsd: number;
    };
    expect(donePayload.usage.inputTokens).toBe(10);
    expect(donePayload.usage.outputTokens).toBe(5);
    expect(donePayload.costUsd).toBeGreaterThan(0);
  });

  it("emits an error SSE event and closes when the adapter execute() throws", async () => {
    mockExecute.mockRejectedValue(new Error("upstream connection refused"));

    const { playgroundRoutes } = await import("../routes/playground.js");
    const app = buildTestApp({ router: playgroundRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app)
      .post(`/api/companies/${COMPANY_ID}/providers/anthropic_api/playground`)
      .send({ prompt: "hello", model: "claude-sonnet-4-6" })
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => callback(null, data));
      });

    expect(res.status).toBe(200); // SSE starts before execute throws — headers already sent
    const events = parseSseBody(res.body as string);
    const errorEvents = events.filter((e) => e.event === "error");
    expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    const errPayload = JSON.parse(errorEvents[0].data) as { message: string };
    expect(errPayload.message).toContain("upstream connection refused");
  });

  it("emits an error SSE event when adapter returns non-zero exitCode", async () => {
    mockExecute.mockResolvedValue({
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "adapter config invalid",
      errorCode: "config_error",
    });

    const { playgroundRoutes } = await import("../routes/playground.js");
    const app = buildTestApp({ router: playgroundRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    const res = await request(app)
      .post(`/api/companies/${COMPANY_ID}/providers/anthropic_api/playground`)
      .send({ prompt: "hello", model: "claude-sonnet-4-6" })
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => callback(null, data));
      });

    expect(res.status).toBe(200);
    const events = parseSseBody(res.body as string);
    const errorEvents = events.filter((e) => e.event === "error");
    expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    const errPayload = JSON.parse(errorEvents[0].data) as { message: string };
    expect(errPayload.message).toContain("adapter config invalid");
  });

  it("forwards temperature and maxTokens to adapter config", async () => {
    const { playgroundRoutes } = await import("../routes/playground.js");
    const app = buildTestApp({ router: playgroundRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });

    await request(app)
      .post(`/api/companies/${COMPANY_ID}/providers/anthropic_api/playground`)
      .send({ prompt: "hello", model: "claude-sonnet-4-6", temperature: 0.7, maxTokens: 512 })
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => callback(null, data));
      });

    // execute() should have been called with context carrying temperature and maxTokens
    expect(mockExecute).toHaveBeenCalledOnce();
    const calledCtx = mockExecute.mock.calls[0][0] as { config: Record<string, unknown> };
    expect(calledCtx.config.temperature).toBe(0.7);
    expect(calledCtx.config.maxTokens).toBe(512);
  });

  it("writes an audit log entry for the playground call", async () => {
    const { playgroundRoutes } = await import("../routes/playground.js");
    const app = buildTestApp({ router: playgroundRoutes(makeEmptyDb()), actor: boardUser(USER_ID, [COMPANY_ID]) });
    await request(app)
      .post(`/api/companies/${COMPANY_ID}/providers/anthropic_api/playground`)
      .send({ prompt: "hello", model: "claude-sonnet-4-6" })
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => callback(null, data));
      });

    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "provider.playground_call",
        entityType: "provider",
      }),
    );
  });
});

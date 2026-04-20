/**
 * Integration tests for cost analytics routes.
 *
 * Routes under test:
 *   GET /api/companies/:companyId/costs/time-series
 *   GET /api/companies/:companyId/costs/leaderboard
 *   GET /api/companies/:companyId/costs/mom
 *
 * Covers: auth gates, parameter validation, response shape, USD unit conversion.
 */

import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeChainableDb } from "./helpers/drizzle-mock.js";
import { boardUser, buildTestApp, noActor } from "./helpers/route-app.js";

const COMPANY_ID = randomUUID();
const AGENT_ID = randomUUID();
const USER_ID = randomUUID();
const TODAY = new Date().toISOString().slice(0, 10);

// ── Service mock ─────────────────────────────────────────────────────────────

const mockTimeSeries = vi.hoisted(() => vi.fn());
const mockLeaderboard = vi.hoisted(() => vi.fn());
const mockMom = vi.hoisted(() => vi.fn());

vi.mock("../services/cost-analytics.js", () => ({
  costAnalyticsService: vi.fn(() => ({
    timeSeries: mockTimeSeries,
    leaderboard: mockLeaderboard,
    mom: mockMom,
  })),
  resolveDateRange: vi.fn(() => ({
    from: new Date("2026-03-22T00:00:00Z"),
    to: new Date("2026-04-20T23:59:59Z"),
  })),
}));

import { costAnalyticsRoutes } from "../routes/cost-analytics.js";

function makeApp(actor = boardUser(USER_ID, [COMPANY_ID])) {
  return buildTestApp({ router: costAnalyticsRoutes(makeChainableDb()), actor });
}

// ── time-series ───────────────────────────────────────────────────────────────

describe("GET /api/companies/:companyId/costs/time-series", () => {
  beforeEach(() => {
    mockTimeSeries.mockResolvedValue([
      {
        day: TODAY,
        agentId: AGENT_ID,
        agentName: "Navigator",
        provider: "anthropic_api",
        source: "agent",
        callCount: 5,
        inputTokens: 1000,
        outputTokens: 500,
        costUsdMicro: 1000,
      },
    ]);
  });

  it("returns 403 when unauthenticated (assertBoard rejects non-board actors)", async () => {
    const res = await request(makeApp(noActor())).get(
      `/api/companies/${COMPANY_ID}/costs/time-series?range=7d`,
    );
    // assertBoard() throws forbidden for any non-board actor, including anonymous
    expect(res.status).toBe(403);
  });

  it("returns 403 when company does not belong to actor", async () => {
    const res = await request(makeApp()).get(
      `/api/companies/${randomUUID()}/costs/time-series?range=7d`,
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid range", async () => {
    const res = await request(makeApp()).get(
      `/api/companies/${COMPANY_ID}/costs/time-series?range=365d`,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid group_by", async () => {
    const res = await request(makeApp()).get(
      `/api/companies/${COMPANY_ID}/costs/time-series?range=7d&group_by=project`,
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 with micro-USD converted to USD", async () => {
    const res = await request(makeApp()).get(
      `/api/companies/${COMPANY_ID}/costs/time-series?range=7d&group_by=agent`,
    );

    expect(res.status).toBe(200);
    expect(res.body.range).toBe("7d");
    expect(res.body.groupBy).toBe("agent");

    const point = res.body.points[0];
    expect(point.day).toBe(TODAY);
    expect(point.agentId).toBe(AGENT_ID);
    expect(point.callCount).toBe(5);
    // 1000 micro-USD / 1_000_000 = 0.001 USD
    expect(point.costUsd).toBeCloseTo(0.001, 6);
  });

  it("defaults to group_by=day when group_by is omitted", async () => {
    mockTimeSeries.mockResolvedValue([]);
    const res = await request(makeApp()).get(
      `/api/companies/${COMPANY_ID}/costs/time-series?range=30d`,
    );

    expect(res.status).toBe(200);
    expect(res.body.groupBy).toBe("day");
    expect(mockTimeSeries).toHaveBeenCalledWith(COMPANY_ID, "30d", "day");
  });

  it("accepts all valid ranges", async () => {
    mockTimeSeries.mockResolvedValue([]);
    const app = makeApp();
    for (const range of ["7d", "30d", "90d", "mtd", "ytd"]) {
      const res = await request(app).get(
        `/api/companies/${COMPANY_ID}/costs/time-series?range=${range}`,
      );
      expect(res.status).toBe(200);
    }
  });
});

// ── leaderboard ───────────────────────────────────────────────────────────────

describe("GET /api/companies/:companyId/costs/leaderboard", () => {
  beforeEach(() => {
    mockLeaderboard.mockResolvedValue([
      {
        agentId: AGENT_ID,
        agentName: "Navigator",
        callCount: 42,
        inputTokens: 10000,
        outputTokens: 5000,
        costUsdMicro: 5_000_000,
      },
    ]);
  });

  it("returns 403 when unauthenticated (assertBoard rejects non-board actors)", async () => {
    const res = await request(makeApp(noActor())).get(
      `/api/companies/${COMPANY_ID}/costs/leaderboard`,
    );
    // assertBoard() throws forbidden for any non-board actor, including anonymous
    expect(res.status).toBe(403);
  });

  it("returns 400 for limit > 100", async () => {
    const res = await request(makeApp()).get(
      `/api/companies/${COMPANY_ID}/costs/leaderboard?limit=101`,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for limit = 0", async () => {
    const res = await request(makeApp()).get(
      `/api/companies/${COMPANY_ID}/costs/leaderboard?limit=0`,
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 with entries and USD conversion", async () => {
    const res = await request(makeApp()).get(
      `/api/companies/${COMPANY_ID}/costs/leaderboard?range=30d&limit=5`,
    );

    expect(res.status).toBe(200);
    expect(res.body.range).toBe("30d");
    expect(res.body.limit).toBe(5);

    const entry = res.body.entries[0];
    expect(entry.agentId).toBe(AGENT_ID);
    expect(entry.callCount).toBe(42);
    // 5_000_000 micro-USD / 1_000_000 = $5.00
    expect(entry.costUsd).toBeCloseTo(5.0, 6);
    expect(mockLeaderboard).toHaveBeenCalledWith(COMPANY_ID, "30d", 5);
  });

  it("defaults limit to 10", async () => {
    const res = await request(makeApp()).get(
      `/api/companies/${COMPANY_ID}/costs/leaderboard?range=7d`,
    );
    expect(res.status).toBe(200);
    expect(mockLeaderboard).toHaveBeenCalledWith(COMPANY_ID, "7d", 10);
  });
});

// ── month-over-month ──────────────────────────────────────────────────────────

describe("GET /api/companies/:companyId/costs/mom", () => {
  beforeEach(() => {
    mockMom.mockResolvedValue({
      currentMonth: {
        from: "2026-04-01",
        to: "2026-04-20",
        totalCostUsdMicro: 10_000_000,
        byProvider: [{ provider: "anthropic_api", costUsdMicro: 10_000_000 }],
      },
      previousMonth: {
        from: "2026-03-01",
        to: "2026-03-31",
        totalCostUsdMicro: 8_000_000,
        byProvider: [{ provider: "anthropic_api", costUsdMicro: 8_000_000 }],
      },
      deltaUsdMicro: 2_000_000,
      deltaPct: 25.0,
    });
  });

  it("returns 403 when unauthenticated (assertBoard rejects non-board actors)", async () => {
    const res = await request(makeApp(noActor())).get(`/api/companies/${COMPANY_ID}/costs/mom`);
    // assertBoard() throws forbidden for any non-board actor, including anonymous
    expect(res.status).toBe(403);
  });

  it("returns 403 for cross-company access", async () => {
    const res = await request(makeApp()).get(`/api/companies/${randomUUID()}/costs/mom`);
    expect(res.status).toBe(403);
  });

  it("returns 200 with MoM data in USD", async () => {
    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/costs/mom`);

    expect(res.status).toBe(200);
    expect(res.body.currentMonth.totalCostUsd).toBeCloseTo(10.0, 6);
    expect(res.body.previousMonth.totalCostUsd).toBeCloseTo(8.0, 6);
    expect(res.body.deltaUsd).toBeCloseTo(2.0, 6);
    expect(res.body.deltaPct).toBe(25.0);

    expect(res.body.currentMonth.byProvider[0].provider).toBe("anthropic_api");
    expect(res.body.currentMonth.byProvider[0].costUsd).toBeCloseTo(10.0, 6);
  });

  it("handles null deltaPct when previous month is empty", async () => {
    mockMom.mockResolvedValue({
      currentMonth: { from: "2026-04-01", to: "2026-04-20", totalCostUsdMicro: 5_000_000, byProvider: [] },
      previousMonth: { from: "2026-03-01", to: "2026-03-31", totalCostUsdMicro: 0, byProvider: [] },
      deltaUsdMicro: 5_000_000,
      deltaPct: null,
    });

    const res = await request(makeApp()).get(`/api/companies/${COMPANY_ID}/costs/mom`);

    expect(res.status).toBe(200);
    expect(res.body.deltaPct).toBeNull();
    expect(res.body.deltaUsd).toBeCloseTo(5.0, 6);
  });
});

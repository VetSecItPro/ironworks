/**
 * Tests for the sidebar-badges route.
 *
 * The critical scenario under test: a user's ACL changes between two badge
 * requests. If badgeCache serves the first response for the full TTL window,
 * the second request returns stale join-request counts - the user sees zero
 * pending join requests even though they were just granted joins:approve.
 *
 * The fix is to remove the cache entirely. These badge queries are cheap
 * (indexed count aggregates) and the correctness risk of a 30-second stale
 * window outweighs the marginal DB load saved.
 */

import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetSingletonsForTest } from "../routes/sidebar-badges.js";
import { makeChainableDb } from "./helpers/drizzle-mock.js";
import { boardUser, buildTestApp } from "./helpers/route-app.js";

// ── Stable test IDs ────────────────────────────────────────────────────────

const COMPANY_ID = randomUUID();
const USER_ID = randomUUID();

// ── Mock: accessService ────────────────────────────────────────────────────

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn<[string, string | null | undefined, string], Promise<boolean>>(),
  hasPermission: vi.fn<[string, string, string, string], Promise<boolean>>(),
}));

// ── Mock: sidebarBadgeService ──────────────────────────────────────────────

const mockSidebarBadgeGet = vi.hoisted(() => vi.fn());

// ── Mock: dashboardService ─────────────────────────────────────────────────

const mockDashboardSummary = vi.hoisted(() => vi.fn());

vi.mock("../services/access.js", () => ({
  accessService: vi.fn(() => mockAccessService),
}));

vi.mock("../services/sidebar-badges.js", () => ({
  sidebarBadgeService: vi.fn(() => ({ get: mockSidebarBadgeGet })),
}));

vi.mock("../services/dashboard.js", () => ({
  dashboardService: vi.fn(() => ({ summary: mockDashboardSummary })),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function baseBadges() {
  return {
    approvals: 0,
    failedRuns: 0,
    joinRequests: 0,
    deliverablesReview: 0,
    inbox: 0,
  };
}

function baseSummary() {
  return {
    agents: { active: 0, running: 0, paused: 0, error: 0 },
    tasks: { open: 0, inProgress: 0, blocked: 0, done: 0 },
    costs: { monthBudgetCents: 0, monthUtilizationPercent: 0, weekSpendCents: 0 },
    pendingApprovals: 0,
  };
}

// Build a chainable DB mock whose .then() returns a single-row count payload.
// This satisfies the db.select({count}).from(joinRequests).where(...).then(cb)
// call inside computeBadges when canApproveJoins is true.
function makeCountDb(count: number) {
  return makeChainableDb<{ count: number }>([{ count }]);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("sidebar-badges route", () => {
  beforeEach(() => {
    // Clear any residual cache state between tests. After the badgeCache fix
    // this becomes a no-op, but keeping the call here documents intent and
    // guards against future re-introduction of process-level state.
    _resetSingletonsForTest();
    vi.clearAllMocks();

    // Default: user does NOT have joins:approve permission
    mockAccessService.canUser.mockResolvedValue(false);
    mockSidebarBadgeGet.mockResolvedValue(baseBadges());
    mockDashboardSummary.mockResolvedValue(baseSummary());
  });

  it("returns 200 with badge counts for an authorised user", async () => {
    const { sidebarBadgeRoutes } = await import("../routes/sidebar-badges.js");
    // canUser returns false so the joinRequests DB query is skipped entirely
    const db = makeCountDb(0);
    const app = buildTestApp({
      router: sidebarBadgeRoutes(db as never),
      actor: boardUser(USER_ID, [COMPANY_ID]),
    });

    const res = await request(app).get(`/api/companies/${COMPANY_ID}/sidebar-badges`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ approvals: 0, failedRuns: 0, joinRequests: 0 });
  });

  it("returns 403 for a user not in the company", async () => {
    const otherCompany = randomUUID();
    const { sidebarBadgeRoutes } = await import("../routes/sidebar-badges.js");
    const db = makeCountDb(0);
    const app = buildTestApp({
      router: sidebarBadgeRoutes(db as never),
      actor: boardUser(USER_ID, [COMPANY_ID]),
    });

    const res = await request(app).get(`/api/companies/${otherCompany}/sidebar-badges`);
    expect(res.status).toBe(403);
  });

  /**
   * ACL staleness regression test.
   *
   * Before the fix, a 30-second badgeCache would serve the first response for
   * any subsequent request within the TTL window. A user who was just granted
   * joins:approve would not see pending join requests until the cache expired.
   *
   * After the fix (cache removed), every request hits the DB so the second
   * call immediately reflects the updated ACL and returns the correct count.
   */
  it("reflects ACL changes immediately without a stale cache window", async () => {
    const { sidebarBadgeRoutes } = await import("../routes/sidebar-badges.js");

    // DB returns 3 pending join requests when queried (used once canUser = true)
    const db = makeCountDb(3);
    const app = buildTestApp({
      router: sidebarBadgeRoutes(db as never),
      actor: boardUser(USER_ID, [COMPANY_ID]),
    });

    // ── First request: user has no joins:approve → joinRequests stays 0 ────
    mockAccessService.canUser.mockResolvedValue(false);
    mockSidebarBadgeGet.mockResolvedValue({ ...baseBadges() });
    mockDashboardSummary.mockResolvedValue(baseSummary());

    const first = await request(app).get(`/api/companies/${COMPANY_ID}/sidebar-badges`);
    expect(first.status).toBe(200);
    expect(first.body.joinRequests).toBe(0);

    // ── ACL mutation: user is now granted joins:approve ────────────────────
    // canUser now returns true so computeBadges will query joinRequests from db
    // (which returns count 3 per makeCountDb above).
    mockAccessService.canUser.mockResolvedValue(true);
    mockSidebarBadgeGet.mockResolvedValue({ ...baseBadges() });
    mockDashboardSummary.mockResolvedValue(baseSummary());

    // ── Second request: must reflect new ACL, not serve cached stale data ──
    const second = await request(app).get(`/api/companies/${COMPANY_ID}/sidebar-badges`);
    expect(second.status).toBe(200);
    // If the cache were still active, joinRequests would be 0 (stale from first
    // request). Without cache, computeBadges re-runs and sees canUser = true,
    // queries the DB, and returns the real pending count of 3.
    expect(second.body.joinRequests).toBe(3);

    // Confirm computeBadges ran twice - not short-circuited by cache
    expect(mockSidebarBadgeGet).toHaveBeenCalledTimes(2);
    expect(mockAccessService.canUser).toHaveBeenCalledTimes(2);
  });
});

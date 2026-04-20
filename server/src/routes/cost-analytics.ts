/**
 * Cost analytics routes — time-series, leaderboard, and month-over-month.
 *
 * Reads from cost_rollup_daily (nightly pre-aggregation) with a live fallback
 * to cost_events for today's data.
 *
 * Auth: board role required (assertBoard + assertCompanyAccess). Viewers are
 * blocked at assertCompanyAccess.
 *
 * Routes:
 *   GET /companies/:companyId/costs/time-series?range=7d|30d|90d|mtd|ytd&group_by=day|agent|adapter
 *   GET /companies/:companyId/costs/leaderboard?range=...&limit=10
 *   GET /companies/:companyId/costs/mom
 */

import type { Db } from "@ironworksai/db";
import { Router } from "express";
import { badRequest } from "../errors.js";
import {
  type CostRange,
  type GroupBy,
  costAnalyticsService,
  resolveDateRange,
} from "../services/cost-analytics.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

const VALID_RANGES = new Set<string>(["7d", "30d", "90d", "mtd", "ytd"]);
const VALID_GROUP_BY = new Set<string>(["day", "agent", "adapter"]);

function parseRange(raw: unknown): CostRange {
  const s = typeof raw === "string" ? raw.trim() : "30d";
  if (!VALID_RANGES.has(s)) throw badRequest(`Invalid range "${s}". Must be one of: 7d, 30d, 90d, mtd, ytd`);
  return s as CostRange;
}

function parseGroupBy(raw: unknown): GroupBy {
  const s = typeof raw === "string" ? raw.trim() : "day";
  if (!VALID_GROUP_BY.has(s)) throw badRequest(`Invalid group_by "${s}". Must be one of: day, agent, adapter`);
  return s as GroupBy;
}

function parseLimit(raw: unknown, defaultLimit = 10): number {
  if (raw == null || raw === "") return defaultLimit;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0 || n > 100) throw badRequest("limit must be an integer between 1 and 100");
  return n;
}

export function costAnalyticsRoutes(db: Db) {
  const router = Router();
  const analytics = costAnalyticsService(db);

  /**
   * Time-series spend data for charts.
   * costUsd is the USD float converted from micro-USD storage.
   */
  router.get("/companies/:companyId/costs/time-series", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const range = parseRange(req.query.range);
    const groupBy = parseGroupBy(req.query.group_by);

    const points = await analytics.timeSeries(companyId, range, groupBy);
    const { from, to } = resolveDateRange(range);

    res.json({
      range,
      groupBy,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      points: points.map((p) => ({
        day: p.day,
        agentId: p.agentId,
        agentName: p.agentName,
        provider: p.provider,
        source: p.source,
        callCount: p.callCount,
        inputTokens: p.inputTokens,
        outputTokens: p.outputTokens,
        costUsd: p.costUsdMicro / 1_000_000,
      })),
    });
  });

  /**
   * Top agents by cost within a range.
   */
  router.get("/companies/:companyId/costs/leaderboard", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const range = parseRange(req.query.range);
    const limit = parseLimit(req.query.limit);

    const entries = await analytics.leaderboard(companyId, range, limit);

    res.json({
      range,
      limit,
      entries: entries.map((e) => ({
        agentId: e.agentId,
        agentName: e.agentName,
        callCount: e.callCount,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        costUsd: e.costUsdMicro / 1_000_000,
      })),
    });
  });

  /**
   * Month-over-month comparison: current calendar month vs previous.
   */
  router.get("/companies/:companyId/costs/mom", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const result = await analytics.mom(companyId);

    res.json({
      currentMonth: {
        from: result.currentMonth.from,
        to: result.currentMonth.to,
        totalCostUsd: result.currentMonth.totalCostUsdMicro / 1_000_000,
        byProvider: result.currentMonth.byProvider.map((p) => ({
          provider: p.provider,
          costUsd: p.costUsdMicro / 1_000_000,
        })),
      },
      previousMonth: {
        from: result.previousMonth.from,
        to: result.previousMonth.to,
        totalCostUsd: result.previousMonth.totalCostUsdMicro / 1_000_000,
        byProvider: result.previousMonth.byProvider.map((p) => ({
          provider: p.provider,
          costUsd: p.costUsdMicro / 1_000_000,
        })),
      },
      deltaUsd: result.deltaUsdMicro / 1_000_000,
      deltaPct: result.deltaPct,
    });
  });

  return router;
}

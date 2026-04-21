/**
 * Cost analytics service.
 *
 * Provides time-series, leaderboard, and month-over-month aggregations for the
 * cost dashboard. Reads from cost_rollup_daily for historical days (fast) and
 * falls back to cost_events for today's data (rollup always lags by one day).
 *
 * All monetary values are stored and transported internally as micro-USD
 * (1 USD = 1_000_000 micro-USD). Route handlers convert to USD for responses.
 */

import type { Db } from "@ironworksai/db";
import { agents, costEvents, costRollupDaily } from "@ironworksai/db";
import { and, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

// ── Date-range helpers ────────────────────────────────────────────────────────

export type CostRange = "7d" | "30d" | "90d" | "mtd" | "ytd";
export type GroupBy = "day" | "agent" | "adapter";

/**
 * Compute the [from, to] date range for a named preset.
 * `to` is end-of-today so "today" data from cost_events is included.
 */
export function resolveDateRange(range: CostRange, now = new Date()): { from: Date; to: Date } {
  const msPerDay = 86_400_000;
  const to = new Date(now);
  to.setUTCHours(23, 59, 59, 999);

  switch (range) {
    case "7d": {
      const from = new Date(now.getTime() - 6 * msPerDay);
      from.setUTCHours(0, 0, 0, 0);
      return { from, to };
    }
    case "30d": {
      const from = new Date(now.getTime() - 29 * msPerDay);
      from.setUTCHours(0, 0, 0, 0);
      return { from, to };
    }
    case "90d": {
      const from = new Date(now.getTime() - 89 * msPerDay);
      from.setUTCHours(0, 0, 0, 0);
      return { from, to };
    }
    case "mtd": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { from, to };
    }
    case "ytd": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      return { from, to };
    }
  }
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayUtcMidnight(now = new Date()): Date {
  const t = new Date(now);
  t.setUTCHours(0, 0, 0, 0);
  return t;
}

// ── Public types ─────────────────────────────────────────────────────────────

export interface TimeSeriesPoint {
  day: string;
  agentId: string | null;
  agentName: string | null;
  provider: string;
  source: string;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsdMicro: number;
}

export interface LeaderboardEntry {
  agentId: string;
  agentName: string;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsdMicro: number;
}

export interface MomComparison {
  currentMonth: { from: string; to: string; totalCostUsdMicro: number; byProvider: ProviderTotal[] };
  previousMonth: { from: string; to: string; totalCostUsdMicro: number; byProvider: ProviderTotal[] };
  deltaUsdMicro: number;
  // null when previous month is $0 (division by zero)
  deltaPct: number | null;
}

interface ProviderTotal {
  provider: string;
  costUsdMicro: number;
}

// ── Today fallback: live cost_events data ────────────────────────────────────
//
// cost_events.costCents × 10_000 = micro-USD. Integer math keeps this exact.

async function fetchTodayFromEvents(db: Db, companyId: string, groupBy: GroupBy): Promise<TimeSeriesPoint[]> {
  const today = todayUtcMidnight();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const todayStr = toDateStr(today);
  const conditions = [
    eq(costEvents.companyId, companyId),
    gte(costEvents.occurredAt, today),
    lt(costEvents.occurredAt, tomorrow),
  ];

  const costMicroExpr = sql<number>`coalesce(sum(${costEvents.costCents}), 0)::bigint * 10000`;

  if (groupBy === "agent") {
    const rows = await db
      .select({
        agentId: costEvents.agentId,
        agentName: agents.name,
        provider: costEvents.provider,
        callCount: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::bigint`,
        outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::bigint`,
        costUsdMicro: costMicroExpr,
      })
      .from(costEvents)
      .leftJoin(agents, eq(costEvents.agentId, agents.id))
      .where(and(...conditions))
      .groupBy(costEvents.agentId, agents.name, costEvents.provider);

    return rows.map((r) => ({
      day: todayStr,
      agentId: r.agentId,
      agentName: r.agentName ?? null,
      provider: r.provider,
      source: "agent",
      callCount: Number(r.callCount),
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      costUsdMicro: Number(r.costUsdMicro),
    }));
  }

  if (groupBy === "adapter") {
    const rows = await db
      .select({
        provider: costEvents.provider,
        callCount: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::bigint`,
        outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::bigint`,
        costUsdMicro: costMicroExpr,
      })
      .from(costEvents)
      .where(and(...conditions))
      .groupBy(costEvents.provider);

    return rows.map((r) => ({
      day: todayStr,
      agentId: null,
      agentName: null,
      provider: r.provider,
      source: "agent",
      callCount: Number(r.callCount),
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      costUsdMicro: Number(r.costUsdMicro),
    }));
  }

  // groupBy === "day": collapse all of today into one row
  const rows = await db
    .select({
      callCount: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::bigint`,
      outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::bigint`,
      costUsdMicro: costMicroExpr,
    })
    .from(costEvents)
    .where(and(...conditions));

  const r = rows[0];
  // Skip returning a zero-cost row for today — no meaningful data yet
  if (!r || Number(r.costUsdMicro) === 0) return [];

  return [
    {
      day: todayStr,
      agentId: null,
      agentName: null,
      provider: "all",
      source: "agent",
      callCount: Number(r.callCount),
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      costUsdMicro: Number(r.costUsdMicro),
    },
  ];
}

// ── Service factory ───────────────────────────────────────────────────────────

export function costAnalyticsService(db: Db) {
  /**
   * Time-series aggregation for the cost chart.
   *
   * Reads from cost_rollup_daily for historical days, plus a live fallback
   * from cost_events for today (rollup always lags by one day).
   */
  async function timeSeries(companyId: string, range: CostRange, groupBy: GroupBy): Promise<TimeSeriesPoint[]> {
    const { from } = resolveDateRange(range);
    const fromStr = toDateStr(from);
    const todayStr = toDateStr(todayUtcMidnight());

    const rollupConditions = [
      eq(costRollupDaily.companyId, companyId),
      gte(costRollupDaily.day, fromStr),
      // Exclude today — it's not rolled up yet; we append live data below
      lt(costRollupDaily.day, todayStr),
    ];

    let rollupRows: TimeSeriesPoint[] = [];

    if (groupBy === "agent") {
      const rows = await db
        .select({
          day: costRollupDaily.day,
          agentId: costRollupDaily.agentId,
          agentName: agents.name,
          provider: costRollupDaily.provider,
          source: costRollupDaily.source,
          callCount: sql<number>`sum(${costRollupDaily.callCount})::int`,
          inputTokens: sql<number>`sum(${costRollupDaily.inputTokens})::bigint`,
          outputTokens: sql<number>`sum(${costRollupDaily.outputTokens})::bigint`,
          costUsdMicro: sql<number>`sum(${costRollupDaily.costUsdMicro})::bigint`,
        })
        .from(costRollupDaily)
        .leftJoin(agents, eq(costRollupDaily.agentId, agents.id))
        .where(and(...rollupConditions))
        .groupBy(
          costRollupDaily.day,
          costRollupDaily.agentId,
          agents.name,
          costRollupDaily.provider,
          costRollupDaily.source,
        )
        .orderBy(costRollupDaily.day);

      rollupRows = rows.map((r) => ({
        day: r.day,
        agentId: r.agentId ?? null,
        agentName: r.agentName ?? null,
        provider: r.provider,
        source: r.source,
        callCount: Number(r.callCount),
        inputTokens: Number(r.inputTokens),
        outputTokens: Number(r.outputTokens),
        costUsdMicro: Number(r.costUsdMicro),
      }));
    } else if (groupBy === "adapter") {
      const rows = await db
        .select({
          day: costRollupDaily.day,
          provider: costRollupDaily.provider,
          source: costRollupDaily.source,
          callCount: sql<number>`sum(${costRollupDaily.callCount})::int`,
          inputTokens: sql<number>`sum(${costRollupDaily.inputTokens})::bigint`,
          outputTokens: sql<number>`sum(${costRollupDaily.outputTokens})::bigint`,
          costUsdMicro: sql<number>`sum(${costRollupDaily.costUsdMicro})::bigint`,
        })
        .from(costRollupDaily)
        .where(and(...rollupConditions))
        .groupBy(costRollupDaily.day, costRollupDaily.provider, costRollupDaily.source)
        .orderBy(costRollupDaily.day);

      rollupRows = rows.map((r) => ({
        day: r.day,
        agentId: null,
        agentName: null,
        provider: r.provider,
        source: r.source,
        callCount: Number(r.callCount),
        inputTokens: Number(r.inputTokens),
        outputTokens: Number(r.outputTokens),
        costUsdMicro: Number(r.costUsdMicro),
      }));
    } else {
      // groupBy === "day": collapse all providers into one row per day
      const rows = await db
        .select({
          day: costRollupDaily.day,
          source: costRollupDaily.source,
          callCount: sql<number>`sum(${costRollupDaily.callCount})::int`,
          inputTokens: sql<number>`sum(${costRollupDaily.inputTokens})::bigint`,
          outputTokens: sql<number>`sum(${costRollupDaily.outputTokens})::bigint`,
          costUsdMicro: sql<number>`sum(${costRollupDaily.costUsdMicro})::bigint`,
        })
        .from(costRollupDaily)
        .where(and(...rollupConditions))
        .groupBy(costRollupDaily.day, costRollupDaily.source)
        .orderBy(costRollupDaily.day);

      rollupRows = rows.map((r) => ({
        day: r.day,
        agentId: null,
        agentName: null,
        provider: "all",
        source: r.source,
        callCount: Number(r.callCount),
        inputTokens: Number(r.inputTokens),
        outputTokens: Number(r.outputTokens),
        costUsdMicro: Number(r.costUsdMicro),
      }));
    }

    // Append today's live data when today falls within the requested range
    if (fromStr <= todayStr) {
      const todayRows = await fetchTodayFromEvents(db, companyId, groupBy);
      return [...rollupRows, ...todayRows];
    }

    return rollupRows;
  }

  /**
   * Top agents by cost within a range.
   *
   * Merges rollup rows (all days except today) with live cost_events rows
   * (today only) by agentId, then sorts and slices to the requested limit.
   */
  async function leaderboard(companyId: string, range: CostRange, limit: number): Promise<LeaderboardEntry[]> {
    const { from } = resolveDateRange(range);
    const fromStr = toDateStr(from);
    const todayStr = toDateStr(todayUtcMidnight());
    const today = todayUtcMidnight();
    const tomorrow = new Date(today.getTime() + 86_400_000);

    const [rollupRows, todayRows] = await Promise.all([
      db
        .select({
          agentId: costRollupDaily.agentId,
          agentName: agents.name,
          callCount: sql<number>`sum(${costRollupDaily.callCount})::int`,
          inputTokens: sql<number>`sum(${costRollupDaily.inputTokens})::bigint`,
          outputTokens: sql<number>`sum(${costRollupDaily.outputTokens})::bigint`,
          costUsdMicro: sql<number>`sum(${costRollupDaily.costUsdMicro})::bigint`,
        })
        .from(costRollupDaily)
        .leftJoin(agents, eq(costRollupDaily.agentId, agents.id))
        .where(
          and(
            eq(costRollupDaily.companyId, companyId),
            gte(costRollupDaily.day, fromStr),
            lt(costRollupDaily.day, todayStr),
            isNotNull(costRollupDaily.agentId),
          ),
        )
        .groupBy(costRollupDaily.agentId, agents.name)
        .orderBy(desc(sql`sum(${costRollupDaily.costUsdMicro})`)),

      db
        .select({
          agentId: costEvents.agentId,
          agentName: agents.name,
          callCount: sql<number>`count(*)::int`,
          inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::bigint`,
          outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::bigint`,
          costUsdMicro: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::bigint * 10000`,
        })
        .from(costEvents)
        .leftJoin(agents, eq(costEvents.agentId, agents.id))
        .where(
          and(
            eq(costEvents.companyId, companyId),
            gte(costEvents.occurredAt, today),
            lt(costEvents.occurredAt, tomorrow),
          ),
        )
        .groupBy(costEvents.agentId, agents.name),
    ]);

    // Merge by agentId so each agent appears once with combined totals
    const map = new Map<
      string,
      {
        agentId: string;
        agentName: string;
        callCount: number;
        inputTokens: number;
        outputTokens: number;
        costUsdMicro: number;
      }
    >();

    for (const r of rollupRows) {
      if (!r.agentId) continue;
      map.set(r.agentId, {
        agentId: r.agentId,
        agentName: r.agentName ?? r.agentId,
        callCount: Number(r.callCount),
        inputTokens: Number(r.inputTokens),
        outputTokens: Number(r.outputTokens),
        costUsdMicro: Number(r.costUsdMicro),
      });
    }

    for (const r of todayRows) {
      if (!r.agentId) continue;
      const existing = map.get(r.agentId);
      if (existing) {
        existing.callCount += Number(r.callCount);
        existing.inputTokens += Number(r.inputTokens);
        existing.outputTokens += Number(r.outputTokens);
        existing.costUsdMicro += Number(r.costUsdMicro);
      } else {
        map.set(r.agentId, {
          agentId: r.agentId,
          agentName: r.agentName ?? r.agentId,
          callCount: Number(r.callCount),
          inputTokens: Number(r.inputTokens),
          outputTokens: Number(r.outputTokens),
          costUsdMicro: Number(r.costUsdMicro),
        });
      }
    }

    return [...map.values()].sort((a, b) => b.costUsdMicro - a.costUsdMicro).slice(0, limit);
  }

  /**
   * Month-over-month comparison: current calendar month vs previous month.
   *
   * Both are summed over cost_rollup_daily for rolled-up days, plus a live
   * cost_events fallback for today within the current month.
   */
  async function mom(companyId: string): Promise<MomComparison> {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();

    const curFrom = new Date(Date.UTC(year, month, 1));
    const prevFrom = new Date(Date.UTC(year, month - 1, 1));
    const prevTo = new Date(Date.UTC(year, month, 1));
    const today = todayUtcMidnight();
    const tomorrow = new Date(today.getTime() + 86_400_000);

    async function rollupTotals(from: Date, to: Date): Promise<{ total: number; byProvider: ProviderTotal[] }> {
      const rows = await db
        .select({
          provider: costRollupDaily.provider,
          costUsdMicro: sql<number>`sum(${costRollupDaily.costUsdMicro})::bigint`,
        })
        .from(costRollupDaily)
        .where(
          and(
            eq(costRollupDaily.companyId, companyId),
            gte(costRollupDaily.day, toDateStr(from)),
            lt(costRollupDaily.day, toDateStr(to)),
          ),
        )
        .groupBy(costRollupDaily.provider);

      const byProvider = rows.map((r) => ({ provider: r.provider, costUsdMicro: Number(r.costUsdMicro) }));
      return { total: byProvider.reduce((s, r) => s + r.costUsdMicro, 0), byProvider };
    }

    async function eventsTotals(from: Date, to: Date): Promise<{ total: number; byProvider: ProviderTotal[] }> {
      const rows = await db
        .select({
          provider: costEvents.provider,
          costUsdMicro: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::bigint * 10000`,
        })
        .from(costEvents)
        .where(
          and(eq(costEvents.companyId, companyId), gte(costEvents.occurredAt, from), lt(costEvents.occurredAt, to)),
        )
        .groupBy(costEvents.provider);

      const byProvider = rows.map((r) => ({ provider: r.provider, costUsdMicro: Number(r.costUsdMicro) }));
      return { total: byProvider.reduce((s, r) => s + r.costUsdMicro, 0), byProvider };
    }

    const [curRollup, curToday, prevData] = await Promise.all([
      rollupTotals(curFrom, today),
      eventsTotals(today, tomorrow),
      // Previous month is always fully rolled up (it ended last month)
      rollupTotals(prevFrom, prevTo),
    ]);

    const curByProvider = mergeProviderTotals(curRollup.byProvider, curToday.byProvider);
    const curTotal = curByProvider.reduce((s, r) => s + r.costUsdMicro, 0);
    const prevTotal = prevData.total;
    const deltaUsdMicro = curTotal - prevTotal;
    // Avoid division by zero: return null when previous month had no spend
    const deltaPct = prevTotal > 0 ? Math.round((deltaUsdMicro / prevTotal) * 100 * 100) / 100 : null;

    return {
      currentMonth: {
        from: toDateStr(curFrom),
        to: toDateStr(now),
        totalCostUsdMicro: curTotal,
        byProvider: curByProvider,
      },
      previousMonth: {
        from: toDateStr(prevFrom),
        to: toDateStr(new Date(prevTo.getTime() - 1)),
        totalCostUsdMicro: prevTotal,
        byProvider: prevData.byProvider,
      },
      deltaUsdMicro,
      deltaPct,
    };
  }

  return { timeSeries, leaderboard, mom };
}

function mergeProviderTotals(a: ProviderTotal[], b: ProviderTotal[]): ProviderTotal[] {
  const map = new Map<string, number>();
  for (const { provider, costUsdMicro } of [...a, ...b]) {
    map.set(provider, (map.get(provider) ?? 0) + costUsdMicro);
  }
  return [...map.entries()].map(([provider, costUsdMicro]) => ({ provider, costUsdMicro }));
}

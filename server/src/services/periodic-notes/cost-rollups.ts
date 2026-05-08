/**
 * Cost rollup emitters (weekly + monthly).
 *
 * Reads pre-aggregated `cost_rollup_daily` rows, joins to `agents` to populate
 * by-agent breakdowns, and emits one knowledge page per company per period.
 *
 * Period boundaries are computed in America/Chicago time (project standard:
 * all scheduled jobs use CT). The day-strings stored in `cost_rollup_daily.day`
 * are date-only (PostgreSQL DATE), so we treat them as CT calendar dates.
 *
 * Both emitters are idempotent: re-running with the same `now` updates the
 * existing page (revisionNumber bumps) rather than creating a duplicate.
 */
import type { Db } from "@ironworksai/db";
import { agents, companies, costRollupDaily } from "@ironworksai/db";
import type { CostRollupFrontmatter } from "@ironworksai/shared";
import { renderFrontmatter } from "@ironworksai/shared";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { knowledgeService } from "../knowledge.js";
import { renderCostRollupBody } from "./render.js";

const TZ = "America/Chicago";

/**
 * Decompose a Date into CT calendar parts (year, month 1-12, day 1-31, weekday 1-7 Mon-Sun).
 * Uses Intl to handle DST transitions correctly.
 */
function toCtParts(d: Date): { year: number; month: number; day: number; weekday: number } {
  // weekday: en-US returns "Mon", "Tue"... - we map to ISO 1-7 (Mon=1).
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const wkStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const wkMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { year, month, day, weekday: wkMap[wkStr] ?? 1 };
}

/** Format YYYY-MM-DD from explicit parts (no tz drift). */
function fmtDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Add `days` to a CT calendar date and return the resulting YYYY-MM-DD. Pure date arithmetic via UTC anchor. */
function addDays(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  // Anchor to UTC noon to avoid DST edges around midnight.
  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return {
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
    day: anchor.getUTCDate(),
  };
}

/**
 * Compute ISO week number for a CT calendar date.
 *
 * ISO 8601 week: weeks start Monday; week 1 of a year is the week containing
 * the first Thursday. Implemented via the standard "shift to Thursday of the
 * same ISO week, compare to Jan 4 of that year" algorithm.
 */
function isoWeek(year: number, month: number, day: number): { isoYear: number; isoWeek: number } {
  // Use UTC noon anchor to avoid DST edges.
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  // ISO weekday: Mon=1..Sun=7. JS getUTCDay: Sun=0..Sat=6 → remap.
  const isoDow = ((d.getUTCDay() + 6) % 7) + 1;
  // Shift to the Thursday of this ISO week.
  d.setUTCDate(d.getUTCDate() + (4 - isoDow));
  const isoYear = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4, 12, 0, 0));
  const jan4Dow = ((jan4.getUTCDay() + 6) % 7) + 1;
  jan4.setUTCDate(jan4.getUTCDate() + (4 - jan4Dow));
  // Both `d` and `jan4` now point to the Thursday of week 1 / target week.
  const diffMs = d.getTime() - jan4.getTime();
  const week = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  return { isoYear, isoWeek: week };
}

interface PeriodBounds {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (inclusive)
  slugFragment: string; // e.g. "2026-W18" or "2026-04"
}

/** Previous full ISO week (Mon-Sun) ending strictly before `now` (in CT). */
function priorIsoWeek(now: Date): PeriodBounds {
  const ct = toCtParts(now);
  // Step back to the most recent Sunday-or-prior-day (i.e. last day of an
  // ISO week, since ISO weeks end on Sunday). If today is Sunday in CT we
  // still treat that as "the week ending today is current"; we want the
  // previous fully-completed week. So: jump back `weekday` days lands on
  // the prior Sunday, then back 6 more for the prior Monday.
  const priorSunday = addDays(ct.year, ct.month, ct.day, -ct.weekday);
  const priorMonday = addDays(priorSunday.year, priorSunday.month, priorSunday.day, -6);
  const startDate = fmtDate(priorMonday.year, priorMonday.month, priorMonday.day);
  const endDate = fmtDate(priorSunday.year, priorSunday.month, priorSunday.day);
  const { isoYear, isoWeek: wk } = isoWeek(priorMonday.year, priorMonday.month, priorMonday.day);
  const slugFragment = `${isoYear}-W${String(wk).padStart(2, "0")}`;
  return { startDate, endDate, slugFragment };
}

/** Previous calendar month (in CT) relative to `now`. */
function priorMonth(now: Date): PeriodBounds {
  const ct = toCtParts(now);
  // Previous month: if January, wrap to December of prior year.
  let py = ct.year;
  let pm = ct.month - 1;
  if (pm === 0) {
    pm = 12;
    py = py - 1;
  }
  // Last day of prior month: day 0 of current month in UTC anchor.
  const lastDay = new Date(Date.UTC(ct.year, ct.month - 1, 0, 12, 0, 0)).getUTCDate();
  const startDate = fmtDate(py, pm, 1);
  const endDate = fmtDate(py, pm, lastDay);
  const slugFragment = `${py}-${String(pm).padStart(2, "0")}`;
  return { startDate, endDate, slugFragment };
}

interface AggRow {
  agentSlug: string;
  totalUsd: number;
}

interface ProviderRow {
  provider: string;
  totalUsd: number;
}

/**
 * Aggregate cost_rollup_daily for a single (companyId, [start, end]) window.
 * Returns total + per-agent + per-provider breakdowns, all in dollars.
 */
async function aggregateForCompany(
  db: Db,
  companyId: string,
  startDate: string,
  endDate: string,
): Promise<{ totalUsd: number; byAgent: AggRow[]; byProvider: ProviderRow[] }> {
  // Per-agent breakdown: join agents to recover the agent name (no slug field
  // exists; we synthesise a slug from the name to match how agents are
  // referenced elsewhere in the vault).
  const perAgentRows = await db
    .select({
      agentName: agents.name,
      totalMicro: sql<string>`coalesce(sum(${costRollupDaily.costUsdMicro}), 0)`,
    })
    .from(costRollupDaily)
    .leftJoin(agents, eq(agents.id, costRollupDaily.agentId))
    .where(
      and(
        eq(costRollupDaily.companyId, companyId),
        gte(costRollupDaily.day, startDate),
        lte(costRollupDaily.day, endDate),
      ),
    )
    .groupBy(agents.name);

  const perProviderRows = await db
    .select({
      provider: costRollupDaily.provider,
      totalMicro: sql<string>`coalesce(sum(${costRollupDaily.costUsdMicro}), 0)`,
    })
    .from(costRollupDaily)
    .where(
      and(
        eq(costRollupDaily.companyId, companyId),
        gte(costRollupDaily.day, startDate),
        lte(costRollupDaily.day, endDate),
      ),
    )
    .groupBy(costRollupDaily.provider);

  const byAgent: AggRow[] = perAgentRows
    .filter((r) => r.agentName !== null)
    .map((r) => ({
      agentSlug: slugifyAgent(r.agentName as string),
      totalUsd: Number(r.totalMicro) / 1_000_000,
    }))
    .filter((r) => r.totalUsd > 0)
    .sort((a, b) => b.totalUsd - a.totalUsd);

  const byProvider: ProviderRow[] = perProviderRows
    .map((r) => ({
      provider: r.provider,
      totalUsd: Number(r.totalMicro) / 1_000_000,
    }))
    .filter((r) => r.totalUsd > 0)
    .sort((a, b) => b.totalUsd - a.totalUsd);

  const totalUsd = byProvider.reduce((acc, r) => acc + r.totalUsd, 0);
  return { totalUsd, byAgent, byProvider };
}

/** Mirror `slugify` from knowledge.ts so wikilinks resolve to agent pages. */
function slugifyAgent(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "agent"
  );
}

/**
 * Internal: emit cost-rollup pages for every company. Used by both weekly +
 * monthly entrypoints (which differ only in period bounds + slug folder).
 */
async function emitForAllCompanies(
  db: Db,
  granularity: "weekly" | "monthly",
  bounds: PeriodBounds,
): Promise<{ pagesEmitted: number }> {
  const companyRows = await db.select({ id: companies.id }).from(companies);

  const slugFolder = granularity === "weekly" ? "finance/cost-rollups/weekly" : "finance/cost-rollups/monthly";
  let pagesEmitted = 0;

  for (const { id: companyId } of companyRows) {
    const agg = await aggregateForCompany(db, companyId, bounds.startDate, bounds.endDate);

    const slug = `${slugFolder}/${bounds.slugFragment}`;
    const title =
      granularity === "weekly" ? `Cost Rollup ${bounds.slugFragment}` : `Cost Rollup ${bounds.slugFragment}`;

    const now = new Date().toISOString();
    const fm: CostRollupFrontmatter = {
      id: `${granularity}-${bounds.slugFragment}-${companyId}`,
      type: "cost_rollup",
      title,
      created_at: now,
      updated_at: now,
      visibility: "company",
      period_start: bounds.startDate,
      period_end: bounds.endDate,
      granularity,
      total_usd: Number(agg.totalUsd.toFixed(6)),
      by_agent: agg.byAgent.map((r) => ({ agent_slug: r.agentSlug, total_usd: Number(r.totalUsd.toFixed(6)) })),
      by_provider: agg.byProvider.map((r) => ({ provider: r.provider, total_usd: Number(r.totalUsd.toFixed(6)) })),
    };

    // Period bounds for the body need real Date objects (renderer expects Date).
    // We use UTC noon anchors so toISOString().slice(0,10) recovers the same calendar date.
    const [sy, sm, sd] = bounds.startDate.split("-").map(Number);
    const [ey, em, ed] = bounds.endDate.split("-").map(Number);
    const periodStart = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0));
    const periodEnd = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));

    const body =
      renderFrontmatter(fm) +
      "\n" +
      renderCostRollupBody({
        granularity,
        periodStart,
        periodEnd,
        totalUsd: agg.totalUsd,
        byAgent: agg.byAgent,
        byProvider: agg.byProvider,
      });

    const svc = knowledgeService(db);
    const existing = await svc.getBySlug(companyId, slug);
    if (existing) {
      await svc.update(existing.id, { title, body, changeSummary: `${granularity} rollup re-emitted` }, {});
    } else {
      await svc.create(companyId, { title, body, slug, visibility: "company" }, {});
    }
    pagesEmitted++;
  }

  return { pagesEmitted };
}

/** Emit weekly cost rollups for the prior ISO week (Mon-Sun in CT). */
export async function emitWeeklyCostRollup(db: Db, opts?: { now?: Date }): Promise<{ pagesEmitted: number }> {
  const now = opts?.now ?? new Date();
  const bounds = priorIsoWeek(now);
  return emitForAllCompanies(db, "weekly", bounds);
}

/** Emit monthly cost rollups for the previous calendar month (in CT). */
export async function emitMonthlyCostRollup(db: Db, opts?: { now?: Date }): Promise<{ pagesEmitted: number }> {
  const now = opts?.now ?? new Date();
  const bounds = priorMonth(now);
  return emitForAllCompanies(db, "monthly", bounds);
}

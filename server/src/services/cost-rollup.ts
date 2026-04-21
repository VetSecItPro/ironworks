/**
 * Nightly cost rollup job.
 *
 * Aggregates previous days' cost_events into cost_rollup_daily so that
 * time-series and leaderboard queries read from a compact indexed table rather
 * than scanning the full event log.
 *
 * Idempotency: the job DELETEs any existing rows for the target day before
 * inserting fresh aggregates, so re-running for the same day is safe.
 *
 * Watermark: the last successfully rolled-up date is persisted in the
 * instance_settings singleton's general jsonb bag under 'costRollupWatermark'.
 * On each run the job processes every day from (watermark + 1) up to
 * (yesterday UTC) inclusive, backfilling any gaps caused by server downtime.
 *
 * Empty days: if cost_events has no rows for a target day, the job skips
 * inserting rows for that day but still advances the watermark.
 */

import type { Db } from "@ironworksai/db";
import { costEvents, costRollupDaily, instanceSettings } from "@ironworksai/db";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { logger } from "../middleware/logger.js";

// ── Watermark helpers ────────────────────────────────────────────────────────

async function readWatermark(db: Db): Promise<string | null> {
  const rows = await db
    .select({ general: instanceSettings.general })
    .from(instanceSettings)
    .where(eq(instanceSettings.singletonKey, "default"))
    .limit(1);

  const raw = (rows[0]?.general as Record<string, unknown> | undefined)?.costRollupWatermark;
  if (!raw || typeof raw !== "string") return null;
  // Guard against a corrupted or mis-typed watermark value
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

async function writeWatermark(db: Db, dateStr: string): Promise<void> {
  await db
    .insert(instanceSettings)
    .values({
      singletonKey: "default",
      general: { costRollupWatermark: dateStr },
    })
    .onConflictDoUpdate({
      target: instanceSettings.singletonKey,
      set: {
        // Merge into the existing jsonb bag rather than replacing it wholesale
        general: sql`${instanceSettings.general} || jsonb_build_object('costRollupWatermark', ${dateStr})`,
        updatedAt: sql`now()`,
      },
    });
}

// ── Date arithmetic ──────────────────────────────────────────────────────────

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function yesterdayUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function datesUntil(from: string, through: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= through) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

// ── Core rollup for a single day ─────────────────────────────────────────────

async function rollupDay(db: Db, dateStr: string): Promise<{ rowsInserted: number }> {
  const dayStart = new Date(`${dateStr}T00:00:00Z`);
  const dayEnd = new Date(`${addDays(dateStr, 1)}T00:00:00Z`);

  // Idempotent: clear any prior rollup for this day before re-aggregating
  await db.delete(costRollupDaily).where(eq(costRollupDaily.day, dateStr));

  const agg = await db
    .select({
      companyId: costEvents.companyId,
      agentId: costEvents.agentId,
      provider: costEvents.provider,
      callCount: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::bigint`,
      outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::bigint`,
      // 1 cent = 10_000 micro-USD (1 USD = 100 cents = 1_000_000 micro-USD)
      costUsdMicro: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::bigint * 10000`,
    })
    .from(costEvents)
    .where(and(gte(costEvents.occurredAt, dayStart), lt(costEvents.occurredAt, dayEnd)))
    .groupBy(costEvents.companyId, costEvents.agentId, costEvents.provider);

  if (agg.length === 0) return { rowsInserted: 0 };

  await db.insert(costRollupDaily).values(
    agg.map((row) => ({
      day: dateStr,
      companyId: row.companyId,
      agentId: row.agentId,
      provider: row.provider,
      source: "agent" as const,
      callCount: Number(row.callCount),
      inputTokens: Number(row.inputTokens),
      outputTokens: Number(row.outputTokens),
      costUsdMicro: Number(row.costUsdMicro),
    })),
  );

  return { rowsInserted: agg.length };
}

// ── Public entry point ────────────────────────────────────────────────────────

export interface RollupJobResult {
  daysProcessed: number;
  totalRowsInserted: number;
  newWatermark: string | null;
}

/**
 * Run the cost rollup for all days from the last watermark through yesterday.
 *
 * Safe to call multiple times — already-processed days are re-rolled
 * idempotently. On a fresh install with no watermark, starts from 90 days ago
 * to seed a useful history window without overwhelming the DB.
 */
export async function runCostRollup(db: Db): Promise<RollupJobResult> {
  const yesterday = yesterdayUtc();
  const watermark = await readWatermark(db);

  const DEFAULT_BACKFILL_DAYS = 90;
  const firstDay = watermark ? addDays(watermark, 1) : addDays(yesterday, -(DEFAULT_BACKFILL_DAYS - 1));

  if (firstDay > yesterday) {
    logger.info({ watermark, yesterday }, "[cost-rollup] up to date, nothing to process");
    return { daysProcessed: 0, totalRowsInserted: 0, newWatermark: watermark };
  }

  const days = datesUntil(firstDay, yesterday);
  let totalRowsInserted = 0;

  for (const day of days) {
    try {
      const { rowsInserted } = await rollupDay(db, day);
      totalRowsInserted += rowsInserted;
      await writeWatermark(db, day);
      logger.debug({ day, rowsInserted }, "[cost-rollup] day complete");
    } catch (err) {
      logger.error({ err, day }, "[cost-rollup] failed to roll up day — stopping");
      return {
        daysProcessed: days.indexOf(day),
        totalRowsInserted,
        newWatermark: day === firstDay ? watermark : addDays(day, -1),
      };
    }
  }

  logger.info({ daysProcessed: days.length, totalRowsInserted, newWatermark: yesterday }, "[cost-rollup] complete");
  return { daysProcessed: days.length, totalRowsInserted, newWatermark: yesterday };
}

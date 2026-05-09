/**
 * Periodic-notes scheduler.
 *
 * Boots four long-period timers:
 *   - Weekly cost rollup:  every Sunday at 00:30 CT (covers prior Mon-Sun ISO week).
 *   - Monthly cost rollup: the 1st of every month at 00:30 CT (covers prior calendar month).
 *   - Daily vault snapshot:   every day at 03:00 CT (P3.2).
 *   - Weekly vault snapshot:  every Sunday at 03:30 CT (P3.2).
 *
 * The vault-snapshot timers are spaced ~3 hours after the cost-rollup ones to
 * avoid load contention on the same DB at the boundary. `runVaultSnapshotCron`
 * itself never throws (it returns CronResult and isolates per-company
 * failures), but the tick is still wrapped in try/catch as a belt-and-suspenders
 * guard against unexpected programming errors.
 *
 * Pattern (mirrors `services/embeddings/scheduler.ts`):
 *   - Idempotent start (calling twice is a no-op).
 *   - Single-flight per timer - overlapping ticks cannot occur because
 *     `setTimeout` self-re-arms only after the prior tick resolves.
 *   - `unref()` so timers don't hold the event loop open during graceful
 *     shutdown.
 *   - `stopPeriodicNotesScheduler` clears all timers AND awaits any in-flight
 *     emit so the caller can rely on "no DB writes after this resolves".
 *
 * Time-zone math: Intl APIs are used to read "now" as CT calendar parts,
 * the next fire is constructed as a CT calendar instant, and the offset is
 * recovered by sampling the same instant via Intl in BOTH UTC + CT - the
 * difference is the CT UTC offset (handles DST without a tz library).
 */
import type { Db } from "@ironworksai/db";
import { logger } from "../../middleware/logger.js";
import { runVaultSnapshotCron } from "../vault-snapshot/index.js";
import { emitMonthlyCostRollup, emitWeeklyCostRollup } from "./cost-rollups.js";

const TZ = "America/Chicago";
const FIRE_HOUR = 0;
const FIRE_MINUTE = 30;
// Vault-snapshot fire times: 03:00 CT daily, 03:30 CT Sunday.
const DAILY_VAULT_HOUR = 3;
const DAILY_VAULT_MINUTE = 0;
const WEEKLY_VAULT_HOUR = 3;
const WEEKLY_VAULT_MINUTE = 30;

interface SchedulerState {
  weeklyTimer: NodeJS.Timeout | null;
  monthlyTimer: NodeJS.Timeout | null;
  dailyVaultTimer: NodeJS.Timeout | null;
  weeklyVaultTimer: NodeJS.Timeout | null;
  stopping: boolean;
  inFlightWeekly: Promise<unknown> | null;
  inFlightMonthly: Promise<unknown> | null;
  inFlightDailyVault: Promise<unknown> | null;
  inFlightWeeklyVault: Promise<unknown> | null;
}

const state: SchedulerState = {
  weeklyTimer: null,
  monthlyTimer: null,
  dailyVaultTimer: null,
  weeklyVaultTimer: null,
  stopping: false,
  inFlightWeekly: null,
  inFlightMonthly: null,
  inFlightDailyVault: null,
  inFlightWeeklyVault: null,
};

// ── CT calendar helpers ──────────────────────────────────────────────────────

interface CtParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  weekday: number; // 1=Mon..7=Sun (ISO)
}

function getCtParts(d: Date): CtParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "0";
  const wkStr = get("weekday");
  const wkMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  // "24" appears at midnight in some Node versions; normalize to 0.
  const hourRaw = Number(get("hour"));
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: hourRaw === 24 ? 0 : hourRaw,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: wkMap[wkStr] ?? 1,
  };
}

/**
 * Read the UTC offset (in minutes) that America/Chicago has at instant `d`.
 * Uses Intl's `longOffset` token which returns strings like "GMT-05:00".
 * Returns the number of minutes to ADD to UTC to get CT (negative for west).
 */
function ctOffsetMinutes(d: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    timeZoneName: "longOffset",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-06:00";
  // Format: "GMT-05:00" or "GMT-06:00" (or "GMT" for UTC, never for CT).
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(tz);
  if (!match) return -360; // Fallback: CST.
  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const mins = Number(match[3]);
  return sign * (hours * 60 + mins);
}

/**
 * Convert a CT calendar wall-clock (year/month/day/hour/minute) to a UTC Date.
 * Sampling the CT offset at the wall-clock-as-UTC guess converges in one step
 * for all valid CT instants - DST gaps/folds at the spring/fall transition are
 * resolved deterministically by re-sampling at the corrected UTC moment.
 */
function ctWallClockToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  // First guess: treat the wall-clock as UTC, ask Intl what offset CT had at
  // that instant, and subtract to get the correct UTC moment.
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMin = ctOffsetMinutes(new Date(guessUtcMs));
  let utcMs = guessUtcMs - offsetMin * 60_000;
  // Re-sample once to handle DST transitions where the offset at the corrected
  // moment differs from the offset at the initial guess.
  const offsetMin2 = ctOffsetMinutes(new Date(utcMs));
  if (offsetMin2 !== offsetMin) {
    utcMs = guessUtcMs - offsetMin2 * 60_000;
  }
  return new Date(utcMs);
}

/** Compute ms until next Sunday 00:30 in America/Chicago. */
export function msUntilNextWeeklyFire(now: Date = new Date()): number {
  const ct = getCtParts(now);
  // Days until next Sunday (ISO weekday 7). If today is Sunday and we're
  // before fire time, fire today. Otherwise jump forward.
  let daysAhead: number;
  if (ct.weekday === 7) {
    const isBeforeFire = ct.hour < FIRE_HOUR || (ct.hour === FIRE_HOUR && ct.minute < FIRE_MINUTE);
    daysAhead = isBeforeFire ? 0 : 7;
  } else {
    daysAhead = 7 - ct.weekday; // Mon=1 → 6 days, ..., Sat=6 → 1 day
  }
  // Build the target CT calendar date by adding `daysAhead` to today.
  const anchor = new Date(Date.UTC(ct.year, ct.month - 1, ct.day, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + daysAhead);
  const targetUtc = ctWallClockToUtc(
    anchor.getUTCFullYear(),
    anchor.getUTCMonth() + 1,
    anchor.getUTCDate(),
    FIRE_HOUR,
    FIRE_MINUTE,
  );
  return Math.max(0, targetUtc.getTime() - now.getTime());
}

/** Compute ms until next 1st-of-month 00:30 in America/Chicago. */
export function msUntilNextMonthlyFire(now: Date = new Date()): number {
  const ct = getCtParts(now);
  let targetYear = ct.year;
  let targetMonth = ct.month;
  if (ct.day === 1) {
    const isBeforeFire = ct.hour < FIRE_HOUR || (ct.hour === FIRE_HOUR && ct.minute < FIRE_MINUTE);
    if (!isBeforeFire) {
      targetMonth += 1;
      if (targetMonth === 13) {
        targetMonth = 1;
        targetYear += 1;
      }
    }
  } else {
    targetMonth += 1;
    if (targetMonth === 13) {
      targetMonth = 1;
      targetYear += 1;
    }
  }
  const targetUtc = ctWallClockToUtc(targetYear, targetMonth, 1, FIRE_HOUR, FIRE_MINUTE);
  return Math.max(0, targetUtc.getTime() - now.getTime());
}

/** Compute ms until next 03:00 CT (daily). */
export function msUntilNextDailyVaultFire(now: Date = new Date()): number {
  const ct = getCtParts(now);
  let daysAhead = 0;
  const isBeforeFire = ct.hour < DAILY_VAULT_HOUR || (ct.hour === DAILY_VAULT_HOUR && ct.minute < DAILY_VAULT_MINUTE);
  if (!isBeforeFire) daysAhead = 1;
  const anchor = new Date(Date.UTC(ct.year, ct.month - 1, ct.day, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + daysAhead);
  const targetUtc = ctWallClockToUtc(
    anchor.getUTCFullYear(),
    anchor.getUTCMonth() + 1,
    anchor.getUTCDate(),
    DAILY_VAULT_HOUR,
    DAILY_VAULT_MINUTE,
  );
  return Math.max(0, targetUtc.getTime() - now.getTime());
}

/** Compute ms until next Sunday 03:30 CT. */
export function msUntilNextWeeklyVaultFire(now: Date = new Date()): number {
  const ct = getCtParts(now);
  let daysAhead: number;
  if (ct.weekday === 7) {
    const isBeforeFire =
      ct.hour < WEEKLY_VAULT_HOUR || (ct.hour === WEEKLY_VAULT_HOUR && ct.minute < WEEKLY_VAULT_MINUTE);
    daysAhead = isBeforeFire ? 0 : 7;
  } else {
    daysAhead = 7 - ct.weekday;
  }
  const anchor = new Date(Date.UTC(ct.year, ct.month - 1, ct.day, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + daysAhead);
  const targetUtc = ctWallClockToUtc(
    anchor.getUTCFullYear(),
    anchor.getUTCMonth() + 1,
    anchor.getUTCDate(),
    WEEKLY_VAULT_HOUR,
    WEEKLY_VAULT_MINUTE,
  );
  return Math.max(0, targetUtc.getTime() - now.getTime());
}

// ── Timer plumbing ───────────────────────────────────────────────────────────

function scheduleNextWeekly(db: Db): void {
  const ms = msUntilNextWeeklyFire();
  const t = setTimeout(() => {
    if (state.stopping) return;
    state.inFlightWeekly = (async () => {
      try {
        const result = await emitWeeklyCostRollup(db);
        logger.info(result, "[periodic-notes] weekly cost rollup emitted");
      } catch (err) {
        logger.error({ err }, "[periodic-notes] weekly rollup tick failed");
      }
    })();
    void state.inFlightWeekly.finally(() => {
      state.inFlightWeekly = null;
      if (!state.stopping) scheduleNextWeekly(db);
    });
  }, ms);
  t.unref?.();
  state.weeklyTimer = t;
  logger.info({ msUntilNextWeeklyFire: ms }, "[periodic-notes] weekly cost rollup scheduled");
}

function scheduleNextMonthly(db: Db): void {
  const ms = msUntilNextMonthlyFire();
  const t = setTimeout(() => {
    if (state.stopping) return;
    state.inFlightMonthly = (async () => {
      try {
        const result = await emitMonthlyCostRollup(db);
        logger.info(result, "[periodic-notes] monthly cost rollup emitted");
      } catch (err) {
        logger.error({ err }, "[periodic-notes] monthly rollup tick failed");
      }
    })();
    void state.inFlightMonthly.finally(() => {
      state.inFlightMonthly = null;
      if (!state.stopping) scheduleNextMonthly(db);
    });
  }, ms);
  t.unref?.();
  state.monthlyTimer = t;
  logger.info({ msUntilNextMonthlyFire: ms }, "[periodic-notes] monthly cost rollup scheduled");
}

function scheduleNextDailyVault(db: Db): void {
  const ms = msUntilNextDailyVaultFire();
  const t = setTimeout(() => {
    if (state.stopping) return;
    state.inFlightDailyVault = (async () => {
      try {
        const result = await runVaultSnapshotCron(db, { cadence: "daily" });
        logger.info({ ...result, cadence: "daily" }, "[periodic-notes] daily vault snapshot cron tick complete");
      } catch (err) {
        // runVaultSnapshotCron handles its own per-company errors - this only
        // catches programmer errors (e.g. settings-service throws unexpectedly).
        logger.error({ err }, "[periodic-notes] daily vault snapshot tick failed");
      }
    })();
    void state.inFlightDailyVault.finally(() => {
      state.inFlightDailyVault = null;
      if (!state.stopping) scheduleNextDailyVault(db);
    });
  }, ms);
  t.unref?.();
  state.dailyVaultTimer = t;
  logger.info({ msUntilNextDailyVaultFire: ms }, "[periodic-notes] daily vault snapshot scheduled");
}

function scheduleNextWeeklyVault(db: Db): void {
  const ms = msUntilNextWeeklyVaultFire();
  const t = setTimeout(() => {
    if (state.stopping) return;
    state.inFlightWeeklyVault = (async () => {
      try {
        const result = await runVaultSnapshotCron(db, { cadence: "weekly" });
        logger.info({ ...result, cadence: "weekly" }, "[periodic-notes] weekly vault snapshot cron tick complete");
      } catch (err) {
        logger.error({ err }, "[periodic-notes] weekly vault snapshot tick failed");
      }
    })();
    void state.inFlightWeeklyVault.finally(() => {
      state.inFlightWeeklyVault = null;
      if (!state.stopping) scheduleNextWeeklyVault(db);
    });
  }, ms);
  t.unref?.();
  state.weeklyVaultTimer = t;
  logger.info({ msUntilNextWeeklyVaultFire: ms }, "[periodic-notes] weekly vault snapshot scheduled");
}

/**
 * Start the periodic-notes scheduler. Idempotent - calling twice is a no-op.
 * Boot caller should invoke once after the DB is ready.
 */
export function startPeriodicNotesScheduler(db: Db): void {
  if (state.weeklyTimer || state.monthlyTimer || state.dailyVaultTimer || state.weeklyVaultTimer) {
    return;
  }
  state.stopping = false;
  scheduleNextWeekly(db);
  scheduleNextMonthly(db);
  scheduleNextDailyVault(db);
  scheduleNextWeeklyVault(db);
}

/**
 * Stop the scheduler. Clears all timers + awaits any in-flight emit so
 * callers can rely on "no DB writes after this resolves".
 */
export async function stopPeriodicNotesScheduler(): Promise<void> {
  state.stopping = true;
  if (state.weeklyTimer) {
    clearTimeout(state.weeklyTimer);
    state.weeklyTimer = null;
  }
  if (state.monthlyTimer) {
    clearTimeout(state.monthlyTimer);
    state.monthlyTimer = null;
  }
  if (state.dailyVaultTimer) {
    clearTimeout(state.dailyVaultTimer);
    state.dailyVaultTimer = null;
  }
  if (state.weeklyVaultTimer) {
    clearTimeout(state.weeklyVaultTimer);
    state.weeklyVaultTimer = null;
  }
  if (state.inFlightWeekly) {
    try {
      await state.inFlightWeekly;
    } catch {
      // already logged
    }
  }
  if (state.inFlightMonthly) {
    try {
      await state.inFlightMonthly;
    } catch {
      // already logged
    }
  }
  if (state.inFlightDailyVault) {
    try {
      await state.inFlightDailyVault;
    } catch {
      // already logged
    }
  }
  if (state.inFlightWeeklyVault) {
    try {
      await state.inFlightWeeklyVault;
    } catch {
      // already logged
    }
  }
  state.inFlightWeekly = null;
  state.inFlightMonthly = null;
  state.inFlightDailyVault = null;
  state.inFlightWeeklyVault = null;
  // Reset for tests / restart-in-process scenarios.
  state.stopping = false;
  logger.info("[periodic-notes] scheduler stopped");
}

/** Test-only: introspection of internal state. */
export function __getPeriodicNotesSchedulerState(): {
  weeklyRunning: boolean;
  monthlyRunning: boolean;
  dailyVaultRunning: boolean;
  weeklyVaultRunning: boolean;
  inFlightWeekly: boolean;
  inFlightMonthly: boolean;
  inFlightDailyVault: boolean;
  inFlightWeeklyVault: boolean;
} {
  return {
    weeklyRunning: state.weeklyTimer !== null,
    monthlyRunning: state.monthlyTimer !== null,
    dailyVaultRunning: state.dailyVaultTimer !== null,
    weeklyVaultRunning: state.weeklyVaultTimer !== null,
    inFlightWeekly: state.inFlightWeekly !== null,
    inFlightMonthly: state.inFlightMonthly !== null,
    inFlightDailyVault: state.inFlightDailyVault !== null,
    inFlightWeeklyVault: state.inFlightWeeklyVault !== null,
  };
}

/**
 * Lifecycle + time-zone math tests for the periodic-notes scheduler.
 *
 * The cost-rollup emitters are mocked at the module boundary so this test
 * can exercise scheduler behavior with `vi.useFakeTimers()` without touching
 * the database. Real emitter behavior is covered in cost-rollups.test.ts.
 */
import type { Db } from "@ironworksai/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emitWeeklyMock = vi.fn(async () => ({ pagesEmitted: 0 }));
const emitMonthlyMock = vi.fn(async () => ({ pagesEmitted: 0 }));

vi.mock("../cost-rollups.js", () => ({
  emitWeeklyCostRollup: emitWeeklyMock,
  emitMonthlyCostRollup: emitMonthlyMock,
}));

// Imported AFTER vi.mock so the module picks up the mocked emitters.
const {
  startPeriodicNotesScheduler,
  stopPeriodicNotesScheduler,
  msUntilNextWeeklyFire,
  msUntilNextMonthlyFire,
  __getPeriodicNotesSchedulerState,
} = await import("../cron.js");

// Stub Db - emitters are mocked, so Db is never actually used.
const fakeDb = {} as Db;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

describe("msUntilNextWeeklyFire", () => {
  it("returns positive ms less than a week from a Wednesday", () => {
    const wed = new Date("2026-05-06T18:00:00Z"); // Wed 1pm CT (CDT)
    const ms = msUntilNextWeeklyFire(wed);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThan(WEEK_MS);
  });

  it("from Sunday 00:00 CT, fires at Sunday 00:30 CT (~30 min)", () => {
    // 2026-05-10 is a Sunday. 00:00 CDT = 05:00 UTC.
    const sunMidnightCt = new Date("2026-05-10T05:00:00Z");
    const ms = msUntilNextWeeklyFire(sunMidnightCt);
    expect(ms).toBeGreaterThan(29 * 60 * 1000);
    expect(ms).toBeLessThan(31 * 60 * 1000);
  });

  it("from Sunday 00:31 CT, fires next Sunday (~6.99 days)", () => {
    // 2026-05-10 00:31 CDT = 05:31 UTC.
    const justAfterFire = new Date("2026-05-10T05:31:00Z");
    const ms = msUntilNextWeeklyFire(justAfterFire);
    // ~7 days minus 1 minute.
    expect(ms).toBeGreaterThan(WEEK_MS - 2 * 60 * 1000);
    expect(ms).toBeLessThan(WEEK_MS);
  });
});

describe("msUntilNextMonthlyFire", () => {
  it("from middle of month, returns positive ms before the next 1st", () => {
    const midMay = new Date("2026-05-15T18:00:00Z");
    const ms = msUntilNextMonthlyFire(midMay);
    expect(ms).toBeGreaterThan(0);
    // From May 15 → June 1 00:30 CT is ~17 days; bound under 32 days.
    expect(ms).toBeLessThan(32 * DAY_MS);
    expect(ms).toBeGreaterThan(15 * DAY_MS);
  });

  it("from 1st of month at 00:00 CT, fires same day at 00:30 (~30 min)", () => {
    // 2026-06-01 00:00 CDT = 05:00 UTC.
    const firstAtMidnight = new Date("2026-06-01T05:00:00Z");
    const ms = msUntilNextMonthlyFire(firstAtMidnight);
    expect(ms).toBeGreaterThan(29 * 60 * 1000);
    expect(ms).toBeLessThan(31 * 60 * 1000);
  });

  it("from 1st of month at 00:31 CT, fires on the 1st of next month", () => {
    const firstJustAfter = new Date("2026-06-01T05:31:00Z");
    const ms = msUntilNextMonthlyFire(firstJustAfter);
    // June has 30 days → ~30 days minus 1 minute.
    expect(ms).toBeGreaterThan(28 * DAY_MS);
    expect(ms).toBeLessThan(32 * DAY_MS);
  });

  it("handles December → January year wrap", () => {
    const dec15 = new Date("2026-12-15T18:00:00Z");
    const ms = msUntilNextMonthlyFire(dec15);
    expect(ms).toBeGreaterThan(15 * DAY_MS);
    expect(ms).toBeLessThan(20 * DAY_MS);
  });
});

describe("scheduler lifecycle", () => {
  beforeEach(() => {
    emitWeeklyMock.mockReset();
    emitMonthlyMock.mockReset();
    // Default: emitters resolve immediately (overridden per-test as needed).
    emitWeeklyMock.mockResolvedValue({ pagesEmitted: 0 });
    emitMonthlyMock.mockResolvedValue({ pagesEmitted: 0 });
    vi.useFakeTimers();
    // Anchor fake clock to a known instant (Wed mid-day) so timer math is
    // deterministic and well below either fire boundary.
    vi.setSystemTime(new Date("2026-05-06T18:00:00Z"));
  });

  afterEach(async () => {
    await stopPeriodicNotesScheduler();
    vi.useRealTimers();
  });

  it("start arms both timers", () => {
    startPeriodicNotesScheduler(fakeDb);
    const s = __getPeriodicNotesSchedulerState();
    expect(s.weeklyRunning).toBe(true);
    expect(s.monthlyRunning).toBe(true);
  });

  it("start is idempotent (second call is a no-op)", () => {
    startPeriodicNotesScheduler(fakeDb);
    const before = __getPeriodicNotesSchedulerState();
    startPeriodicNotesScheduler(fakeDb);
    const after = __getPeriodicNotesSchedulerState();
    expect(after).toEqual(before);
    // Pending timers count should be 2 (weekly + monthly), not 4.
    expect(vi.getTimerCount()).toBe(2);
  });

  it("stop clears timers and resets state", async () => {
    startPeriodicNotesScheduler(fakeDb);
    expect(vi.getTimerCount()).toBe(2);
    await stopPeriodicNotesScheduler();
    expect(vi.getTimerCount()).toBe(0);
    const s = __getPeriodicNotesSchedulerState();
    expect(s.weeklyRunning).toBe(false);
    expect(s.monthlyRunning).toBe(false);
  });

  // Anchors picked so the next-fire is small (~30 min) - keeps fake-timer
  // advances cheap. Both anchors are deep inside CDT (no DST edges).
  // Sat 2026-05-09 23:59 CDT = 2026-05-10 04:59 UTC → next weekly fire is in 31 min.
  const SAT_2359_CDT = new Date("2026-05-10T04:59:00Z");
  // 2026-06-01 00:01 CDT = 2026-06-01 05:01 UTC → 29 min until monthly fire.
  const FIRST_0001_CDT = new Date("2026-06-01T05:01:00Z");

  it("weekly timer fires emitter and re-arms", async () => {
    vi.setSystemTime(SAT_2359_CDT);
    // Block monthly's emitter so its (never-firing) timer has no impact.
    emitMonthlyMock.mockImplementation(() => new Promise(() => {}));
    emitWeeklyMock.mockResolvedValueOnce({ pagesEmitted: 0 });
    startPeriodicNotesScheduler(fakeDb);
    await vi.advanceTimersByTimeAsync(32 * 60 * 1000);
    expect(emitWeeklyMock).toHaveBeenCalledTimes(1);
    expect(emitWeeklyMock).toHaveBeenCalledWith(fakeDb);
    expect(__getPeriodicNotesSchedulerState().weeklyRunning).toBe(true);
  });

  it("monthly timer fires emitter", async () => {
    vi.setSystemTime(FIRST_0001_CDT);
    // Block both emitters from resolving - their never-resolving promises
    // mean .finally never runs, so the timers never re-arm. We stop the
    // scheduler before draining (which would await the in-flight promises)
    // by clearing the inFlight slots manually via __getState - but since
    // there's no setter, instead resolve the monthly explicitly.
    let releaseMonthly: () => void = () => {};
    emitWeeklyMock.mockImplementation(() => new Promise(() => {}));
    emitMonthlyMock.mockImplementationOnce(
      () =>
        new Promise<{ pagesEmitted: number }>((resolve) => {
          releaseMonthly = () => resolve({ pagesEmitted: 0 });
        }),
    );
    startPeriodicNotesScheduler(fakeDb);
    await vi.advanceTimersByTimeAsync(32 * 60 * 1000);
    expect(emitMonthlyMock).toHaveBeenCalledTimes(1);
    expect(emitMonthlyMock).toHaveBeenCalledWith(fakeDb);
    // Resolve so afterEach's stop can drain.
    releaseMonthly();
  });

  it("emitter exception does not crash the scheduler - next tick still re-arms", async () => {
    vi.setSystemTime(SAT_2359_CDT);
    emitMonthlyMock.mockImplementation(() => new Promise(() => {}));
    emitWeeklyMock.mockRejectedValueOnce(new Error("boom"));
    startPeriodicNotesScheduler(fakeDb);
    await vi.advanceTimersByTimeAsync(32 * 60 * 1000);
    expect(emitWeeklyMock).toHaveBeenCalledTimes(1);
    expect(__getPeriodicNotesSchedulerState().weeklyRunning).toBe(true);
  });

  it("stop drains in-flight weekly emit", async () => {
    vi.setSystemTime(SAT_2359_CDT);
    let releaseWeekly: () => void = () => {};
    emitMonthlyMock.mockImplementation(() => new Promise(() => {}));
    emitWeeklyMock.mockImplementationOnce(
      () =>
        new Promise<{ pagesEmitted: number }>((resolve) => {
          releaseWeekly = () => resolve({ pagesEmitted: 0 });
        }),
    );
    startPeriodicNotesScheduler(fakeDb);
    await vi.advanceTimersByTimeAsync(32 * 60 * 1000);
    expect(emitWeeklyMock).toHaveBeenCalledTimes(1);
    expect(__getPeriodicNotesSchedulerState().inFlightWeekly).toBe(true);
    // Begin stop in parallel; resolve the in-flight emit so stop can drain.
    const stopPromise = stopPeriodicNotesScheduler();
    releaseWeekly();
    await stopPromise;
    expect(__getPeriodicNotesSchedulerState().inFlightWeekly).toBe(false);
  });
});

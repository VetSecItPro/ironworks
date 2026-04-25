/**
 * Unit tests for the skill evaluation rollup pure-function library.
 *
 * These tests verify the core math without any DB or docker dependency —
 * the main rollup script (skill-eval-rollup.mjs) is responsible for wiring
 * the DB I/O; this lib only owns the computation.
 *
 * Coverage:
 *   1. median() — empty array, odd count, even count (lower median)
 *   2. computeRollup() — happy path: positive delta, no auto-archive
 *   3. computeRollup() — negative delta below threshold with enough invocations → auto-archive
 *   4. computeRollup() — negative delta but below minInvocations → no auto-archive
 *   5. computeRollup() — invocations missing expected/actual → effectivenessDelta null
 *   6. computeRollup() — reopen_count correctly tallied from issueReopened flag
 *   7. computeRollup() — operator_thumbs_avg computed from mixed thumbs
 *   8. computeRollup() — all outcomes tallied correctly
 *   9. daysAgo() — returns correct date
 *   10. toPgTimestamp() — produces ISO string
 */

import { describe, expect, it } from "vitest";
import { computeRollup, daysAgo, median, toPgTimestamp } from "../../../scripts/skill-eval-rollup-lib.mjs";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInvocation(
  overrides: Partial<{
    id: string;
    recipeId: string;
    companyId: string;
    outcome: string | null;
    expectedRunsToCompletion: number | null;
    actualRunsToCompletion: number | null;
    operatorThumbs: number | null;
    issueReopened: boolean;
  }> = {},
) {
  return {
    id: `inv-${Math.random().toString(36).slice(2, 8)}`,
    recipeId: "recipe-1",
    companyId: "company-1",
    outcome: "completed",
    expectedRunsToCompletion: 4,
    actualRunsToCompletion: 3,
    operatorThumbs: null,
    issueReopened: false,
    ...overrides,
  };
}

// ── median() ─────────────────────────────────────────────────────────────────

describe("median()", () => {
  it("returns null for empty array", () => {
    expect(median([])).toBeNull();
  });

  it("returns the single element for a one-element array", () => {
    expect(median([7])).toBe(7);
  });

  it("returns the middle value for an odd-length array", () => {
    expect(median([3, 1, 4])).toBe(3);
  });

  it("returns the lower median for an even-length array", () => {
    // [1, 2, 3, 4] → sorted → mid = 2 → sorted[1] = 2 (lower median)
    expect(median([4, 1, 3, 2])).toBe(2);
  });

  it("handles negative values", () => {
    expect(median([-0.2, -0.1, -0.3])).toBe(-0.2);
  });
});

// ── computeRollup() ───────────────────────────────────────────────────────────

describe("computeRollup()", () => {
  it("returns zeros and nulls for empty input", () => {
    const r = computeRollup([]);
    expect(r.invocationsCount).toBe(0);
    expect(r.completedCount).toBe(0);
    expect(r.failedCount).toBe(0);
    expect(r.reopenCount).toBe(0);
    expect(r.effectivenessDelta).toBeNull();
    expect(r.operatorThumbsAvg).toBeNull();
    expect(r.shouldAutoArchive).toBe(false);
  });

  it("computes positive effectiveness delta (skill helped)", () => {
    // expected=4, actual=2 → delta = (4-2)/4 = 0.5
    const invocations = Array.from({ length: 5 }, () =>
      makeInvocation({ expectedRunsToCompletion: 4, actualRunsToCompletion: 2 }),
    );
    const r = computeRollup(invocations);
    expect(r.effectivenessDelta).toBeCloseTo(0.5);
    expect(r.shouldAutoArchive).toBe(false);
  });

  it("triggers auto-archive when delta < -0.10 and invocations >= 5", () => {
    // expected=4, actual=6 → delta = (4-6)/4 = -0.5 (well below -0.10)
    const invocations = Array.from({ length: 5 }, () =>
      makeInvocation({ expectedRunsToCompletion: 4, actualRunsToCompletion: 6 }),
    );
    const r = computeRollup(invocations);
    expect(r.effectivenessDelta).toBeCloseTo(-0.5);
    expect(r.shouldAutoArchive).toBe(true);
  });

  it("does NOT auto-archive when delta < -0.10 but invocations < 5", () => {
    // Only 4 invocations — not enough for auto-archive even if delta is bad.
    const invocations = Array.from({ length: 4 }, () =>
      makeInvocation({ expectedRunsToCompletion: 4, actualRunsToCompletion: 6 }),
    );
    const r = computeRollup(invocations);
    expect(r.shouldAutoArchive).toBe(false);
  });

  it("does NOT auto-archive when delta is exactly -0.10 (threshold is strict less-than)", () => {
    // delta = (10-11)/10 = -0.10 exactly → should NOT trigger (threshold is < not <=)
    const invocations = Array.from({ length: 5 }, () =>
      makeInvocation({ expectedRunsToCompletion: 10, actualRunsToCompletion: 11 }),
    );
    const r = computeRollup(invocations);
    expect(r.effectivenessDelta).toBeCloseTo(-0.1);
    expect(r.shouldAutoArchive).toBe(false);
  });

  it("returns null effectivenessDelta when all invocations lack expected/actual values", () => {
    const invocations = Array.from({ length: 6 }, () =>
      makeInvocation({ expectedRunsToCompletion: null, actualRunsToCompletion: null }),
    );
    const r = computeRollup(invocations);
    expect(r.effectivenessDelta).toBeNull();
    expect(r.shouldAutoArchive).toBe(false);
  });

  it("skips invocations with expectedRunsToCompletion = 0 to avoid divide-by-zero", () => {
    const invocations = [
      makeInvocation({ expectedRunsToCompletion: 0, actualRunsToCompletion: 3 }),
      makeInvocation({ expectedRunsToCompletion: 4, actualRunsToCompletion: 2 }),
    ];
    const r = computeRollup(invocations);
    // Only the second invocation contributes: (4-2)/4 = 0.5
    expect(r.effectivenessDelta).toBeCloseTo(0.5);
  });

  it("counts reopened issues correctly", () => {
    const invocations = [
      makeInvocation({ issueReopened: true }),
      makeInvocation({ issueReopened: true }),
      makeInvocation({ issueReopened: false }),
    ];
    const r = computeRollup(invocations);
    expect(r.reopenCount).toBe(2);
  });

  it("tallies completed and failed counts separately", () => {
    const invocations = [
      makeInvocation({ outcome: "completed" }),
      makeInvocation({ outcome: "completed" }),
      makeInvocation({ outcome: "failed" }),
      makeInvocation({ outcome: "cancelled" }),
    ];
    const r = computeRollup(invocations);
    expect(r.completedCount).toBe(2);
    expect(r.failedCount).toBe(1);
    expect(r.invocationsCount).toBe(4);
  });

  it("computes operatorThumbsAvg from mixed thumbs values", () => {
    const invocations = [
      makeInvocation({ operatorThumbs: 1 }),
      makeInvocation({ operatorThumbs: -1 }),
      makeInvocation({ operatorThumbs: 1 }),
      makeInvocation({ operatorThumbs: null }), // nulls excluded from avg
    ];
    const r = computeRollup(invocations);
    // (1 + -1 + 1) / 3 = 0.333...
    expect(r.operatorThumbsAvg).toBeCloseTo(0.333, 2);
  });

  it("returns null operatorThumbsAvg when all thumbs are null", () => {
    const invocations = Array.from({ length: 3 }, () => makeInvocation({ operatorThumbs: null }));
    const r = computeRollup(invocations);
    expect(r.operatorThumbsAvg).toBeNull();
  });

  it("respects custom autoArchiveThreshold override", () => {
    // delta = -0.15, default threshold -0.10 → archive
    // but with threshold -0.20, should NOT archive
    const invocations = Array.from({ length: 5 }, () =>
      makeInvocation({ expectedRunsToCompletion: 4, actualRunsToCompletion: 5 }),
    );
    const rDefault = computeRollup(invocations);
    expect(rDefault.shouldAutoArchive).toBe(true); // -0.25 < -0.10

    const rLenient = computeRollup(invocations, { autoArchiveThreshold: -0.3 });
    expect(rLenient.shouldAutoArchive).toBe(false); // -0.25 > -0.30
  });
});

// ── daysAgo() and toPgTimestamp() ────────────────────────────────────────────

describe("daysAgo()", () => {
  it("returns a Date exactly N days before the reference", () => {
    const ref = new Date("2026-04-25T12:00:00Z");
    const result = daysAgo(ref, 7);
    expect(result.toISOString()).toBe("2026-04-18T12:00:00.000Z");
  });

  it("does not mutate the reference date", () => {
    const ref = new Date("2026-04-25T12:00:00Z");
    const original = ref.toISOString();
    daysAgo(ref, 7);
    expect(ref.toISOString()).toBe(original);
  });
});

describe("toPgTimestamp()", () => {
  it("produces an ISO-8601 string Postgres can parse", () => {
    const d = new Date("2026-04-25T03:00:00Z");
    const ts = toPgTimestamp(d);
    expect(ts).toBe("2026-04-25T03:00:00.000Z");
    // Verify it round-trips through Date without loss.
    expect(new Date(ts).getTime()).toBe(d.getTime());
  });
});

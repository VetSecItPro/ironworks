/**
 * skill-eval-rollup-lib.mjs
 *
 * Pure-function core of the evaluation rollup. Isolated from I/O so unit tests
 * can exercise the delta math without a live DB or docker socket.
 *
 * All functions are exported individually — the main rollup script imports only
 * what it needs, keeping the dependency surface explicit.
 *
 * @see MDMP §2.5 for the counterfactual methodology.
 * @see MDMP §3.3 for the cron schedule.
 * @see MDMP §6 locked decision #4 — auto-archive threshold: delta < -0.10 over >= 5 invocations.
 */

// ---------------------------------------------------------------------------
// Types (JSDoc only — this is .mjs, not TypeScript)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} InvocationRow
 * @property {string} id
 * @property {string} recipeId
 * @property {string} companyId
 * @property {string|null} outcome  - 'completed' | 'failed' | 'cancelled' | 'inflight' | null
 * @property {number|null} expectedRunsToCompletion
 * @property {number|null} actualRunsToCompletion
 * @property {number|null} operatorThumbs  - -1 | 0 | 1
 * @property {boolean} issueReopened
 */

/**
 * @typedef {Object} RollupResult
 * @property {number} invocationsCount
 * @property {number} completedCount
 * @property {number} failedCount
 * @property {number} reopenCount
 * @property {number|null} effectivenessDelta  - null when not enough data
 * @property {number|null} operatorThumbsAvg
 * @property {boolean} shouldAutoArchive
 */

// ---------------------------------------------------------------------------
// Median helper
// ---------------------------------------------------------------------------

/**
 * Returns the median of a numeric array, or null when the array is empty.
 * Uses the lower median for even-length arrays (consistent with rolling-14d SQL query).
 *
 * @param {number[]} values
 * @returns {number|null}
 */
export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // Even length: lower median (matches percentile_disc(0.5) ORDER BY asc behaviour)
  return sorted.length % 2 === 1 ? sorted[mid] : sorted[mid - 1];
}

// ---------------------------------------------------------------------------
// Core rollup
// ---------------------------------------------------------------------------

/**
 * Computes a single skill recipe's evaluation metrics for a time window.
 *
 * @param {InvocationRow[]} invocations - all invocations in the window for this recipe
 * @param {Object} opts
 * @param {number} opts.autoArchiveThreshold  - defaults to -0.10 (MDMP §6 locked decision #4)
 * @param {number} opts.minInvocationsForAutoArchive  - defaults to 5
 * @returns {RollupResult}
 */
export function computeRollup(invocations, opts = {}) {
  const threshold = opts.autoArchiveThreshold ?? -0.1;
  const minInvocations = opts.minInvocationsForAutoArchive ?? 5;

  const invocationsCount = invocations.length;
  const completedCount = invocations.filter((r) => r.outcome === "completed").length;
  const failedCount = invocations.filter((r) => r.outcome === "failed").length;
  const reopenCount = invocations.filter((r) => r.issueReopened === true).length;

  // Effectiveness delta: only include rows where both values are present and expected > 0.
  // Rows missing either value are skipped — they contribute to counts but not the delta.
  const deltaInputs = invocations
    .filter(
      (r) =>
        r.expectedRunsToCompletion !== null &&
        r.expectedRunsToCompletion !== undefined &&
        r.expectedRunsToCompletion > 0 &&
        r.actualRunsToCompletion !== null &&
        r.actualRunsToCompletion !== undefined,
    )
    .map((r) => (r.expectedRunsToCompletion - r.actualRunsToCompletion) / r.expectedRunsToCompletion);

  const effectivenessDelta = deltaInputs.length > 0 ? median(deltaInputs) : null;

  // Operator thumbs average: mean of non-null values (-1, 0, 1).
  const thumbs = invocations
    .filter((r) => r.operatorThumbs !== null && r.operatorThumbs !== undefined)
    .map((r) => r.operatorThumbs);
  const operatorThumbsAvg = thumbs.length > 0 ? thumbs.reduce((sum, v) => sum + v, 0) / thumbs.length : null;

  // Auto-archive: negative delta below threshold over enough invocations.
  // Both conditions must hold — one failing invocation doesn't retire a new skill.
  const shouldAutoArchive =
    effectivenessDelta !== null && effectivenessDelta < threshold && invocationsCount >= minInvocations;

  return {
    invocationsCount,
    completedCount,
    failedCount,
    reopenCount,
    effectivenessDelta,
    operatorThumbsAvg,
    shouldAutoArchive,
  };
}

// ---------------------------------------------------------------------------
// Window helpers
// ---------------------------------------------------------------------------

/**
 * Returns the ISO timestamp for exactly N days before a reference Date.
 *
 * @param {Date} reference
 * @param {number} days
 * @returns {Date}
 */
export function daysAgo(reference, days) {
  const d = new Date(reference.getTime());
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

/**
 * Formats a Date as a Postgres-compatible ISO timestamp string.
 *
 * @param {Date} d
 * @returns {string}
 */
export function toPgTimestamp(d) {
  return d.toISOString();
}

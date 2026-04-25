#!/usr/bin/env node
/**
 * skill-eval-rollup.mjs
 *
 * Daily cron: populates skill_evaluations with a rolling 7-day window per
 * active skill recipe and auto-archives recipes that are persistently dragging
 * agent performance below the -10% effectiveness threshold.
 *
 * Runs inside the VPS environment with access to the ironworks-atlas-postgres-1
 * docker container. Uses Node child_process to run psql inside the container —
 * the same pattern as scripts/monitors/daily-spend-alert.sh so no new infra
 * is needed.
 *
 * Exit codes:
 *   0 — success (including "zero rows" when no recipes are active yet)
 *   1 — partial failure (some recipes processed, some errored)
 *   2 — full DB unreachable at startup
 *
 * Logs to stdout (cron redirects to /var/log/skill-eval-rollup.log).
 *
 * VPS cron entry (daily 03:00 UTC = 22:00 CT):
 *   0 3 * * * node /root/ironworks-atlas/scripts/skill-eval-rollup.mjs >> /var/log/skill-eval-rollup.log 2>&1
 *
 * @see MDMP §3.3 for eval harness design.
 * @see MDMP §3.5 for the auto-archive threshold rationale.
 * @see scripts/skill-eval-rollup-lib.mjs for the pure-function math core.
 */

import { execSync } from "node:child_process";
import { computeRollup, daysAgo, toPgTimestamp } from "./skill-eval-rollup-lib.mjs";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PG_CONTAINER = process.env.DOCKER_PG_CONTAINER ?? "ironworks-atlas-postgres-1";
const PG_USER = process.env.PG_USER ?? "ironworks";
const PG_DB = process.env.PG_DB ?? "ironworks";
/** Rolling window in days. MDMP §3.3 specifies 7 days. */
const WINDOW_DAYS = 7;

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

/** Prints with a Central Time timestamp prefix (matches daily-spend-alert.sh convention). */
function log(message) {
  const ts = new Date().toLocaleString("en-US", { timeZone: "America/Chicago", hour12: false });
  process.stdout.write(`[${ts} CT] ${message}\n`);
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/**
 * Runs a SQL string inside the postgres container and returns raw text output.
 * The -tA flags suppress column headers and alignment, giving clean pipe-separated rows.
 *
 * @param {string} sql
 * @returns {string}
 */
function psql(sql) {
  // Escape single quotes in the SQL string for safe shell interpolation.
  const escaped = sql.replace(/'/g, "'\\''");
  return execSync(`docker exec ${PG_CONTAINER} psql -U ${PG_USER} -d ${PG_DB} -tAc '${escaped}'`, {
    encoding: "utf8",
    timeout: 30_000,
  }).trim();
}

/**
 * Parses pipe-separated psql output into rows of named columns.
 *
 * @param {string} raw  - output from psql() with -tA flags
 * @param {string[]} columns  - column names in output order
 * @returns {Array<Record<string, string>>}
 */
function parseRows(raw, columns) {
  if (!raw) return [];
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const parts = line.split("|");
      /** @type {Record<string, string>} */
      const row = {};
      for (let i = 0; i < columns.length; i++) {
        row[columns[i]] = parts[i] ?? "";
      }
      return row;
    });
}

// ---------------------------------------------------------------------------
// Connectivity check
// ---------------------------------------------------------------------------

function checkDb() {
  try {
    psql("SELECT 1;");
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Issue reopen detection
// ---------------------------------------------------------------------------

/**
 * Returns a Set of issue IDs that were reopened after the given cutoff.
 * "Reopened" means: the issue's current status is NOT in a terminal set
 * AND the issue had a completed/cancelled status at some earlier point.
 *
 * Since IronWorks doesn't have a full status-history table in v1, we use the
 * best-effort heuristic from MDMP §3.3: current status not in terminal states
 * on issues that had an invocation that was marked 'completed'.
 *
 * @param {string[]} issueIds
 * @param {string} windowStartIso
 * @returns {Set<string>}
 */
function detectReopenedIssues(issueIds, windowStartIso) {
  if (issueIds.length === 0) return new Set();
  const idList = issueIds.map((id) => `'${id}'`).join(",");
  // Terminal statuses in IronWorks issues table.
  const raw = psql(
    `SELECT id FROM issues
     WHERE id IN (${idList})
       AND status NOT IN ('completed','cancelled','closed','done','resolved')
       AND updated_at >= '${windowStartIso}';`,
  );
  const rows = parseRows(raw, ["id"]);
  return new Set(rows.map((r) => r.id));
}

// ---------------------------------------------------------------------------
// Main rollup
// ---------------------------------------------------------------------------

async function main() {
  log("skill-eval-rollup: starting");

  if (!checkDb()) {
    log(`ERROR: DB unreachable — cannot connect to container ${PG_CONTAINER}`);
    process.exit(2);
  }

  const now = new Date();
  const windowEnd = now;
  const windowStart = daysAgo(now, WINDOW_DAYS);
  const windowStartIso = toPgTimestamp(windowStart);
  const windowEndIso = toPgTimestamp(windowEnd);

  log(`Window: ${windowStartIso} → ${windowEndIso}`);

  // Fetch all active recipes that have at least 1 invocation in the window.
  const recipesRaw = psql(
    `SELECT DISTINCT si.recipe_id, sr.company_id
     FROM skill_invocations si
     JOIN skill_recipes sr ON sr.id = si.recipe_id
     WHERE si.injected_at >= '${windowStartIso}'
       AND si.injected_at <  '${windowEndIso}'
       AND sr.status IN ('active')
       AND sr.archived_at IS NULL;`,
  );

  const recipeRows = parseRows(recipesRaw, ["recipeId", "companyId"]);
  log(`Found ${recipeRows.length} recipe(s) with invocations in window`);

  if (recipeRows.length === 0) {
    log("No active recipes with invocations — nothing to rollup. Exiting 0.");
    process.exit(0);
  }

  let successCount = 0;
  let errorCount = 0;
  let archivedCount = 0;

  for (const { recipeId, companyId } of recipeRows) {
    try {
      // Fetch all invocations for this recipe in the window.
      const invRaw = psql(
        `SELECT id, outcome, expected_runs_to_completion, actual_runs_to_completion,
                operator_thumbs, issue_id
         FROM skill_invocations
         WHERE recipe_id = '${recipeId}'
           AND injected_at >= '${windowStartIso}'
           AND injected_at <  '${windowEndIso}';`,
      );

      const invRows = parseRows(invRaw, [
        "id",
        "outcome",
        "expectedRunsToCompletion",
        "actualRunsToCompletion",
        "operatorThumbs",
        "issueId",
      ]);

      // Build issue-ID list for reopen detection.
      const issueIds = invRows.map((r) => r.issueId).filter(Boolean);
      const reopenedSet = detectReopenedIssues(issueIds, windowStartIso);

      // Map raw DB rows to the shape computeRollup expects.
      const invocations = invRows.map((r) => ({
        id: r.id,
        recipeId,
        companyId,
        outcome: r.outcome || null,
        expectedRunsToCompletion: r.expectedRunsToCompletion !== "" ? parseFloat(r.expectedRunsToCompletion) : null,
        actualRunsToCompletion: r.actualRunsToCompletion !== "" ? parseInt(r.actualRunsToCompletion, 10) : null,
        operatorThumbs: r.operatorThumbs !== "" ? parseInt(r.operatorThumbs, 10) : null,
        issueReopened: r.issueId ? reopenedSet.has(r.issueId) : false,
      }));

      const result = computeRollup(invocations);

      // Build the UPSERT — the unique index on (recipe_id, window_start) makes this idempotent.
      const deltaSql = result.effectivenessDelta !== null ? `'${result.effectivenessDelta.toFixed(4)}'` : "NULL";
      const thumbsAvgSql = result.operatorThumbsAvg !== null ? `'${result.operatorThumbsAvg.toFixed(3)}'` : "NULL";

      psql(
        `INSERT INTO skill_evaluations
           (company_id, recipe_id, window_start, window_end,
            invocations_count, completed_count, failed_count, reopen_count,
            effectiveness_delta, operator_thumbs_avg, computed_at)
         VALUES
           ('${companyId}', '${recipeId}', '${windowStartIso}', '${windowEndIso}',
            ${result.invocationsCount}, ${result.completedCount}, ${result.failedCount}, ${result.reopenCount},
            ${deltaSql}, ${thumbsAvgSql}, NOW())
         ON CONFLICT (recipe_id, window_start)
         DO UPDATE SET
           window_end          = EXCLUDED.window_end,
           invocations_count   = EXCLUDED.invocations_count,
           completed_count     = EXCLUDED.completed_count,
           failed_count        = EXCLUDED.failed_count,
           reopen_count        = EXCLUDED.reopen_count,
           effectiveness_delta = EXCLUDED.effectiveness_delta,
           operator_thumbs_avg = EXCLUDED.operator_thumbs_avg,
           computed_at         = NOW();`,
      );

      log(
        `recipe=${recipeId.slice(0, 8)} invocations=${result.invocationsCount} delta=${result.effectivenessDelta?.toFixed(4) ?? "n/a"} archive=${result.shouldAutoArchive}`,
      );

      // Auto-archive: flip both the recipe AND the linked company_skills row if present.
      // MDMP §6 locked decision #4: delta < -0.10 over >= 5 invocations.
      if (result.shouldAutoArchive) {
        psql(
          `UPDATE skill_recipes
           SET archived_at = NOW(), status = 'archived', updated_at = NOW()
           WHERE id = '${recipeId}' AND archived_at IS NULL;`,
        );
        // Mark the materialised company_skills row inactive (archived_at set).
        // The company_skills table tracks the live skill loadable by agents.
        psql(
          `UPDATE company_skills
           SET updated_at = NOW()
           WHERE recipe_id = '${recipeId}';`,
        );
        log(`AUTO-ARCHIVED recipe=${recipeId.slice(0, 8)} (delta=${result.effectivenessDelta?.toFixed(4)})`);
        archivedCount++;
      }

      successCount++;
    } catch (err) {
      log(`ERROR processing recipe=${recipeId.slice(0, 8)}: ${String(err)}`);
      errorCount++;
    }
  }

  log(
    `Done: ${successCount} upserted, ${archivedCount} auto-archived, ${errorCount} errored out of ${recipeRows.length} recipes`,
  );

  if (errorCount > 0 && successCount === 0) {
    process.exit(1);
  }
  if (errorCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`FATAL: ${String(err)}\n`);
  process.exit(2);
});

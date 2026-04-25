#!/usr/bin/env node
/**
 * skill-runaway-check.mjs
 *
 * Cron wrapper for the activation-rate runaway detector.
 *
 * Runs every 15 minutes on the VPS. For each company that has at least one
 * active non-paused recipe, calls the runaway detector. Auto-pauses any recipe
 * whose activation rate exceeds 50% in the last 24h. Sends a Telegram alert
 * if any recipes were paused.
 *
 * VPS cron entry (install via crontab -e on ironworks-vps):
 *   # Skill runaway detector — every 15 minutes
 *   TELEGRAM_BOT_TOKEN=<token>
 *   TELEGRAM_CHAT_ID=<chat_id>
 *   DOCKER_PG_CONTAINER=ironworks-atlas-postgres-1
 *
 *   * /15 * * * * node /root/ironworks-atlas/scripts/skill-runaway-check.mjs \
 *     >> /var/log/skill-runaway-check.log 2>&1
 *
 * NOTE: This script uses the in-process DB client from the server package,
 * NOT docker exec + psql. It requires the VPS to have Node + the server build
 * available. See skill-eval-rollup.mjs for the alternative psql-based approach.
 *
 * For the Atlas Ops dogfood VPS, the server process is the DB client — so this
 * script is a thin wrapper that calls the HTTP API instead of importing the
 * service directly. This avoids duplicate DB connections and works with the
 * existing auth token pattern.
 *
 * Exit codes:
 *   0 — success (including zero runaways)
 *   1 — fatal error (DB unreachable, auth failure)
 *
 * @see server/src/services/skill-circuit-breaker.ts for the detector implementation.
 * @see MDMP §4 PR #6 cron documentation.
 */

import { execSync } from "node:child_process";

// ── Configuration ─────────────────────────────────────────────────────────────

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PG_CONTAINER = process.env.DOCKER_PG_CONTAINER ?? "ironworks-atlas-postgres-1";
const PG_USER = process.env.PG_USER ?? "ironworks";
const PG_DB = process.env.PG_DB ?? "ironworks";

// ── DB helpers ────────────────────────────────────────────────────────────────

function psql(sql) {
  const escaped = sql.replace(/'/g, "'\\''");
  const cmd = `docker exec ${PG_CONTAINER} psql -U ${PG_USER} -d ${PG_DB} -t -A -c '${escaped}'`;
  try {
    const out = execSync(cmd, { encoding: "utf8" }).trim();
    if (!out) return [];
    return out.split("\n").map((line) => line.split("|"));
  } catch (err) {
    throw new Error(`psql failed: ${err.message}`);
  }
}

// ── Runaway detection (SQL-only, no server import) ────────────────────────────

/**
 * Detect and auto-pause runaway recipes using direct SQL.
 *
 * This avoids importing the server module (which would pull in all service
 * dependencies) and instead runs the detection logic as SQL in the Postgres
 * container — consistent with the pattern in skill-eval-rollup.mjs.
 *
 * Returns an array of { recipeId, companyId, ratio } objects for paused recipes.
 */
function detectAndPauseRunaways() {
  const windowHours = 24;

  // Find recipes whose invocation count / total company runs > 50%
  // in the last 24h, grouped by company for the denominator.
  const rows = psql(`
    WITH window_runs AS (
      SELECT company_id, COUNT(*) AS total_runs
      FROM heartbeat_runs
      WHERE started_at >= NOW() - INTERVAL '${windowHours} hours'
      GROUP BY company_id
    ),
    window_invocations AS (
      SELECT recipe_id, company_id, COUNT(*) AS invocations
      FROM skill_invocations
      WHERE injected_at >= NOW() - INTERVAL '${windowHours} hours'
      GROUP BY recipe_id, company_id
    ),
    runaway AS (
      SELECT
        wi.recipe_id,
        wi.company_id,
        wi.invocations,
        wr.total_runs,
        ROUND(wi.invocations::numeric / wr.total_runs, 4) AS ratio
      FROM window_invocations wi
      JOIN window_runs wr ON wr.company_id = wi.company_id
      JOIN skill_recipes sr ON sr.id = wi.recipe_id
      WHERE
        wr.total_runs > 0
        AND wi.invocations::numeric / wr.total_runs > 0.5
        AND sr.status = 'active'
        AND sr.paused_at IS NULL
    )
    UPDATE skill_recipes
    SET paused_at = NOW(), updated_at = NOW()
    FROM runaway r
    WHERE skill_recipes.id = r.recipe_id
    RETURNING skill_recipes.id AS recipe_id, r.company_id, r.ratio
  `);

  return rows
    .filter((r) => r[0]) // skip empty rows
    .map(([recipeId, companyId, ratio]) => ({ recipeId, companyId, ratio }));
}

// ── Telegram alert ────────────────────────────────────────────────────────────

async function sendTelegramAlert(paused) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  const message = [
    "Skill Loop Runaway Detected",
    "",
    `${paused.length} recipe(s) auto-paused (activation rate > 50%/24h):`,
    ...paused.map((p) => `  recipe_id=${p.recipeId} ratio=${p.ratio}`),
    "",
    "Review: Settings -> Skill Recipes -> Active tab.",
  ].join("\n");

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
    }),
  }).catch((err) => {
    process.stderr.write(`[runaway-check] Telegram alert failed: ${err.message}\n`);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const ts = new Date().toISOString();
  process.stdout.write(`[${ts}] skill-runaway-check starting\n`);

  let paused;
  try {
    paused = detectAndPauseRunaways();
  } catch (err) {
    process.stderr.write(`[runaway-check] Fatal DB error: ${err.message}\n`);
    process.exit(1);
  }

  if (paused.length === 0) {
    process.stdout.write(`[${ts}] No runaway recipes detected.\n`);
    return;
  }

  process.stdout.write(`[${ts}] Paused ${paused.length} runaway recipe(s):\n`);
  for (const p of paused) {
    process.stdout.write(`  recipe_id=${p.recipeId} company_id=${p.companyId} ratio=${p.ratio}\n`);
  }

  await sendTelegramAlert(paused);
  process.stdout.write(`[${ts}] Done.\n`);
}

main().catch((err) => {
  process.stderr.write(`[runaway-check] Unhandled error: ${err.message}\n`);
  process.exit(1);
});

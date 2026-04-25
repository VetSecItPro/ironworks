#!/usr/bin/env bash
# =============================================================================
# skill-digest.sh
# Daily Telegram digest for the IronWorks self-improving skill loop.
#
# Reports the past 24h activity of the skill pipeline:
#   - New skills proposed by agents
#   - Skills auto-archived due to effectiveness drift
#   - Skills in the warning band (delta < -5%)
#   - Total active skills across the fleet
#   - Runaway skills (activation rate > 50% in last 24h)
#
# Companion to:
#   - daily-spend-alert.sh     (cost monitoring)
#   - clawhq-health-monitor.sh (uptime alerts)
#   - skill-eval-rollup.mjs    (populates skill_evaluations that we query here)
#
# SETUP ON ironworks-vps:
# 1. Place this script at /opt/monitors/skill-digest.sh
# 2. chmod +x /opt/monitors/skill-digest.sh
# 3. Install cron (14:00 UTC = 09:00 CT daily):
#    0 14 * * * \
#      TELEGRAM_BOT_TOKEN=<token> TELEGRAM_CHAT_ID=<chat_id> \
#      DOCKER_PG_CONTAINER=ironworks-atlas-postgres-1 \
#      /opt/monitors/skill-digest.sh
#
# Silent when all counts are zero — doesn't spam empty digests.
# Exits 0 always (cron failures should not generate alert noise of their own).
#
# Exit codes: 0 always.
# =============================================================================

set -uo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PG_CONTAINER="${DOCKER_PG_CONTAINER:-ironworks-atlas-postgres-1}"
PG_USER="${PG_USER:-ironworks}"
PG_DB="${PG_DB:-ironworks}"
BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT_ID="${TELEGRAM_CHAT_ID:-}"
LOG_FILE="${LOG_FILE:-/var/log/skill-digest.log}"

# ---------------------------------------------------------------------------
# Helpers (match daily-spend-alert.sh conventions)
# ---------------------------------------------------------------------------
ct_timestamp() {
  TZ="America/Chicago" date "+%Y-%m-%d %H:%M:%S CT"
}

log() {
  local msg="$1"
  local ts
  ts="$(ct_timestamp)"
  echo "[$ts] $msg" >> "$LOG_FILE" 2>/dev/null || true
  echo "[$ts] $msg"
}

send_telegram() {
  local message="$1"
  if [[ -z "$BOT_TOKEN" || -z "$CHAT_ID" ]]; then
    log "WARN: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping Telegram"
    return 0
  fi
  curl -s --max-time 10 \
    -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -d "chat_id=${CHAT_ID}" \
    -d "parse_mode=Markdown" \
    --data-urlencode "text=${message}" \
    > /dev/null 2>&1 || log "WARN: Failed to send Telegram message"
}

run_psql() {
  local sql="$1"
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc "$sql" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Connectivity check
# ---------------------------------------------------------------------------
if ! run_psql "SELECT 1;" > /dev/null 2>&1; then
  log "ERROR: DB unreachable — skipping digest"
  exit 0
fi

# ---------------------------------------------------------------------------
# Date arithmetic
# ---------------------------------------------------------------------------
# 24h ago in ISO format, compatible with both GNU and BSD date.
SINCE_24H=$(date -u -d "24 hours ago" "+%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -v-24H "+%Y-%m-%dT%H:%M:%SZ")
TODAY=$(TZ="America/Chicago" date "+%Y-%m-%d")

# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------

# New skills proposed by agents in last 24h.
new_proposed=$(run_psql \
  "SELECT COUNT(*) FROM skill_recipes
   WHERE status = 'proposed'
     AND created_at >= '${SINCE_24H}';")

# Skills auto-archived in last 24h (archived_at set; originally extracted not authored).
auto_archived=$(run_psql \
  "SELECT COUNT(*) FROM skill_recipes
   WHERE status = 'archived'
     AND archived_at >= '${SINCE_24H}';")

# Skills in warning band: effectiveness_delta < -0.05 in the most recent eval window.
# Pulls one row per recipe (most recently computed window).
warning_band=$(run_psql \
  "SELECT COUNT(DISTINCT recipe_id) FROM skill_evaluations se
   WHERE effectiveness_delta < -0.05
     AND computed_at = (
       SELECT MAX(computed_at) FROM skill_evaluations
       WHERE recipe_id = se.recipe_id
     );")

# Total active skills fleet-wide.
total_active=$(run_psql \
  "SELECT COUNT(*) FROM skill_recipes WHERE status = 'active' AND archived_at IS NULL;")

# Runaway detection: recipes with activation rate > 50% of heartbeat runs in last 24h.
# Activation rate = invocations / total heartbeat runs for the same company.
# We approximate per-recipe: invocations > 0.5 * company heartbeat runs in window.
runaway_raw=$(run_psql \
  "WITH runs_24h AS (
     SELECT company_id, COUNT(*) AS total_runs
     FROM heartbeat_runs
     WHERE created_at >= '${SINCE_24H}'
     GROUP BY company_id
   ),
   inv_24h AS (
     SELECT recipe_id, company_id, COUNT(*) AS inv_count
     FROM skill_invocations
     WHERE injected_at >= '${SINCE_24H}'
     GROUP BY recipe_id, company_id
   )
   SELECT sr.title, i.inv_count, r.total_runs
   FROM inv_24h i
   JOIN runs_24h r ON r.company_id = i.company_id
   JOIN skill_recipes sr ON sr.id = i.recipe_id
   WHERE r.total_runs > 0
     AND (i.inv_count::float / r.total_runs) > 0.5
   ORDER BY (i.inv_count::float / r.total_runs) DESC
   LIMIT 5;")

# ---------------------------------------------------------------------------
# Normalise counts (empty string → 0)
# ---------------------------------------------------------------------------
new_proposed="${new_proposed:-0}"
auto_archived="${auto_archived:-0}"
warning_band="${warning_band:-0}"
total_active="${total_active:-0}"

# ---------------------------------------------------------------------------
# Early exit when nothing to report
# ---------------------------------------------------------------------------
if [[ "$new_proposed" == "0" && "$auto_archived" == "0" && "$warning_band" == "0" && -z "$runaway_raw" ]]; then
  log "No skill loop activity in the last 24h — no Telegram sent"
  exit 0
fi

# ---------------------------------------------------------------------------
# Build Telegram message
# ---------------------------------------------------------------------------
msg="📋 *Skill loop digest — ${TODAY}*
• ${new_proposed} new skill(s) proposed (last 24h)
• ${auto_archived} skill(s) auto-archived (effectiveness drift)
• ${warning_band} skill(s) warning-band (delta < -5%)
• Atlas Ops fleet: ${total_active} total active skills"

# Append runaway warnings if any.
if [[ -n "$runaway_raw" ]]; then
  msg+="

⚠️ *Runaway skill(s) detected (>50% activation rate):*"
  while IFS='|' read -r title inv_count total_runs; do
    if [[ -n "$title" && -n "$inv_count" && -n "$total_runs" ]]; then
      pct=$(awk -v i="$inv_count" -v t="$total_runs" 'BEGIN { printf "%d", (i/t)*100 }')
      msg+="
  • ${title} — ${pct}% activation (${inv_count}/${total_runs} runs)"
    fi
  done <<< "$runaway_raw"
fi

ts=$(ct_timestamp)
msg+="

_Sent at ${ts}_"

# ---------------------------------------------------------------------------
# Send
# ---------------------------------------------------------------------------
log "Sending digest: proposed=${new_proposed} archived=${auto_archived} warning=${warning_band} active=${total_active}"
send_telegram "$msg"
exit 0

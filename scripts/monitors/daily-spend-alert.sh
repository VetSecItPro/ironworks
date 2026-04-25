#!/usr/bin/env bash
# =============================================================================
# daily-spend-alert.sh
# Reads yesterday's cost_rollup_daily total and posts a Telegram alert if
# the fleet spent over the configured threshold.
#
# Companion to:
#   - clawhq-health-monitor.sh         (uptime alerts)
#   - ironworks-drift-monitor.sh       (master drift alerts)
#   - openrouter-model-watcher.mjs     (model registry drift)
#
# This one closes the cost-control loop: the per-agent daily quota guard
# (packages/adapters/openrouter-api/src/server/daily-quota.ts) prevents
# *count* runaway; this script catches *cost* runaway (paid-tier models, or
# unexpected token volume on free-tier models that have surcharges).
#
# SETUP ON ironworks-vps:
# 1. Place this script at /opt/monitors/daily-spend-alert.sh
# 2. chmod +x /opt/monitors/daily-spend-alert.sh
# 3. Install cron (8am CT daily — after the nightly rollup at 02:00 CT runs):
#    0 8 * * * \
#      DAILY_SPEND_THRESHOLD_USD=50 \
#      DOCKER_PG_CONTAINER=ironworks-atlas-postgres-1 \
#      PG_USER=ironworks PG_DB=ironworks \
#      TELEGRAM_BOT_TOKEN=<token> TELEGRAM_CHAT_ID=<chat_id> \
#      /opt/monitors/daily-spend-alert.sh
#
# HOW IT WORKS:
# - Queries cost_rollup_daily for day=yesterday (UTC) — the nightly cron
#   has already aggregated cost_events into this table by 02:00 CT.
# - SUM(cost_usd_micro) / 1_000_000 = USD spend.
# - If total >= threshold, sends Telegram alert with per-company breakdown.
# - If under threshold, logs a single "below threshold" line and exits 0.
# - Threshold defaults to $50/day; override via DAILY_SPEND_THRESHOLD_USD.
#
# Exit codes: 0 always. Failures are logged but don't fail the cron — we
# don't want a transient psql hiccup to spam alerts.
# =============================================================================

set -uo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
THRESHOLD_USD="${DAILY_SPEND_THRESHOLD_USD:-50}"
PG_CONTAINER="${DOCKER_PG_CONTAINER:-ironworks-atlas-postgres-1}"
PG_USER="${PG_USER:-ironworks}"
PG_DB="${PG_DB:-ironworks}"
BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT_ID="${TELEGRAM_CHAT_ID:-}"
LOG_FILE="${LOG_FILE:-/var/log/daily-spend-alert.log}"

# Yesterday in UTC — matches cost_rollup_daily.day grain (date type, no tz).
YESTERDAY_UTC=$(date -u -d "yesterday" "+%Y-%m-%d" 2>/dev/null || date -u -v-1d "+%Y-%m-%d")

# ---------------------------------------------------------------------------
# Helpers
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
    > /dev/null 2>&1 || log "WARN: Failed to send Telegram"
}

run_psql() {
  local sql="$1"
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc "$sql" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------
total_micro=$(run_psql "SELECT COALESCE(SUM(cost_usd_micro), 0) FROM cost_rollup_daily WHERE day = '${YESTERDAY_UTC}';")

if [[ -z "$total_micro" ]]; then
  log "WARN: psql query returned empty — DB unreachable or table missing. Skipping alert."
  exit 0
fi

# Convert micro-USD to USD with 2-decimal precision via awk (bash can't float).
total_usd=$(awk -v m="$total_micro" 'BEGIN { printf "%.2f", m / 1000000.0 }')
threshold_micro=$(awk -v t="$THRESHOLD_USD" 'BEGIN { printf "%d", t * 1000000 }')

# ---------------------------------------------------------------------------
# Branch on threshold
# ---------------------------------------------------------------------------
if (( total_micro < threshold_micro )); then
  log "OK: ${YESTERDAY_UTC} fleet spend = \$${total_usd} (threshold \$${THRESHOLD_USD}) — no alert"
  exit 0
fi

# Over threshold — build per-company breakdown.
breakdown=$(run_psql "SELECT c.name, ROUND(SUM(r.cost_usd_micro)::numeric / 1000000, 2) AS usd FROM cost_rollup_daily r JOIN companies c ON c.id = r.company_id WHERE r.day = '${YESTERDAY_UTC}' GROUP BY c.name ORDER BY usd DESC;")

# Format for Telegram (one line per company, indented).
breakdown_md=""
while IFS='|' read -r name usd; do
  if [[ -n "$name" ]]; then
    breakdown_md+="
  • ${name}: \$${usd}"
  fi
done <<< "$breakdown"

ts=$(ct_timestamp)
alert_msg="🚨 *Atlas Ops fleet spend alert*
Yesterday (${YESTERDAY_UTC} UTC) total: *\$${total_usd}* (over \$${THRESHOLD_USD} threshold).
Breakdown:${breakdown_md}

Sent at ${ts}."

log "ALERT: yesterday spend \$${total_usd} >= threshold \$${THRESHOLD_USD}"
send_telegram "$alert_msg"
exit 0

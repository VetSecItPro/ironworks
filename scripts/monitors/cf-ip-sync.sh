#!/usr/bin/env bash
# =============================================================================
# cf-ip-sync.sh
# Sync Cloudflare's published IP ranges into both layers of edge protection:
#   1. Caddy `trusted_proxies static <ranges>` block (so Caddy reads the real
#      client IP from CF-Connecting-IP)
#   2. iptables CADDY-CF-ONLY chain (so the VPS only accepts public :80/:443
#      from CF — defense-in-depth if origin IP leaks)
#
# Both sites (command.useapex.io, missionreadytech.cloud) share this trust
# list — single source of truth, lockstep.
#
# Idempotent: safe to run on a fresh install or daily/weekly. Detects whether
# the IP list changed before reloading services.
#
# Cron entry (install at /opt/monitors/cf-ip-sync.sh, then `crontab -e`):
#   # CF IP refresh — Mondays 14:00 UTC = 09:00 CT
#   0 14 * * 1 TELEGRAM_BOT_TOKEN=<t> TELEGRAM_CHAT_ID=<c> /opt/monitors/cf-ip-sync.sh
#
# Exit codes:
#   0 — success (no changes OR changes applied + services reloaded)
#   1 — fetch failed (CF endpoint unreachable; existing rules untouched)
#   2 — Caddyfile validation failed after edit (auto-rolled back)
#   3 — iptables apply failed (auto-rolled back)
# =============================================================================

set -euo pipefail

CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
STATE_DIR="${STATE_DIR:-/var/lib/cf-ip-sync}"
LOG_FILE="${LOG_FILE:-/var/log/cf-ip-sync.log}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

mkdir -p "$STATE_DIR"

# ── helpers ─────────────────────────────────────────────────────────────────
ct_ts() { TZ="America/Chicago" date "+%Y-%m-%d %H:%M:%S CT"; }
log() { echo "[$(ct_ts)] $*" | tee -a "$LOG_FILE" >&2 ; }
notify() {
  local msg="$1"
  if [[ -n "$TELEGRAM_BOT_TOKEN" && -n "$TELEGRAM_CHAT_ID" ]]; then
    curl -s --max-time 10 -X POST \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_CHAT_ID}" \
      -d "parse_mode=Markdown" \
      --data-urlencode "text=${msg}" > /dev/null 2>&1 || true
  fi
}

# ── 1. Fetch CF IP lists ────────────────────────────────────────────────────
log "Fetching CF IP ranges..."
CF_V4=$(curl -sf --max-time 15 https://www.cloudflare.com/ips-v4) || {
  log "ERROR: Could not fetch CF IPv4 list"
  notify "🚨 cf-ip-sync: failed to fetch CF IPv4 list. Existing rules untouched."
  exit 1
}
CF_V6=$(curl -sf --max-time 15 https://www.cloudflare.com/ips-v6) || {
  log "ERROR: Could not fetch CF IPv6 list"
  notify "🚨 cf-ip-sync: failed to fetch CF IPv6 list. Existing rules untouched."
  exit 1
}
[[ -z "$CF_V4" || -z "$CF_V6" ]] && {
  log "ERROR: CF IP list empty"
  notify "🚨 cf-ip-sync: CF IP list is empty. Refusing to apply."
  exit 1
}

# Normalize: sort + de-dupe so the hash is stable across CF reorderings
CF_V4_SORTED=$(echo "$CF_V4" | sort -u)
CF_V6_SORTED=$(echo "$CF_V6" | sort -u)

# ── 2. Hash for change detection ────────────────────────────────────────────
NEW_HASH=$(printf '%s\n%s\n' "$CF_V4_SORTED" "$CF_V6_SORTED" | sha256sum | cut -d' ' -f1)
PREV_HASH=$(cat "$STATE_DIR/last-hash" 2>/dev/null || echo "")

if [[ "$NEW_HASH" == "$PREV_HASH" ]]; then
  log "No changes (hash $NEW_HASH). Skipping reload."
  exit 0
fi

log "CF IP list changed (hash $PREV_HASH -> $NEW_HASH). Updating layers..."

# ── 3. Update Caddyfile trusted_proxies block ───────────────────────────────
# Build the ranges line (8 ranges per line for readability)
RANGES_FMT=$(printf '%s\n' $CF_V4_SORTED $CF_V6_SORTED | paste -d' ' - - - - - - - - | sed 's/[[:space:]]*$//' | sed 's/^/\t\t\t/' | sed '$!s/$/ \\/')

CADDYFILE_BAK="${CADDYFILE}.bak.cf-ip-sync.$(date +%s)"
cp "$CADDYFILE" "$CADDYFILE_BAK"

# Edit in-place: replace the static-IPs portion of the trusted_proxies block.
# Marker pattern: `trusted_proxies static \` followed by indented IP lines, until `client_ip_headers`.
python3 - "$CADDYFILE" <<PYEOF || { log "ERROR: Caddyfile edit failed"; cp "$CADDYFILE_BAK" "$CADDYFILE"; notify "🚨 cf-ip-sync: Caddyfile edit failed, rolled back."; exit 2; }
import re, sys
path = sys.argv[1]
with open(path) as f: src = f.read()

ipv4 = """$CF_V4_SORTED""".strip().splitlines()
ipv6 = """$CF_V6_SORTED""".strip().splitlines()
ranges = ipv4 + ipv6

# Format: 8 per line, tab-indented inside the servers{} block, line-continuation backslashes
lines = []
chunk = []
for r in ranges:
    chunk.append(r)
    if len(chunk) == 8:
        lines.append("\t\t\t" + " ".join(chunk) + " \\\\")
        chunk = []
if chunk:
    lines.append("\t\t\t" + " ".join(chunk))
# Strip the trailing backslash from the last line if it ended up there
if lines and lines[-1].endswith(" \\\\"):
    lines[-1] = lines[-1][:-2].rstrip()
formatted = "\n".join(lines)

# Replace existing static block: `trusted_proxies static \\` ... up to `client_ip_headers`
pattern = r'(trusted_proxies static \\\\\n)(.*?)(\n\t\tclient_ip_headers)'
new_src, n = re.subn(pattern, lambda m: m.group(1) + formatted + m.group(3), src, count=1, flags=re.DOTALL)
if n == 0:
    sys.stderr.write("Could not find trusted_proxies static block to replace\n")
    sys.exit(1)
with open(path, "w") as f: f.write(new_src)
PYEOF

# Validate Caddy config
if ! caddy validate --config "$CADDYFILE" 2>&1 | tail -3 | grep -q "Valid configuration"; then
  log "ERROR: Caddyfile validation failed after edit. Rolling back."
  cp "$CADDYFILE_BAK" "$CADDYFILE"
  notify "🚨 cf-ip-sync: Caddyfile validation FAILED, rolled back to $CADDYFILE_BAK"
  exit 2
fi

# Reload Caddy
if ! systemctl reload caddy; then
  log "ERROR: Caddy reload failed. Rolling back."
  cp "$CADDYFILE_BAK" "$CADDYFILE"
  systemctl reload caddy || true
  notify "🚨 cf-ip-sync: Caddy reload FAILED, rolled back to $CADDYFILE_BAK"
  exit 2
fi
log "Caddyfile updated + reloaded."

# ── 4. Update iptables CADDY-CF-ONLY chain ──────────────────────────────────
# Backup current rules
iptables-save  > "$STATE_DIR/iptables.v4.before-$(date +%s)"
ip6tables-save > "$STATE_DIR/iptables.v6.before-$(date +%s)"

apply_iptables() {
  # IPv4
  iptables -N CADDY-CF-ONLY 2>/dev/null || true
  iptables -F CADDY-CF-ONLY
  # tailscale interface gets through (operator + GH Actions deploy paths)
  iptables -A CADDY-CF-ONLY -i tailscale0 -j ACCEPT
  # loopback gets through (Caddy → app)
  iptables -A CADDY-CF-ONLY -i lo -j ACCEPT
  # CF IPv4 ranges
  while IFS= read -r ip; do
    [[ -z "$ip" ]] && continue
    iptables -A CADDY-CF-ONLY -s "$ip" -j ACCEPT
  done <<< "$CF_V4_SORTED"
  iptables -A CADDY-CF-ONLY -j DROP

  # IPv6
  ip6tables -N CADDY-CF-ONLY 2>/dev/null || true
  ip6tables -F CADDY-CF-ONLY
  ip6tables -A CADDY-CF-ONLY -i tailscale0 -j ACCEPT
  ip6tables -A CADDY-CF-ONLY -i lo -j ACCEPT
  while IFS= read -r ip; do
    [[ -z "$ip" ]] && continue
    ip6tables -A CADDY-CF-ONLY -s "$ip" -j ACCEPT
  done <<< "$CF_V6_SORTED"
  ip6tables -A CADDY-CF-ONLY -j DROP

  # Hook into INPUT chain for NEW :80/:443 connections only.
  # ESTABLISHED connections are handled by the existing INPUT chain rules
  # (the second rule on this VPS is `ctstate RELATED,ESTABLISHED ACCEPT`).
  # We use -C/-I to be idempotent.
  if ! iptables -C INPUT -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -j CADDY-CF-ONLY 2>/dev/null; then
    iptables -I INPUT 1 -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -j CADDY-CF-ONLY
  fi
  if ! ip6tables -C INPUT -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -j CADDY-CF-ONLY 2>/dev/null; then
    ip6tables -I INPUT 1 -p tcp -m multiport --dports 80,443 -m conntrack --ctstate NEW -j CADDY-CF-ONLY
  fi
}

if ! apply_iptables; then
  log "ERROR: iptables apply failed. Restoring backups."
  iptables-restore  < "$STATE_DIR/iptables.v4.before-$(date +%s)" || true
  ip6tables-restore < "$STATE_DIR/iptables.v6.before-$(date +%s)" || true
  notify "🚨 cf-ip-sync: iptables apply FAILED, restored backups."
  exit 3
fi

# Persist (survive reboot)
mkdir -p /etc/iptables
iptables-save  > /etc/iptables/rules.v4
ip6tables-save > /etc/iptables/rules.v6

log "iptables CADDY-CF-ONLY chain updated and persisted."

# ── 5. Mark new hash ────────────────────────────────────────────────────────
echo "$NEW_HASH" > "$STATE_DIR/last-hash"
log "Done. New hash: $NEW_HASH"

notify "✅ cf-ip-sync: CF IP list updated. Caddy + iptables now reflect $(echo "$CF_V4_SORTED" | wc -l) IPv4 + $(echo "$CF_V6_SORTED" | wc -l) IPv6 ranges."

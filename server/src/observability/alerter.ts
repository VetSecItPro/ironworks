import { logger } from "../middleware/logger.js";

/**
 * Webhook alerter for off-box observability events.
 *
 * Today: heap-monitor + structured errors are pino-logged to stdout only.
 * Operators have to tail container logs to notice a heap-grow trigger or an
 * uncaught exception. This module ships a minimal "fire-and-forget HTTP POST
 * to a Slack/Discord/generic incoming-webhook URL" alerter so operators get
 * pinged on the channel of their choice.
 *
 * Design constraints (deliberate, see tests for enforcement):
 *  - Import-safe: importing this module fires NO network calls. All side
 *    effects happen inside `postAlert()`.
 *  - Never throws: alerts are best-effort observability, not part of the
 *    request path. A failed alert MUST NOT break the caller.
 *  - Rate-limited: at most 1 alert per (source, severity) pair per 5 minutes.
 *    Loop-storms (a runaway uncaught exception, a leak that snapshots every
 *    cycle) must not drown the channel.
 *  - No new deps: Node 24's built-in fetch + AbortSignal.timeout cover this.
 *
 * Env contract:
 *  - IRONWORKS_ALERT_WEBHOOK_URL: when unset, `postAlert()` is a no-op. When
 *    set, every alert posts to this URL.
 *  - IRONWORKS_ALERT_FORMAT: "raw" posts the AlertEvent JSON directly (for
 *    custom collectors). Default wraps the event in a Slack-compatible
 *    `{text}` payload, which Discord and most generic endpoints also accept.
 */

export interface AlertEvent {
  severity: "info" | "warn" | "error";
  source: string;
  message: string;
  details?: Record<string, unknown>;
}

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

// Module-level rate-limit state. Keyed by `${source}::${severity}` so two
// independent sources (heap-monitor vs uncaught) don't suppress each other.
// Acceptable as a singleton because the alerter has process-global semantics
// — there's exactly one operator channel per deployment. Reset hook below.
const lastAlertAt = new Map<string, number>();

function rateLimitKey(event: AlertEvent): string {
  return `${event.source}::${event.severity}`;
}

function buildSlackPayload(event: AlertEvent): { text: string } {
  // Slack's incoming-webhook accepts `{text}` as the universal field; Discord
  // and most generic webhooks accept the same shape. We render to a single
  // string instead of using Slack `blocks` to keep the payload portable.
  const detailStr = event.details ? ` ${JSON.stringify(event.details)}` : "";
  return {
    text: `[${event.severity.toUpperCase()}] ${event.source}: ${event.message}${detailStr}`,
  };
}

/**
 * Fire an off-box alert. Never throws; never awaits beyond the 5s timeout.
 *
 * Callers should NOT await this in a hot path — most call sites pattern this
 * as `postAlert(...).catch(() => undefined)` to make the fire-and-forget
 * intent explicit. The `.catch()` is technically redundant (we swallow
 * internally) but documents the contract at the call site.
 */
export async function postAlert(event: AlertEvent): Promise<void> {
  const url = process.env.IRONWORKS_ALERT_WEBHOOK_URL?.trim();
  if (!url) return;

  // Rate-limit BEFORE the network call so a loop-storm doesn't even queue
  // requests we'd just throw away.
  const key = rateLimitKey(event);
  const now = Date.now();
  const last = lastAlertAt.get(key);
  if (last !== undefined && now - last < RATE_LIMIT_WINDOW_MS) {
    return;
  }
  lastAlertAt.set(key, now);

  const format = process.env.IRONWORKS_ALERT_FORMAT?.trim().toLowerCase();
  const payload = format === "raw" ? event : buildSlackPayload(event);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      // AbortSignal.timeout fires the abort controller after 5s. fetch
      // surfaces it as a rejection, which we catch below.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn(
        { status: res.status, source: event.source, severity: event.severity },
        "alerter: webhook returned non-2xx",
      );
    }
  } catch (err) {
    // Network failure, abort, DNS, TLS — all collapse here. Log once at
    // warn (not error) so a flapping webhook doesn't trip downstream
    // error-budget alarms that watch logger.error.
    logger.warn({ err, source: event.source, severity: event.severity }, "alerter: webhook post failed");
  }
}

/**
 * Reset module-level rate-limiter state. Intended for unit tests; production
 * code has no reason to call this.
 */
export function __resetAlerterStateForTests(): void {
  lastAlertAt.clear();
}

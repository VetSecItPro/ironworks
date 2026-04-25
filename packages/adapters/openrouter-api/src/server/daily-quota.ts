/**
 * Per-agent daily-request kill switch for the openrouter_api adapter.
 *
 * Free-tier OpenRouter caps the entire account at ~1000 req/day (50/day for
 * accounts with <$10 lifetime credit). A buggy or runaway agent — stuck on a
 * tool-call loop, retrying the same issue every heartbeat, etc. — can burn
 * through the budget in under an hour and starve the rest of the fleet.
 *
 * This module enforces a per-agent soft cap as a fast in-process guard. When
 * an agent exceeds its cap on the current UTC day, the next call short-
 * circuits with a config-error result before any network I/O fires. The
 * counter resets at UTC midnight (cheap: a single date-string comparison;
 * no scheduled reset job needed).
 *
 * Default: 250 requests per agent per UTC day. Override via env var
 * OPENROUTER_API_DAILY_AGENT_CAP. Set to 0 to disable the limiter entirely
 * (e.g. when not on a free tier).
 */

const DEFAULT_DAILY_AGENT_CAP = 250;
const ENV_KEY_CAP = "OPENROUTER_API_DAILY_AGENT_CAP";

interface AgentCounter {
  /** UTC date string (YYYY-MM-DD) the counter is keyed to. */
  utcDate: string;
  count: number;
}

const counters = new Map<string, AgentCounter>();

function utcDateString(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function resolveCap(): number {
  const raw = process.env[ENV_KEY_CAP];
  if (raw === undefined) return DEFAULT_DAILY_AGENT_CAP;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_DAILY_AGENT_CAP;
  return parsed; // 0 means disabled
}

export interface DailyQuotaCheckResult {
  allowed: boolean;
  /** Current call count for this agent on the current UTC day (post-increment if allowed). */
  countToday: number;
  /** Effective cap for this agent. 0 = disabled. */
  cap: number;
  /** UTC day the counter is anchored to. */
  utcDate: string;
}

/**
 * Check the per-agent daily quota and increment if allowed. Returns
 * `allowed: false` when the agent has hit its cap; the caller should refuse
 * the request without making any network calls. Returns `allowed: true` and
 * an incremented count when the call should proceed.
 *
 * Pass `null` for agentId to bypass the limiter (e.g. for adhoc test calls
 * from the playground that don't belong to an agent).
 */
export function checkAndIncrement(agentId: string | null): DailyQuotaCheckResult {
  const cap = resolveCap();
  const now = utcDateString();
  if (!agentId || cap === 0) {
    return { allowed: true, countToday: 0, cap, utcDate: now };
  }

  const existing = counters.get(agentId);
  if (!existing || existing.utcDate !== now) {
    // Either first request today or a UTC day rollover — reset.
    counters.set(agentId, { utcDate: now, count: 1 });
    return { allowed: true, countToday: 1, cap, utcDate: now };
  }

  if (existing.count >= cap) {
    return { allowed: false, countToday: existing.count, cap, utcDate: now };
  }

  existing.count += 1;
  return { allowed: true, countToday: existing.count, cap, utcDate: now };
}

/**
 * Reset the counter for a specific agent (test-only or admin-override path).
 * Returning the daily counter to zero on demand lets operators unblock an
 * agent without restarting the server.
 */
export function resetCounter(agentId: string): void {
  counters.delete(agentId);
}

/** Test-only: clear all counters. */
export function _resetAllForTesting(): void {
  counters.clear();
}

/** Read-only snapshot — useful for an admin / status route. */
export function snapshot(): Array<{ agentId: string; count: number; utcDate: string }> {
  return [...counters.entries()].map(([agentId, c]) => ({ agentId, count: c.count, utcDate: c.utcDate }));
}

import type { Db } from "@ironworksai/db";
import { agents, channelResponseState } from "@ironworksai/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../middleware/logger.js";

interface RouteResult {
  agentId: string;
  agentName: string;
  sequencePosition: number;
}

// Type alias for the channel_response_state row shape we read. Drizzle infers
// this from the schema; this alias keeps the helper signatures readable.
type ChannelResponseStateRow = typeof channelResponseState.$inferSelect;

// Role keywords for relevance scoring
const ROLE_KEYWORDS: Record<string, string[]> = {
  ceo: ["strategy", "vision", "company", "decision", "priority", "direction", "goal"],
  cto: ["architecture", "technology", "engineering", "code", "deploy", "infrastructure", "technical"],
  cfo: ["budget", "cost", "spend", "finance", "revenue", "profit", "pricing", "money"],
  cmo: ["marketing", "content", "brand", "campaign", "social", "audience", "growth"],
  coo: ["operations", "process", "efficiency", "workflow", "sla", "quality", "performance"],
  vp: ["hiring", "onboarding", "performance", "team", "hr", "capacity", "role"],
  engineer: ["code", "bug", "feature", "deploy", "test", "build", "api", "database"],
  director: ["compliance", "legal", "policy", "audit", "risk", "regulation"],
};

// Layer 3 safeguards (agent-chat-plan.md). Operators can patch and redeploy if
// these need tuning; per the design spec we deliberately did not build a UI.
const PER_AGENT_COOLDOWN_MS = 5 * 60 * 1000;
const HOURLY_CIRCUIT_BREAKER_LIMIT = 20;
const HOURLY_WINDOW_MS = 60 * 60 * 1000;

/**
 * Returns true (allow) when the hourly circuit breaker is NOT tripped:
 *   - no state row yet (channel has never seen activity), OR
 *   - the rolling 60-min window has expired (will reset on next write), OR
 *   - the count is still below the 20-response ceiling.
 */
export function checkHourlyCircuitBreaker(state: ChannelResponseStateRow | null | undefined): boolean {
  if (!state) return true;
  const windowAge = Date.now() - new Date(state.hourlyWindowStart).getTime();
  // Window-expired path is observe-only here; the actual reset of
  // hourlyWindowStart + hourlyAgentResponseCount persists in
  // recordAgentResponse on the next write.
  if (windowAge > HOURLY_WINDOW_MS) return true;
  return state.hourlyAgentResponseCount < HOURLY_CIRCUIT_BREAKER_LIMIT;
}

/**
 * Filters out candidates whose `agent_last_responded_at[agentId]` is within
 * the per-agent cooldown window (5 min). Applied to BOTH the @mention path
 * and the scoring path — explicit mentions don't override cooldown.
 */
export function filterCooledDownAgents<T extends { id: string; name: string }>(
  candidates: T[],
  state: ChannelResponseStateRow | null | undefined,
  now: Date = new Date(),
): T[] {
  if (!state) return candidates;
  const map = state.agentLastRespondedAt ?? {};
  const nowMs = now.getTime();
  return candidates.filter((c) => {
    const lastIso = map[c.id];
    if (!lastIso) return true;
    const lastMs = new Date(lastIso).getTime();
    if (Number.isNaN(lastMs)) return true;
    const eligible = nowMs - lastMs >= PER_AGENT_COOLDOWN_MS;
    if (!eligible) {
      logger.debug(
        { agentId: c.id, agentName: c.name, ageMs: nowMs - lastMs },
        "channel router cooldown_filter_excluded",
      );
    }
    return eligible;
  });
}

export async function selectRespondingAgents(
  db: Db,
  channelId: string,
  channelName: string,
  companyId: string,
  messageBody: string,
  authorAgentId: string | null,
): Promise<RouteResult[]> {
  // Rule 1: Agent messages NEVER trigger responses
  if (authorAgentId) return [];

  // Rule 2: Check rate limit - max 3 agent responses per 10-min window
  const canRespond = await checkChannelRateLimit(db, channelId, companyId);
  if (!canRespond) return [];

  // Rule 2b: Hard hourly circuit breaker. Read state once and reuse for the
  // per-agent cooldown filter below to avoid a duplicate round-trip.
  const [state] = await db.select().from(channelResponseState).where(eq(channelResponseState.channelId, channelId));

  if (!checkHourlyCircuitBreaker(state)) {
    logger.debug(
      { channelId, channelName, count: state?.hourlyAgentResponseCount, circuit_breaker: "hit" },
      "channel router circuit_breaker_hit",
    );
    return [];
  }

  // Rule 3: Extract @mentions
  const mentionPattern = /@(\w[\w\s]*?)(?=\s|,|$)/g;
  const mentions: string[] = [];
  let match = mentionPattern.exec(messageBody);
  while (match !== null) {
    mentions.push(match[1].trim().toLowerCase());
    match = mentionPattern.exec(messageBody);
  }

  // Get all idle agents for this company
  const idleAgents = await db
    .select({ id: agents.id, name: agents.name, role: agents.role, department: agents.department })
    .from(agents)
    .where(and(eq(agents.companyId, companyId), eq(agents.status, "idle")));

  if (idleAgents.length === 0) return [];

  // Rule 4: If explicit @mentions, only wake those agents
  if (mentions.length > 0) {
    const mentioned = idleAgents.filter((a) => mentions.some((m) => a.name.toLowerCase().includes(m)));
    // Per-agent cooldown applies even to explicit @mentions (design spec).
    const cooled = filterCooledDownAgents(mentioned, state);
    if (cooled.length === 0) return [];
    return cooled.slice(0, 2).map((a, i) => ({
      agentId: a.id,
      agentName: a.name,
      sequencePosition: i + 1,
    }));
  }

  // Rule 5: Score agents by relevance
  const lowerBody = messageBody.toLowerCase();
  const scored = idleAgents.map((agent) => {
    let score = 0;
    const agentRole = (agent.role ?? "").toLowerCase();
    const agentDept = (agent.department ?? "").toLowerCase();
    const agentName = (agent.name ?? "").toLowerCase();

    // Name/mention match (+5) — the message is directly addressing this agent
    if (agentName && lowerBody.includes(agentName)) score += 5;

    // Channel department match (+3): also treat "executive" as an alias for "leadership"
    const normalizedDept = agentDept === "executive" ? "leadership" : agentDept;
    if (normalizedDept === channelName.toLowerCase()) score += 3;

    // Role keyword match (+2)
    for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
      if (agentRole.includes(role) && keywords.some((kw) => lowerBody.includes(kw))) {
        score += 2;
        break;
      }
    }

    // Department head bonus for leadership channel (+2)
    if (channelName === "leadership" && /ceo|cto|cfo|cmo|coo|vp|director/i.test(agentRole)) {
      score += 2;
    }

    return { ...agent, score };
  });

  // Leadership/company channels use a lower threshold (>= 2) so senior agents
  // aren't silenced by simple conversational messages.
  const threshold = channelName === "leadership" || channelName === "company" ? 2 : 3;
  const eligible = scored
    .filter((a) => a.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, channelName === "leadership" || channelName === "company" ? 2 : 1);

  // Apply per-agent cooldown filter AFTER scoring/slicing — if all top picks
  // are cooling down, return [] rather than reaching for noisier alternates.
  const cooled = filterCooledDownAgents(eligible, state);
  if (cooled.length === 0) return [];

  logger.debug({ channelName, agents: cooled.map((a) => a.name) }, "channel router scored agents for message");

  return cooled.map((a, i) => ({
    agentId: a.id,
    agentName: a.name,
    sequencePosition: i + 1,
  }));
}

async function checkChannelRateLimit(db: Db, channelId: string, _companyId: string): Promise<boolean> {
  const TEN_MINUTES_MS = 10 * 60 * 1000;
  const MAX_RESPONSES = 3;

  const [state] = await db.select().from(channelResponseState).where(eq(channelResponseState.channelId, channelId));

  if (!state) return true; // No state yet = no responses yet

  const windowAge = Date.now() - new Date(state.windowStart).getTime();
  if (windowAge > TEN_MINUTES_MS) return true; // Window expired

  return state.agentResponseCount < MAX_RESPONSES;
}

/**
 * Prune entries older than the hourly window from a per-agent timestamp map.
 * Called on every write so the jsonb payload stays bounded (~ N agents × 1
 * entry × ~40 bytes < 1 KB even for large companies).
 */
function prunePerAgentMap(map: Record<string, string>, nowMs: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [agentId, iso] of Object.entries(map)) {
    const tMs = new Date(iso).getTime();
    if (Number.isNaN(tMs)) continue;
    if (nowMs - tMs < HOURLY_WINDOW_MS) {
      out[agentId] = iso;
    }
  }
  return out;
}

export async function recordAgentResponse(
  db: Db,
  channelId: string,
  companyId: string,
  agentId: string,
): Promise<void> {
  const TEN_MINUTES_MS = 10 * 60 * 1000;
  const now = new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  const [existing] = await db.select().from(channelResponseState).where(eq(channelResponseState.channelId, channelId));

  if (!existing) {
    await db.insert(channelResponseState).values({
      channelId,
      companyId,
      agentResponseCount: 1,
      windowStart: now,
      lastAgentMessageAt: now,
      hourlyAgentResponseCount: 1,
      hourlyWindowStart: now,
      agentLastRespondedAt: { [agentId]: nowIso },
    });
    return;
  }

  // 10-min soft cap window
  const windowAge = nowMs - new Date(existing.windowStart).getTime();
  const tenMinReset = windowAge > TEN_MINUTES_MS;

  // 60-min hard ceiling window — reset INDEPENDENTLY of the 10-min window so
  // human messages (which reset the soft cap) don't smuggle the hard cap with them.
  const hourlyAge = nowMs - new Date(existing.hourlyWindowStart).getTime();
  const hourlyReset = hourlyAge > HOURLY_WINDOW_MS;

  // Always prune stale per-agent entries on write, then stamp the responder.
  const prunedMap = prunePerAgentMap(existing.agentLastRespondedAt ?? {}, nowMs);
  prunedMap[agentId] = nowIso;

  await db
    .update(channelResponseState)
    .set({
      agentResponseCount: tenMinReset ? 1 : existing.agentResponseCount + 1,
      windowStart: tenMinReset ? now : existing.windowStart,
      lastAgentMessageAt: now,
      hourlyAgentResponseCount: hourlyReset ? 1 : existing.hourlyAgentResponseCount + 1,
      hourlyWindowStart: hourlyReset ? now : existing.hourlyWindowStart,
      agentLastRespondedAt: prunedMap,
    })
    .where(eq(channelResponseState.channelId, channelId));
}

export async function recordHumanMessage(db: Db, channelId: string, companyId: string): Promise<void> {
  const [existing] = await db.select().from(channelResponseState).where(eq(channelResponseState.channelId, channelId));

  if (!existing) {
    await db.insert(channelResponseState).values({
      channelId,
      companyId,
      agentResponseCount: 0,
      windowStart: new Date(),
      lastHumanMessageAt: new Date(),
    });
  } else {
    // Human message resets the 10-min soft cap window ONLY. The hourly hard
    // ceiling and per-agent cooldown map are independent of human activity
    // by design — a noisy human channel must not be able to dilute the hard
    // safeguards.
    await db
      .update(channelResponseState)
      .set({
        agentResponseCount: 0,
        windowStart: new Date(),
        lastHumanMessageAt: new Date(),
      })
      .where(eq(channelResponseState.channelId, channelId));
  }
}

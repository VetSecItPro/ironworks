import type { Db } from "@ironworksai/db";
import { agents, channelResponseState } from "@ironworksai/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../middleware/logger.js";

interface RouteResult {
  agentId: string;
  agentName: string;
  sequencePosition: number;
}

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

  // Rule 3: Extract @mentions
  const mentionPattern = /@(\w[\w\s]*?)(?=\s|,|$)/g;
  const mentions: string[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = mentionPattern.exec(messageBody)) !== null) {
    mentions.push(match[1].trim().toLowerCase());
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
    return mentioned.slice(0, 2).map((a, i) => ({
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

  if (eligible.length > 0) {
    logger.debug({ channelName, agents: eligible.map((a) => a.name) }, "channel router scored agents for message");
  }

  return eligible.map((a, i) => ({
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

export async function recordAgentResponse(db: Db, channelId: string, companyId: string): Promise<void> {
  const TEN_MINUTES_MS = 10 * 60 * 1000;

  const [existing] = await db.select().from(channelResponseState).where(eq(channelResponseState.channelId, channelId));

  if (!existing) {
    await db.insert(channelResponseState).values({
      channelId,
      companyId,
      agentResponseCount: 1,
      windowStart: new Date(),
      lastAgentMessageAt: new Date(),
    });
    return;
  }

  const windowAge = Date.now() - new Date(existing.windowStart).getTime();
  if (windowAge > TEN_MINUTES_MS) {
    // Reset window
    await db
      .update(channelResponseState)
      .set({ agentResponseCount: 1, windowStart: new Date(), lastAgentMessageAt: new Date() })
      .where(eq(channelResponseState.channelId, channelId));
  } else {
    // Increment counter
    await db
      .update(channelResponseState)
      .set({
        agentResponseCount: existing.agentResponseCount + 1,
        lastAgentMessageAt: new Date(),
      })
      .where(eq(channelResponseState.channelId, channelId));
  }
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
    // Human message resets the response window
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

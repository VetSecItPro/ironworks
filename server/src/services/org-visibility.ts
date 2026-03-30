import { eq } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { agents, issues } from "@ironworksai/db";

interface OrgAgent {
  id: string;
  name: string;
  role: string;
  reportsTo: string | null;
}

/**
 * Resolve the full management chain for an agent.
 * Returns all agent IDs that are "above" this agent in the org chart.
 * CEO (reportsTo = null) manages everyone transitively.
 */
export async function getManagementChain(db: Db, agentId: string): Promise<string[]> {
  const allAgents = await db
    .select({ id: agents.id, reportsTo: agents.reportsTo })
    .from(agents);

  const chain: string[] = [];
  let current = agentId;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current)) break; // Prevent cycles
    visited.add(current);
    const agent = allAgents.find((a) => a.id === current);
    if (!agent?.reportsTo) break;
    chain.push(agent.reportsTo);
    current = agent.reportsTo;
  }

  return chain;
}

/**
 * Get all direct reports for an agent (agents whose reportsTo = this agent).
 */
export async function getDirectReports(db: Db, agentId: string): Promise<string[]> {
  const reports = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.reportsTo, agentId));
  return reports.map((r) => r.id);
}

/**
 * Get all transitive reports (full subtree) for an agent.
 */
export async function getAllReports(db: Db, agentId: string): Promise<string[]> {
  const allAgents = await db
    .select({ id: agents.id, reportsTo: agents.reportsTo })
    .from(agents);

  const result: string[] = [];
  const queue = [agentId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const directReports = allAgents.filter((a) => a.reportsTo === current);
    for (const report of directReports) {
      result.push(report.id);
      queue.push(report.id);
    }
  }

  return result;
}

/**
 * Check if an agent is the CEO (no reportsTo, or role === "ceo").
 */
export async function isCeo(db: Db, agentId: string): Promise<boolean> {
  const [agent] = await db
    .select({ role: agents.role, reportsTo: agents.reportsTo })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) return false;
  return agent.role === "ceo" || agent.reportsTo === null;
}

/**
 * Determine what library files an actor can see based on org hierarchy.
 *
 * Rules:
 * - Board users (humans): see everything
 * - CEO (reportsTo = null): see everything
 * - Managers: see company files + project files they're on + their own private + direct reports' private
 * - ICs: see company files + project files they're on + their own private only
 */
export async function resolveVisibleOwnerAgentIds(
  db: Db,
  actorType: "board" | "agent",
  actorAgentId: string | null,
  companyId: string,
): Promise<{
  seeAll: boolean;
  visibleOwnerAgentIds: string[];
}> {
  // Board users see everything
  if (actorType === "board") {
    return { seeAll: true, visibleOwnerAgentIds: [] };
  }

  if (!actorAgentId) {
    return { seeAll: false, visibleOwnerAgentIds: [] };
  }

  // Check if CEO
  const ceo = await isCeo(db, actorAgentId);
  if (ceo) {
    return { seeAll: true, visibleOwnerAgentIds: [] };
  }

  // Get this agent's direct reports (for managers)
  const reports = await getAllReports(db, actorAgentId);

  // Agent can see: their own files + their reports' files
  return {
    seeAll: false,
    visibleOwnerAgentIds: [actorAgentId, ...reports],
  };
}

/**
 * Get project IDs an agent is associated with (assigned issues in that project).
 */
export async function getAgentProjectIds(db: Db, agentId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ projectId: issues.projectId })
    .from(issues)
    .where(eq(issues.assigneeAgentId, agentId));

  return rows
    .map((r) => r.projectId)
    .filter((id): id is string => id !== null);
}

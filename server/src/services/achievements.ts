import { and, eq, gte, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import {
  agentMemoryEntries,
  agents,
  costEvents,
  issues,
  projects,
} from "@ironworksai/db";
import { logger } from "../middleware/logger.js";

// ── Achievement Badge System ───────────────────────────────────────────────
//
// Defines achievement criteria and checks whether agents have earned them.
// Achievements are stored as agent_memory_entries with category "achievement".

export interface Achievement {
  key: string;
  name: string;
  description: string;
  icon: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { key: "first_10", name: "First 10", description: "Completed 10 issues", icon: "trophy" },
  { key: "perfect_week", name: "Perfect Week", description: "Completed all assigned issues in a week with zero cancellations", icon: "star" },
  { key: "under_budget", name: "Budget Champion", description: "Stayed under budget for a full month", icon: "dollar-sign" },
  { key: "speed_demon", name: "Speed Demon", description: "Completed 5 issues in a single day", icon: "zap" },
  { key: "knowledge_builder", name: "Knowledge Builder", description: "Created 20+ memory entries", icon: "brain" },
  { key: "team_player", name: "Team Player", description: "Contributed to 5 different projects", icon: "users" },
];

/**
 * Check all achievement criteria for an agent and grant any newly earned ones.
 *
 * Returns the keys of newly granted achievements.
 */
export async function checkAndGrantAchievements(
  db: Db,
  agentId: string,
  companyId: string,
): Promise<string[]> {
  // Fetch already-earned achievement keys
  const existing = await db
    .select({ content: agentMemoryEntries.content })
    .from(agentMemoryEntries)
    .where(
      and(
        eq(agentMemoryEntries.agentId, agentId),
        eq(agentMemoryEntries.companyId, companyId),
        eq(agentMemoryEntries.memoryType, "semantic"),
        eq(agentMemoryEntries.category, "achievement"),
        isNull(agentMemoryEntries.archivedAt),
      ),
    );

  const earnedKeys = new Set<string>();
  for (const row of existing) {
    // Content format: "Achievement: {key} - {name}"
    const match = row.content.match(/^Achievement: (\S+)/);
    if (match) earnedKeys.add(match[1]);
  }

  const newlyGranted: string[] = [];
  const now = new Date();

  for (const achievement of ACHIEVEMENTS) {
    if (earnedKeys.has(achievement.key)) continue;

    const earned = await checkAchievementCriteria(db, agentId, companyId, achievement.key);
    if (!earned) continue;

    await db.insert(agentMemoryEntries).values({
      agentId,
      companyId,
      memoryType: "semantic",
      category: "achievement",
      content: `Achievement: ${achievement.key} - ${achievement.name}. ${achievement.description}`,
      confidence: 100,
      lastAccessedAt: now,
    });

    newlyGranted.push(achievement.key);
  }

  if (newlyGranted.length > 0) {
    logger.info(
      { agentId, companyId, newAchievements: newlyGranted },
      "granted new achievements to agent",
    );
  }

  return newlyGranted;
}

async function checkAchievementCriteria(
  db: Db,
  agentId: string,
  companyId: string,
  key: string,
): Promise<boolean> {
  switch (key) {
    case "first_10":
      return checkFirst10(db, agentId, companyId);
    case "perfect_week":
      return checkPerfectWeek(db, agentId, companyId);
    case "under_budget":
      return checkUnderBudget(db, agentId);
    case "speed_demon":
      return checkSpeedDemon(db, agentId, companyId);
    case "knowledge_builder":
      return checkKnowledgeBuilder(db, agentId, companyId);
    case "team_player":
      return checkTeamPlayer(db, agentId, companyId);
    default:
      return false;
  }
}

/** Completed 10 issues total */
async function checkFirst10(db: Db, agentId: string, companyId: string): Promise<boolean> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(issues)
    .where(
      and(
        eq(issues.companyId, companyId),
        eq(issues.assigneeAgentId, agentId),
        eq(issues.status, "done"),
      ),
    );
  return Number(result[0]?.count ?? 0) >= 10;
}

/** Completed all assigned issues in the past 7 days with zero cancellations */
async function checkPerfectWeek(db: Db, agentId: string, companyId: string): Promise<boolean> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const stats = await db
    .select({
      done: sql<number>`count(case when ${issues.status} = 'done' then 1 end)::int`,
      cancelled: sql<number>`count(case when ${issues.status} = 'cancelled' then 1 end)::int`,
      inProgress: sql<number>`count(case when ${issues.status} not in ('done', 'cancelled', 'backlog') then 1 end)::int`,
    })
    .from(issues)
    .where(
      and(
        eq(issues.companyId, companyId),
        eq(issues.assigneeAgentId, agentId),
        gte(issues.createdAt, sevenDaysAgo),
      ),
    );

  const row = stats[0];
  const done = Number(row?.done ?? 0);
  const cancelled = Number(row?.cancelled ?? 0);
  const inProgress = Number(row?.inProgress ?? 0);

  // Must have completed at least 1, zero cancellations, zero still open
  return done >= 1 && cancelled === 0 && inProgress === 0;
}

/** Stayed under budget for a full month */
async function checkUnderBudget(db: Db, agentId: string): Promise<boolean> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const agentRow = await db
    .select({
      budgetMonthlyCents: agents.budgetMonthlyCents,
    })
    .from(agents)
    .where(eq(agents.id, agentId))
    .then((rows) => rows[0] ?? null);

  if (!agentRow || agentRow.budgetMonthlyCents <= 0) return false;

  const costResult = await db
    .select({ totalCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int` })
    .from(costEvents)
    .where(
      and(
        eq(costEvents.agentId, agentId),
        gte(costEvents.occurredAt, thirtyDaysAgo),
      ),
    );

  const totalSpent = Number(costResult[0]?.totalCents ?? 0);
  return totalSpent <= agentRow.budgetMonthlyCents;
}

/** Completed 5 issues in a single day (check recent 30 days) */
async function checkSpeedDemon(db: Db, agentId: string, companyId: string): Promise<boolean> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const dailyCounts = await db
    .select({
      dayCount: sql<number>`count(*)::int`,
    })
    .from(issues)
    .where(
      and(
        eq(issues.companyId, companyId),
        eq(issues.assigneeAgentId, agentId),
        eq(issues.status, "done"),
        gte(issues.completedAt, thirtyDaysAgo),
      ),
    )
    .groupBy(sql`date(${issues.completedAt} at time zone 'America/Chicago')`);

  return dailyCounts.some((row) => Number(row.dayCount) >= 5);
}

/** Created 20+ memory entries */
async function checkKnowledgeBuilder(db: Db, agentId: string, companyId: string): Promise<boolean> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentMemoryEntries)
    .where(
      and(
        eq(agentMemoryEntries.agentId, agentId),
        eq(agentMemoryEntries.companyId, companyId),
        // Exclude achievement entries themselves
        sql`${agentMemoryEntries.category} != 'achievement'`,
      ),
    );
  return Number(result[0]?.count ?? 0) >= 20;
}

/** Contributed to 5 different projects */
async function checkTeamPlayer(db: Db, agentId: string, companyId: string): Promise<boolean> {
  const result = await db
    .select({ projectCount: sql<number>`count(distinct ${issues.projectId})::int` })
    .from(issues)
    .where(
      and(
        eq(issues.companyId, companyId),
        eq(issues.assigneeAgentId, agentId),
        eq(issues.status, "done"),
        sql`${issues.projectId} is not null`,
      ),
    );
  return Number(result[0]?.projectCount ?? 0) >= 5;
}

/**
 * Run achievement checks for all non-terminated agents in a company.
 */
export async function checkAllAgentAchievements(
  db: Db,
  companyId: string,
): Promise<void> {
  const companyAgents = await db
    .select({ id: agents.id })
    .from(agents)
    .where(
      and(
        eq(agents.companyId, companyId),
        ne(agents.status, "terminated"),
      ),
    );

  for (const agent of companyAgents) {
    try {
      await checkAndGrantAchievements(db, agent.id, companyId);
    } catch (err) {
      logger.error({ err, agentId: agent.id, companyId }, "failed to check achievements for agent");
    }
  }
}

/**
 * Run achievement checks for ALL companies.
 */
export async function runAllAchievementChecks(db: Db): Promise<void> {
  const { companies } = await import("@ironworksai/db");
  const allCompanies = await db
    .select({ id: companies.id })
    .from(companies)
    .where(ne(companies.status, "pending_erasure"));

  for (const company of allCompanies) {
    try {
      await checkAllAgentAchievements(db, company.id);
    } catch (err) {
      logger.error({ err, companyId: company.id }, "failed to run achievement checks for company");
    }
  }

  logger.info({ companiesProcessed: allCompanies.length }, "achievement checks run complete");
}

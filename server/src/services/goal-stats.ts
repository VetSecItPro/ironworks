import { eq, inArray, sql, and } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { issues, agents, projects } from "@ironworksai/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoalAgentInfo {
  id: string;
  name: string | null;
}

export interface GoalProjectInfo {
  id: string;
  name: string | null;
}

export interface GoalProgress {
  goalId: string;
  totalIssues: number;
  completedIssues: number;
  inProgressIssues: number;
  blockedIssues: number;
  todoIssues: number;
  cancelledIssues: number;
  progressPercent: number;
  agents: GoalAgentInfo[];
  projects: GoalProjectInfo[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildProgressFromRows(
  goalId: string,
  statusRows: { status: string | null; count: number }[],
  agentRows: GoalAgentInfo[],
  projectRows: GoalProjectInfo[],
): GoalProgress {
  let totalIssues = 0;
  let completedIssues = 0;
  let inProgressIssues = 0;
  let blockedIssues = 0;
  let todoIssues = 0;
  let cancelledIssues = 0;

  for (const row of statusRows) {
    const count = Number(row.count);
    totalIssues += count;
    switch (row.status) {
      case "done":
        completedIssues += count;
        break;
      case "in_progress":
        inProgressIssues += count;
        break;
      case "blocked":
        blockedIssues += count;
        break;
      case "todo":
      case "backlog":
        todoIssues += count;
        break;
      case "cancelled":
        cancelledIssues += count;
        break;
    }
  }

  const progressPercent = totalIssues > 0 ? Math.round((completedIssues / totalIssues) * 10000) / 100 : 0;

  return {
    goalId,
    totalIssues,
    completedIssues,
    inProgressIssues,
    blockedIssues,
    todoIssues,
    cancelledIssues,
    progressPercent,
    agents: agentRows,
    projects: projectRows,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function goalStatsService(db: Db) {
  return {
    /**
     * Return progress statistics for a single goal.
     */
    async getGoalProgress(goalId: string): Promise<GoalProgress> {
      const [statusRows, agentRows, projectRows] = await Promise.all([
        // Status counts
        db
          .select({
            status: issues.status,
            count: sql<number>`count(*)`,
          })
          .from(issues)
          .where(eq(issues.goalId, goalId))
          .groupBy(issues.status),

        // Distinct agents assigned to issues under this goal
        db
          .select({
            id: agents.id,
            name: agents.name,
          })
          .from(agents)
          .where(
            sql`${agents.id} in (
              select distinct ${issues.assigneeAgentId}
              from ${issues}
              where ${issues.goalId} = ${goalId}
                and ${issues.assigneeAgentId} is not null
            )`,
          ),

        // Distinct projects linked to issues under this goal
        db
          .select({
            id: projects.id,
            name: projects.name,
          })
          .from(projects)
          .where(
            sql`${projects.id} in (
              select distinct ${issues.projectId}
              from ${issues}
              where ${issues.goalId} = ${goalId}
                and ${issues.projectId} is not null
            )`,
          ),
      ]);

      return buildProgressFromRows(goalId, statusRows, agentRows, projectRows);
    },

    /**
     * Return progress statistics for multiple goals in a single batch.
     */
    async getGoalProgressBatch(goalIds: string[]): Promise<Map<string, GoalProgress>> {
      const result = new Map<string, GoalProgress>();

      if (goalIds.length === 0) return result;

      const [statusRows, agentRows, projectRows] = await Promise.all([
        // Status counts grouped by goalId
        db
          .select({
            goalId: issues.goalId,
            status: issues.status,
            count: sql<number>`count(*)`,
          })
          .from(issues)
          .where(inArray(issues.goalId, goalIds))
          .groupBy(issues.goalId, issues.status),

        // Distinct (goalId, agent) pairs
        db
          .select({
            goalId: issues.goalId,
            agentId: agents.id,
            agentName: agents.name,
          })
          .from(issues)
          .innerJoin(agents, eq(issues.assigneeAgentId, agents.id))
          .where(
            and(
              inArray(issues.goalId, goalIds),
              sql`${issues.assigneeAgentId} is not null`,
            ),
          )
          .groupBy(issues.goalId, agents.id, agents.name),

        // Distinct (goalId, project) pairs
        db
          .select({
            goalId: issues.goalId,
            projectId: projects.id,
            projectName: projects.name,
          })
          .from(issues)
          .innerJoin(projects, eq(issues.projectId, projects.id))
          .where(
            and(
              inArray(issues.goalId, goalIds),
              sql`${issues.projectId} is not null`,
            ),
          )
          .groupBy(issues.goalId, projects.id, projects.name),
      ]);

      // Index agents and projects by goalId
      const agentsByGoal = new Map<string, GoalAgentInfo[]>();
      for (const row of agentRows) {
        const gid = row.goalId!;
        if (!agentsByGoal.has(gid)) agentsByGoal.set(gid, []);
        agentsByGoal.get(gid)!.push({ id: row.agentId, name: row.agentName });
      }

      const projectsByGoal = new Map<string, GoalProjectInfo[]>();
      for (const row of projectRows) {
        const gid = row.goalId!;
        if (!projectsByGoal.has(gid)) projectsByGoal.set(gid, []);
        projectsByGoal.get(gid)!.push({ id: row.projectId, name: row.projectName });
      }

      // Index status counts by goalId
      const statusByGoal = new Map<string, { status: string | null; count: number }[]>();
      for (const row of statusRows) {
        const gid = row.goalId!;
        if (!statusByGoal.has(gid)) statusByGoal.set(gid, []);
        statusByGoal.get(gid)!.push({ status: row.status, count: row.count });
      }

      // Build progress for each requested goalId (including those with zero issues)
      for (const goalId of goalIds) {
        result.set(
          goalId,
          buildProgressFromRows(
            goalId,
            statusByGoal.get(goalId) ?? [],
            agentsByGoal.get(goalId) ?? [],
            projectsByGoal.get(goalId) ?? [],
          ),
        );
      }

      return result;
    },
  };
}

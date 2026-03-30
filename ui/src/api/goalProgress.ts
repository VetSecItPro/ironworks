import { api } from "./client";

export interface GoalProgressItem {
  goalId: string;
  title: string;
  status: string;
  level: string;
  totalIssues: number;
  completedIssues: number;
  inProgressIssues: number;
  blockedIssues: number;
  todoIssues: number;
  cancelledIssues: number;
  progressPercent: number;
}

export interface GoalProgressDetail extends GoalProgressItem {
  agents: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
}

export interface GoalBreakdownIssue {
  title: string;
  description: string;
  priority: string;
  assigneeRole: string;
  order: number;
}

export const goalProgressApi = {
  /** Get progress for a single goal. */
  detail: (goalId: string) =>
    api.get<GoalProgressDetail>(`/goals/${encodeURIComponent(goalId)}/progress`),

  /** Get progress for all goals in a company. */
  batch: (companyId: string) =>
    api.get<GoalProgressItem[]>(
      `/companies/${encodeURIComponent(companyId)}/goals/progress`,
    ),

  /** AI-assisted goal breakdown into issues. */
  generateBreakdown: (companyId: string, input: {
    goalTitle: string;
    goalDescription?: string;
    projectId?: string;
  }) =>
    api.post<{ issues: GoalBreakdownIssue[] }>(
      `/companies/${encodeURIComponent(companyId)}/ai/generate-goal-breakdown`,
      input,
    ),
};

import type { Issue } from "@ironworksai/shared";

export const BOARD_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
] as const;

export type BoardStatus = (typeof BOARD_STATUSES)[number];

export type SwimlaneMode = "none" | "agent" | "project" | "priority";

export interface Swimlane {
  key: string;
  label: string;
  issues: Issue[];
}

export interface Agent {
  id: string;
  name: string;
}

/** Optional goal info to show in board header when project has a linked goal */
export interface KanbanGoalInfo {
  title: string;
  healthStatus: string | null;
  progressPercent: number;
}

export interface KanbanBoardProps {
  issues: Issue[];
  agents?: Agent[];
  liveIssueIds?: Set<string>;
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void;
  goalInfo?: KanbanGoalInfo | null;
}

export const STATUS_COLUMN_TINTS: Record<string, string> = {
  backlog: "bg-muted/20 dark:bg-muted/10",
  todo: "bg-blue-500/5 dark:bg-blue-500/5",
  in_progress: "bg-yellow-500/5 dark:bg-yellow-500/5",
  in_review: "bg-violet-500/5 dark:bg-violet-500/5",
  done: "bg-green-500/5 dark:bg-green-500/5",
};

export const DEFAULT_WIP_LIMITS: Record<string, number> = {
  in_progress: 5,
  in_review: 3,
};

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getWipLimits(): Record<string, number> {
  try {
    const raw = localStorage.getItem("kanban:wipLimits");
    if (raw) return { ...DEFAULT_WIP_LIMITS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_WIP_LIMITS };
}

export const HEALTH_BADGE_COLORS: Record<string, string> = {
  on_track: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  at_risk: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  off_track: "bg-red-500/10 text-red-600 dark:text-red-400",
  achieved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

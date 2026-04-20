import type { Issue } from "@ironworksai/shared";
import type { KanbanGoalInfo } from "../kanban";

export const statusOrder = ["in_progress", "todo", "backlog", "in_review", "blocked", "done", "cancelled"];
export const priorityOrder = ["critical", "high", "medium", "low"];

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export type SortSpec = {
  field: "status" | "priority" | "title" | "created" | "updated";
  dir: "asc" | "desc";
};

export type IssueViewState = {
  statuses: string[];
  priorities: string[];
  assignees: string[];
  labels: string[];
  projects: string[];
  sortField: "status" | "priority" | "title" | "created" | "updated";
  sortDir: "asc" | "desc";
  secondarySorts?: SortSpec[];
  groupBy: "status" | "priority" | "assignee" | "none";
  viewMode: "list" | "board";
  collapsedGroups: string[];
  columnFilters?: { title?: string; status?: string[]; priority?: string[] };
};

export const defaultViewState: IssueViewState = {
  statuses: [],
  priorities: [],
  assignees: [],
  labels: [],
  projects: [],
  sortField: "updated",
  sortDir: "desc",
  secondarySorts: [],
  groupBy: "none",
  viewMode: "list",
  collapsedGroups: [],
  columnFilters: {},
};

export const quickFilterPresets = [
  { label: "All", statuses: [] as string[] },
  { label: "Active", statuses: ["todo", "in_progress", "in_review", "blocked"] },
  { label: "Backlog", statuses: ["backlog"] },
  { label: "Done", statuses: ["done", "cancelled"] },
];

export const ISSUE_SEARCH_COMMIT_DELAY_MS = 150;

export interface Agent {
  id: string;
  name: string;
}

export interface ProjectOption {
  id: string;
  name: string;
}

export interface RoutineOption {
  id: string;
  title: string;
}

export interface IssuesListProps {
  issues: Issue[];
  isLoading?: boolean;
  error?: Error | null;
  agents?: Agent[];
  projects?: ProjectOption[];
  goals?: Array<{ id: string; title: string }>;
  routines?: RoutineOption[];
  liveIssueIds?: Set<string>;
  projectId?: string;
  viewStateKey: string;
  issueLinkState?: unknown;
  initialAssignees?: string[];
  initialSearch?: string;
  searchFilters?: {
    participantAgentId?: string;
  };
  onSearchChange?: (search: string) => void;
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void;
  goalInfo?: KanbanGoalInfo | null;
}

// -- Helpers --

export function getViewState(key: string): IssueViewState {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...defaultViewState, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...defaultViewState };
}

export function saveViewState(key: string, state: IssueViewState) {
  localStorage.setItem(key, JSON.stringify(state));
}

export function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export function toggleInArray(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function applyFilters(issues: Issue[], state: IssueViewState, currentUserId?: string | null): Issue[] {
  let result = issues;
  if (state.statuses.length > 0) result = result.filter((i) => state.statuses.includes(i.status));
  if (state.priorities.length > 0) result = result.filter((i) => state.priorities.includes(i.priority));
  if (state.assignees.length > 0) {
    result = result.filter((issue) => {
      for (const assignee of state.assignees) {
        if (assignee === "__unassigned" && !issue.assigneeAgentId && !issue.assigneeUserId) return true;
        if (assignee === "__me" && currentUserId && issue.assigneeUserId === currentUserId) return true;
        if (issue.assigneeAgentId === assignee) return true;
      }
      return false;
    });
  }
  if (state.labels.length > 0)
    result = result.filter((i) => (i.labelIds ?? []).some((id) => state.labels.includes(id)));
  if (state.projects.length > 0)
    result = result.filter((i) => i.projectId != null && state.projects.includes(i.projectId));
  return result;
}

function compareByField(a: Issue, b: Issue, field: string, dir: number): number {
  switch (field) {
    case "status":
      return dir * (statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
    case "priority":
      return dir * (priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority));
    case "title":
      return dir * a.title.localeCompare(b.title);
    case "created":
      return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    case "updated":
      return dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
    default:
      return 0;
  }
}

export function sortIssues(issues: Issue[], state: IssueViewState): Issue[] {
  const sorted = [...issues];
  const primaryDir = state.sortDir === "asc" ? 1 : -1;
  const secondary = state.secondarySorts ?? [];
  sorted.sort((a, b) => {
    const primary = compareByField(a, b, state.sortField, primaryDir);
    if (primary !== 0) return primary;
    for (const sec of secondary) {
      const result = compareByField(a, b, sec.field, sec.dir === "asc" ? 1 : -1);
      if (result !== 0) return result;
    }
    return 0;
  });
  return sorted;
}

export function applyColumnFilters(issues: Issue[], columnFilters?: IssueViewState["columnFilters"]): Issue[] {
  if (!columnFilters) return issues;
  let result = issues;
  if (columnFilters.title?.trim()) {
    const q = columnFilters.title.trim().toLowerCase();
    result = result.filter((i) => i.title.toLowerCase().includes(q));
  }
  if (columnFilters.status && columnFilters.status.length > 0) {
    result = result.filter((i) => columnFilters.status!.includes(i.status));
  }
  if (columnFilters.priority && columnFilters.priority.length > 0) {
    result = result.filter((i) => columnFilters.priority!.includes(i.priority));
  }
  return result;
}

export function countActiveFilters(state: IssueViewState): number {
  let count = 0;
  if (state.statuses.length > 0) count++;
  if (state.priorities.length > 0) count++;
  if (state.assignees.length > 0) count++;
  if (state.labels.length > 0) count++;
  if (state.projects.length > 0) count++;
  return count;
}

/**
 * Agent performance domain types
 *
 * Types shared between the AgentPerformance page,
 * performance sub-components, and the dashboard SpendMetrics section.
 */

export interface AgentPerfRow {
  agentId: string;
  name: string;
  status: string;
  tasksDone: number;
  tasksInProgress: number;
  throughput: number; // tasks per day
  avgCloseH: number | null;
  costPerTask: number | null; // cents
  totalSpendCents: number;
  completionRate: number; // 0-100
  rating: "A" | "B" | "C" | "D" | "F";
  ratingScore: number; // 0-100 composite
}

export type TimeRange = "7d" | "30d" | "all";

export type SortField =
  | "rating"
  | "tasksDone"
  | "throughput"
  | "avgCloseH"
  | "costPerTask"
  | "totalSpendCents"
  | "completionRate";

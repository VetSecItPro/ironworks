import type { Issue } from "@ironworksai/shared";

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

export const RATING_COLORS: Record<string, string> = {
  A: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  B: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  C: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  D: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  F: "text-red-400 bg-red-500/10 border-red-500/20",
};

export function computeRating(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

export function isInRange(date: Date | string, range: TimeRange): boolean {
  if (range === "all") return true;
  const days = range === "7d" ? 7 : 30;
  return new Date(date).getTime() > Date.now() - days * 24 * 60 * 60 * 1000;
}

export function computeAgentPerformance(
  agents: Array<{ id: string; name: string; status: string }>,
  issues: Issue[],
  costsByAgent: Array<{ agentId: string; costCents: number }>,
  range: TimeRange,
): AgentPerfRow[] {
  const rangedIssues =
    range === "all"
      ? issues
      : issues.filter((i) => isInRange(i.updatedAt, range));
  const days =
    range === "7d"
      ? 7
      : range === "30d"
        ? 30
        : (() => {
            if (issues.length === 0) return 1;
            let earliest = Date.now();
            for (const i of issues) {
              const t = new Date(i.createdAt).getTime();
              if (t < earliest) earliest = t;
            }
            return Math.max(
              1,
              Math.ceil((Date.now() - earliest) / (24 * 60 * 60 * 1000)),
            );
          })();

  const rows: AgentPerfRow[] = [];

  for (const agent of agents) {
    if (agent.status === "terminated") continue;

    const agentIssues = rangedIssues.filter(
      (i) => i.assigneeAgentId === agent.id,
    );
    const done = agentIssues.filter((i) => i.status === "done");
    const inProgress = agentIssues.filter((i) => i.status === "in_progress");
    const cancelled = agentIssues.filter((i) => i.status === "cancelled");
    const tasksDone = done.length;
    const tasksInProgress = inProgress.length;
    const throughput = tasksDone / days;

    // Avg close time
    let totalCloseMs = 0;
    let closeCount = 0;
    for (const issue of done) {
      if (issue.startedAt && issue.completedAt) {
        totalCloseMs +=
          new Date(issue.completedAt).getTime() -
          new Date(issue.startedAt).getTime();
        closeCount++;
      }
    }
    const avgCloseH =
      closeCount > 0
        ? totalCloseMs / closeCount / (1000 * 60 * 60)
        : null;

    // Cost
    const agentCost = costsByAgent.find((c) => c.agentId === agent.id);
    const totalSpendCents = agentCost?.costCents ?? 0;
    const costPerTask = tasksDone > 0 ? totalSpendCents / tasksDone : null;

    // Completion rate
    const totalResolved = tasksDone + cancelled.length;
    const completionRate =
      totalResolved > 0
        ? Math.round((tasksDone / totalResolved) * 100)
        : tasksDone > 0
          ? 100
          : 0;

    rows.push({
      agentId: agent.id,
      name: agent.name,
      status: agent.status,
      tasksDone,
      tasksInProgress,
      throughput,
      avgCloseH,
      costPerTask,
      totalSpendCents,
      completionRate,
      rating: "C", // placeholder, computed below
      ratingScore: 0,
    });
  }

  // Compute composite score relative to team
  if (rows.length > 0) {
    const withTasks = rows.filter((r) => r.tasksDone > 0);
    const avgCost =
      withTasks.length > 0
        ? withTasks.reduce((s, r) => s + (r.costPerTask ?? 0), 0) /
          withTasks.length
        : 0;
    const avgClose =
      withTasks.filter((r) => r.avgCloseH !== null).reduce(
        (s, r) => s + r.avgCloseH!,
        0,
      ) /
      (withTasks.filter((r) => r.avgCloseH !== null).length || 1);
    const maxThroughput = Math.max(...rows.map((r) => r.throughput), 0.001);

    for (const row of rows) {
      if (row.tasksDone === 0) {
        row.ratingScore = 0;
        row.rating = "F";
        continue;
      }

      // Cost efficiency (0-100, lower cost = higher score)
      const costScore =
        avgCost > 0 && row.costPerTask !== null
          ? Math.min(
              100,
              Math.max(
                0,
                100 - ((row.costPerTask - avgCost) / avgCost) * 50,
              ),
            )
          : 50;

      // Speed (0-100, faster = higher score)
      const speedScore =
        avgClose > 0 && row.avgCloseH !== null
          ? Math.min(
              100,
              Math.max(
                0,
                100 - ((row.avgCloseH - avgClose) / avgClose) * 50,
              ),
            )
          : 50;

      // Throughput (0-100, more tasks/day = higher)
      const throughputScore = Math.min(
        100,
        (row.throughput / maxThroughput) * 100,
      );

      // Completion rate (0-100)
      const completionScore = row.completionRate;

      // Weighted composite
      const composite = Math.round(
        costScore * 0.25 +
          speedScore * 0.25 +
          throughputScore * 0.25 +
          completionScore * 0.25,
      );

      row.ratingScore = composite;
      row.rating = computeRating(composite);
    }
  }

  return rows.sort((a, b) => b.ratingScore - a.ratingScore);
}

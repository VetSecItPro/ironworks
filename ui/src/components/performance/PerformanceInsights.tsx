import { AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";
import { useMemo } from "react";
import { Link } from "@/lib/router";
import { cn, formatCents } from "../../lib/utils";
import type { AgentPerfRow } from "./ratingUtils";

interface Insight {
  type: "warning" | "suggestion" | "positive";
  agent: string;
  agentId: string | null;
  message: string;
  actionLabel: string;
  actionHref: string;
}

function generateInsights(rows: AgentPerfRow[]): Insight[] {
  const insights: Insight[] = [];
  const withTasks = rows.filter((r) => r.tasksDone > 0);
  const avgCost = withTasks.length > 0 ? withTasks.reduce((s, r) => s + (r.costPerTask ?? 0), 0) / withTasks.length : 0;
  const avgClose = withTasks.filter((r) => r.avgCloseH !== null);
  const avgCloseH = avgClose.length > 0 ? avgClose.reduce((s, r) => s + r.avgCloseH!, 0) / avgClose.length : 0;

  const anyTasksDone = rows.some((r) => r.tasksDone > 0);
  if (!anyTasksDone && rows.length > 0) {
    const spendingAgents = rows.filter((r) => r.totalSpendCents > 0);
    if (spendingAgents.length > 0) {
      insights.push({
        type: "warning",
        agent: "Team",
        agentId: null,
        message: `${spendingAgents.length} agent${spendingAgents.length === 1 ? "" : "s"} have consumed tokens (${formatCents(spendingAgents.reduce((s, r) => s + r.totalSpendCents, 0))} total) but completed 0 tasks. Create and assign missions to start tracking output.`,
        actionLabel: "Create mission",
        actionHref: "/issues",
      });
    }
  }

  for (const row of rows) {
    const agentHref = `/agents/${row.agentId}`;

    if (row.tasksDone === 0 && row.tasksInProgress === 0) {
      if (row.totalSpendCents > 0) {
        insights.push({
          type: "warning",
          agent: row.name,
          agentId: row.agentId,
          message: `${row.name} has spent ${formatCents(row.totalSpendCents)} but completed 0 tasks. Spending is from heartbeat runs without assigned work.`,
          actionLabel: "Assign work",
          actionHref: "/issues",
        });
      } else {
        insights.push({
          type: "suggestion",
          agent: row.name,
          agentId: row.agentId,
          message: `${row.name} has no completed or active tasks.`,
          actionLabel: "Configure agent",
          actionHref: agentHref,
        });
      }
      continue;
    }

    if (row.costPerTask !== null && avgCost > 0 && row.costPerTask > avgCost * 2) {
      insights.push({
        type: "suggestion",
        agent: row.name,
        agentId: row.agentId,
        message: `${row.name} costs ${formatCents(Math.round(row.costPerTask))}/task (${Math.round(row.costPerTask / avgCost)}x team avg). Switch to a smaller model or reduce context size.`,
        actionLabel: "Edit model config",
        actionHref: agentHref,
      });
    }

    if (row.avgCloseH !== null && avgCloseH > 0 && row.avgCloseH > avgCloseH * 2) {
      insights.push({
        type: "suggestion",
        agent: row.name,
        agentId: row.agentId,
        message: `${row.name} averages ${row.avgCloseH.toFixed(1)}h per task (${Math.round(row.avgCloseH / avgCloseH)}x team avg). Simplify instructions or break tasks smaller.`,
        actionLabel: "Edit SOUL.md",
        actionHref: agentHref,
      });
    }

    if (row.tasksDone > 2 && row.completionRate < 60) {
      insights.push({
        type: "warning",
        agent: row.name,
        agentId: row.agentId,
        message: `${row.name} has a ${row.completionRate}% completion rate - too many cancelled tasks.`,
        actionLabel: "Review assignments",
        actionHref: `/issues?assignee=${row.agentId}`,
      });
    }

    if (row.rating === "A" && row.tasksDone >= 3) {
      insights.push({
        type: "positive",
        agent: row.name,
        agentId: row.agentId,
        message: `${row.name} is a top performer - efficient, fast, and reliable.`,
        actionLabel: "Assign high-priority work",
        actionHref: "/issues",
      });
    }
  }

  return insights.sort((a, b) => {
    const order = { warning: 0, suggestion: 1, positive: 2 };
    return order[a.type] - order[b.type];
  });
}

export function PerformanceInsights({ rows }: { rows: AgentPerfRow[] }) {
  const insights = useMemo(() => generateInsights(rows), [rows]);

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Lightbulb className="h-3.5 w-3.5" />
        Performance Insights
      </h4>
      {insights.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No insights yet. Insights will appear as agents complete tasks and build up performance history.
        </p>
      ) : (
        <div className="space-y-2">
          {insights.slice(0, 8).map((insight) => (
            <div
              key={`${insight.agent}-${insight.message}`}
              className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm"
            >
              {insight.type === "warning" && <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />}
              {insight.type === "suggestion" && <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />}
              {insight.type === "positive" && <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />}
              <div className="flex-1 min-w-0">
                <span className="text-muted-foreground">{insight.message}</span>
                <span className="mx-1.5 text-border">·</span>
                <Link
                  to={insight.actionHref}
                  className={cn(
                    "text-xs font-medium underline underline-offset-2 transition-colors",
                    insight.type === "warning" && "text-red-400 hover:text-red-300",
                    insight.type === "suggestion" && "text-amber-400 hover:text-amber-300",
                    insight.type === "positive" && "text-emerald-400 hover:text-emerald-300",
                  )}
                >
                  {insight.actionLabel} &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

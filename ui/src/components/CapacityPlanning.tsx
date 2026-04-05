import { useMemo } from "react";
import { cn } from "../lib/utils";
import { TrendingUp, AlertTriangle, BarChart3, Users } from "lucide-react";
import type { Agent, Issue } from "@ironworksai/shared";

interface CapacityPlanningProps {
  issues: Issue[];
  agents: Agent[];
}

const OVERLOAD_THRESHOLD = 5;

/**
 * Backlog Burn-up Chart - shows total backlog size over simulated time windows
 * with a projection line extending into the future.
 */
function BacklogBurnUpChart({ issues }: { issues: Issue[] }) {
  const chartData = useMemo(() => {
    // Group issues by creation date (last 8 weeks)
    const now = new Date();
    const weeks: { label: string; total: number; completed: number }[] = [];

    for (let w = 7; w >= 0; w--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - w * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const created = issues.filter(
        (i) => new Date(i.createdAt) <= weekEnd,
      ).length;

      const completed = issues.filter(
        (i) =>
          i.completedAt &&
          new Date(i.completedAt) <= weekEnd,
      ).length;

      weeks.push({
        label: `W${8 - w}`,
        total: created,
        completed,
      });
    }

    // Project 2 more weeks based on velocity
    const recentCompleted =
      weeks.length >= 2
        ? (weeks[weeks.length - 1].completed - weeks[weeks.length - 3].completed) / 2
        : 0;
    const recentCreated =
      weeks.length >= 2
        ? (weeks[weeks.length - 1].total - weeks[weeks.length - 3].total) / 2
        : 0;

    for (let p = 1; p <= 2; p++) {
      const lastWeek = weeks[weeks.length - 1];
      weeks.push({
        label: `P${p}`,
        total: Math.round(lastWeek.total + recentCreated * p),
        completed: Math.round(lastWeek.completed + recentCompleted * p),
      });
    }

    return weeks;
  }, [issues]);

  const maxVal = Math.max(...chartData.map((d) => Math.max(d.total, d.completed)), 1);
  const chartHeight = 120;
  const chartWidth = chartData.length * 60;
  const padding = { top: 10, right: 10, bottom: 25, left: 35 };

  const scaleX = (i: number) =>
    padding.left + (i / (chartData.length - 1)) * (chartWidth - padding.left - padding.right);
  const scaleY = (v: number) =>
    padding.top + (1 - v / maxVal) * (chartHeight - padding.top - padding.bottom);

  const totalPath = chartData
    .map((d, i) => `${i === 0 ? "M" : "L"} ${scaleX(i)} ${scaleY(d.total)}`)
    .join(" ");
  const completedPath = chartData
    .map((d, i) => `${i === 0 ? "M" : "L"} ${scaleX(i)} ${scaleY(d.completed)}`)
    .join(" ");

  // Projection starts at week 8 (index 7)
  const projStartIdx = 8;
  const projTotalPath = chartData
    .slice(projStartIdx - 1)
    .map((d, i) => `${i === 0 ? "M" : "L"} ${scaleX(projStartIdx - 1 + i)} ${scaleY(d.total)}`)
    .join(" ");
  const projCompletedPath = chartData
    .slice(projStartIdx - 1)
    .map((d, i) => `${i === 0 ? "M" : "L"} ${scaleX(projStartIdx - 1 + i)} ${scaleY(d.completed)}`)
    .join(" ");

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Backlog Burn-up</h3>
      </div>
      <svg width="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="overflow-visible">
        {/* Y-axis labels */}
        {[0, Math.round(maxVal / 2), maxVal].map((v) => (
          <g key={v}>
            <text
              x={padding.left - 5}
              y={scaleY(v)}
              className="fill-muted-foreground text-[8px]"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {v}
            </text>
            <line
              x1={padding.left}
              y1={scaleY(v)}
              x2={chartWidth - padding.right}
              y2={scaleY(v)}
              className="stroke-border"
              strokeWidth={0.5}
            />
          </g>
        ))}

        {/* X-axis labels */}
        {chartData.map((d, i) => (
          <text
            key={d.label}
            x={scaleX(i)}
            y={chartHeight - 5}
            className={cn(
              "text-[8px]",
              d.label.startsWith("P") ? "fill-amber-500" : "fill-muted-foreground",
            )}
            textAnchor="middle"
          >
            {d.label}
          </text>
        ))}

        {/* Total line (solid for actual, dashed for projection) */}
        <path
          d={totalPath.split(" ").slice(0, projStartIdx * 3).join(" ")}
          fill="none"
          className="stroke-blue-500"
          strokeWidth={1.5}
        />
        {projStartIdx < chartData.length && (
          <path
            d={projTotalPath}
            fill="none"
            className="stroke-blue-500"
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
        )}

        {/* Completed line */}
        <path
          d={completedPath.split(" ").slice(0, projStartIdx * 3).join(" ")}
          fill="none"
          className="stroke-emerald-500"
          strokeWidth={1.5}
        />
        {projStartIdx < chartData.length && (
          <path
            d={projCompletedPath}
            fill="none"
            className="stroke-emerald-500"
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
        )}
      </svg>
      <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-blue-500 rounded" />
          Total created
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-emerald-500 rounded" />
          Completed
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-amber-500 rounded border-dashed" style={{ borderTop: "1px dashed" }} />
          Projection
        </span>
      </div>
    </div>
  );
}

/**
 * Workload Balancer - horizontal bar chart of tasks per agent,
 * highlights overloaded agents (more than OVERLOAD_THRESHOLD tasks).
 */
function WorkloadBalancer({ issues, agents }: CapacityPlanningProps) {
  const agentWorkload = useMemo(() => {
    const counts = new Map<string, number>();
    const activeIssues = issues.filter(
      (i) => i.status !== "done" && i.status !== "cancelled",
    );

    for (const issue of activeIssues) {
      if (issue.assigneeAgentId) {
        counts.set(
          issue.assigneeAgentId,
          (counts.get(issue.assigneeAgentId) ?? 0) + 1,
        );
      }
    }

    const agentMap = new Map(agents.map((a) => [a.id, a]));

    return [...counts.entries()]
      .map(([agentId, count]) => ({
        agentId,
        name: agentMap.get(agentId)?.name ?? agentId.slice(0, 8),
        role: agentMap.get(agentId)?.role ?? "unknown",
        count,
        overloaded: count > OVERLOAD_THRESHOLD,
      }))
      .sort((a, b) => b.count - a.count);
  }, [issues, agents]);

  const maxCount = Math.max(...agentWorkload.map((a) => a.count), 1);

  if (agentWorkload.length === 0) {
    return (
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Workload Balancer</h3>
        </div>
        <p className="text-xs text-muted-foreground">No active assignments.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Workload Balancer</h3>
      </div>
      <div className="space-y-2">
        {agentWorkload.map((agent) => (
          <div key={agent.agentId} className="flex items-center gap-2">
            <div className="w-24 text-xs truncate text-muted-foreground shrink-0" title={agent.name}>
              {agent.name}
            </div>
            <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden relative">
              <div
                className={cn(
                  "h-full rounded transition-all duration-300",
                  agent.overloaded ? "bg-red-500/80" : "bg-primary/60",
                )}
                style={{ width: `${(agent.count / maxCount) * 100}%` }}
              />
              {/* Threshold marker */}
              <div
                className="absolute top-0 bottom-0 w-px bg-amber-500/60"
                style={{ left: `${(OVERLOAD_THRESHOLD / maxCount) * 100}%` }}
              />
            </div>
            <div
              className={cn(
                "w-8 text-right text-xs tabular-nums font-medium shrink-0",
                agent.overloaded ? "text-red-500" : "text-foreground",
              )}
            >
              {agent.count}
            </div>
            {agent.overloaded && (
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-1.5 h-3 bg-primary/60 rounded" />
          Normal
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-1.5 h-3 bg-red-500/80 rounded" />
          Overloaded (&gt;{OVERLOAD_THRESHOLD})
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-px h-3 bg-amber-500/60" />
          Threshold
        </span>
      </div>
    </div>
  );
}

export function CapacityPlanning({ issues, agents }: CapacityPlanningProps) {
  return (
    <div className="space-y-4">
      <BacklogBurnUpChart issues={issues} />
      <WorkloadBalancer issues={issues} agents={agents} />
    </div>
  );
}

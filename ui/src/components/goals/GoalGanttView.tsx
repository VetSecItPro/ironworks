import type { Goal } from "@ironworksai/shared";
import { Link } from "@/lib/router";
import type { GoalProgressItem } from "../../api/goalProgress";
import { cn } from "../../lib/utils";
import { resolveGoalHealth } from "./goal-health";

export function GoalGanttView({
  goals,
  progressMap,
  childrenMap,
}: {
  goals: Goal[];
  progressMap: Map<string, GoalProgressItem>;
  childrenMap: Map<string, Goal[]>;
}) {
  // Determine date range across all goals
  const allDates = goals.flatMap((g) => {
    const dates: number[] = [new Date(g.createdAt).getTime()];
    if (g.targetDate) dates.push(new Date(g.targetDate).getTime());
    return dates;
  });
  if (allDates.length === 0) return <p className="text-sm text-muted-foreground">No goals with dates for timeline.</p>;

  const minDate = Math.min(...allDates);
  const maxDate = Math.max(...allDates, Date.now() + 30 * 24 * 60 * 60 * 1000);
  const range = maxDate - minDate || 1;
  const nowPct = ((Date.now() - minDate) / range) * 100;

  // Build month markers
  const startMonth = new Date(minDate);
  startMonth.setDate(1);
  const months: Array<{ label: string; pct: number }> = [];
  const d = new Date(startMonth);
  while (d.getTime() <= maxDate) {
    const pct = ((d.getTime() - minDate) / range) * 100;
    if (pct >= 0 && pct <= 100) {
      months.push({ label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }), pct });
    }
    d.setMonth(d.getMonth() + 1);
  }

  return (
    <div className="space-y-1">
      {/* Month header */}
      <div className="relative h-6 border-b border-border mb-2">
        {months.map((m, i) => (
          <span
            key={i}
            className="absolute text-[10px] text-muted-foreground/80 -translate-x-1/2"
            style={{ left: `${m.pct}%`, top: 0 }}
          >
            {m.label}
          </span>
        ))}
        {/* Today marker */}
        <div className="absolute top-0 bottom-0 w-px bg-blue-500/50" style={{ left: `${nowPct}%` }} title="Today" />
      </div>

      {/* Goal bars */}
      {goals.map((goal) => {
        const startPct = ((new Date(goal.createdAt).getTime() - minDate) / range) * 100;
        const endPct = goal.targetDate
          ? ((new Date(goal.targetDate).getTime() - minDate) / range) * 100
          : Math.min(100, startPct + 15);
        const width = Math.max(2, endPct - startPct);
        const progress = progressMap.get(goal.id);
        const percent = progress?.progressPercent ?? 0;
        const health = resolveGoalHealth(goal, progress);
        const barColor =
          health === "on_track"
            ? "bg-emerald-500"
            : health === "at_risk"
              ? "bg-amber-500"
              : health === "off_track"
                ? "bg-red-500"
                : "bg-muted-foreground/30";
        const children = childrenMap.get(goal.id);

        return (
          <div key={goal.id} className="group">
            <div className="flex items-center gap-2 h-8">
              <Link
                to={`/goals/${goal.id}`}
                className="w-[160px] shrink-0 text-xs font-medium truncate hover:underline no-underline text-inherit"
                title={goal.title}
              >
                {goal.title}
              </Link>
              <div className="flex-1 relative h-5">
                {/* Background track */}
                <div className="absolute inset-y-0 left-0 right-0 bg-muted/20 rounded" />
                {/* Goal bar */}
                <div
                  className={cn("absolute top-0.5 bottom-0.5 rounded", barColor, "opacity-40")}
                  style={{ left: `${startPct}%`, width: `${width}%` }}
                />
                {/* Progress fill */}
                <div
                  className={cn("absolute top-0.5 bottom-0.5 rounded", barColor)}
                  style={{ left: `${startPct}%`, width: `${width * (percent / 100)}%` }}
                />
                {/* Dependency lines to children */}
                {children && children.length > 0 && (
                  <div
                    className="absolute bottom-0 w-px bg-muted-foreground/20 h-2"
                    style={{ left: `${startPct + width / 2}%` }}
                  />
                )}
              </div>
              <span className="w-10 text-right text-[10px] text-muted-foreground tabular-nums shrink-0">
                {Math.round(percent)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

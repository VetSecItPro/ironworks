import type { Goal } from "@ironworksai/shared";
import { CheckCircle2, Circle, Clock, Loader2, ShieldAlert } from "lucide-react";
import { Link } from "@/lib/router";
import type { GoalProgressItem } from "../../api/goalProgress";
import { cn } from "../../lib/utils";
import { StatusBadge } from "../StatusBadge";
import { forecastCompletion, resolveGoalHealth } from "./goal-health";
import { ConfidenceIndicator, HealthBadge } from "./HealthBadge";
import { ProgressBar } from "./ProgressBar";

export function GoalCard({
  goal,
  progress,
  children,
}: {
  goal: Goal;
  progress?: GoalProgressItem | null;
  children?: Goal[];
}) {
  const totalIssues = progress?.totalIssues ?? 0;
  const completed = progress?.completedIssues ?? 0;
  const inProgress = progress?.inProgressIssues ?? 0;
  const blocked = progress?.blockedIssues ?? 0;
  const percent = progress?.progressPercent ?? 0;
  const health = resolveGoalHealth(goal, progress);
  const forecast = forecastCompletion(goal, progress);

  return (
    <Link
      to={`/goals/${goal.id}`}
      className="block border border-border rounded-lg p-4 transition-all duration-150 hover:bg-accent/30 hover:border-border/80 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <HealthBadge health={health} />
            <h3 className="text-sm font-semibold truncate">{goal.title}</h3>
            <StatusBadge status={goal.status} />
            <ConfidenceIndicator confidence={goal.confidence} />
            {goal.targetDate && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full shrink-0",
                  new Date(goal.targetDate) < new Date()
                    ? "bg-red-500/10 text-red-600 dark:text-red-400"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {new Date(goal.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
          {goal.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{goal.description}</p>}
          {forecast && (
            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Forecasted completion: {forecast}
            </p>
          )}
        </div>
        {totalIssues > 0 && (
          <div className="text-right shrink-0">
            <span className="text-xl font-bold tabular-nums">{Math.round(percent)}%</span>
            <div className="text-[10px] text-muted-foreground tabular-nums">
              {completed}/{totalIssues} done
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {totalIssues > 0 && (
        <div className="mt-3">
          <ProgressBar percent={percent} />
          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
            {completed > 0 && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                {completed} done
              </span>
            )}
            {inProgress > 0 && (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 text-blue-500" />
                {inProgress} active
              </span>
            )}
            {blocked > 0 && (
              <span className="flex items-center gap-1">
                <ShieldAlert className="h-3 w-3 text-red-500" />
                {blocked} blocked
              </span>
            )}
            {totalIssues - completed - inProgress - blocked > 0 && (
              <span className="flex items-center gap-1">
                <Circle className="h-3 w-3" />
                {totalIssues - completed - inProgress - blocked} pending
              </span>
            )}
          </div>
        </div>
      )}

      {totalIssues === 0 && (
        <div className="mt-2 text-xs text-muted-foreground italic">
          No tasks yet - click to add issues or run a playbook
        </div>
      )}

      {/* Sub-goals indicator */}
      {children && children.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
          {children.length} sub-goal{children.length !== 1 ? "s" : ""}
        </div>
      )}
    </Link>
  );
}

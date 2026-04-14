import { Link } from "@/lib/router";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";

interface GoalProgress {
  totalIssues: number;
  progressPercent: number;
}

interface ParentGoal {
  id: string;
  title: string;
  healthStatus?: string | null;
}

interface IssueGoalBannerProps {
  parentGoal: ParentGoal;
  parentGoalProgress?: GoalProgress | null;
}

export function IssueGoalBanner({ parentGoal, parentGoalProgress }: IssueGoalBannerProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3.5 py-2.5 text-sm">
      <Target className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">This task advances:</div>
        <Link
          to={`/goals/${parentGoal.id}`}
          className="text-sm font-medium hover:underline"
        >
          {parentGoal.title}
        </Link>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {parentGoal.healthStatus && parentGoal.healthStatus !== "no_data" && (
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
            parentGoal.healthStatus === "on_track" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            parentGoal.healthStatus === "at_risk" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
            parentGoal.healthStatus === "off_track" && "bg-red-500/10 text-red-600 dark:text-red-400",
            parentGoal.healthStatus === "achieved" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          )}>
            {parentGoal.healthStatus.replace(/_/g, " ")}
          </span>
        )}
        {parentGoalProgress && parentGoalProgress.totalIssues > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-16 bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  parentGoalProgress.progressPercent === 100 ? "bg-emerald-500" : parentGoalProgress.progressPercent > 50 ? "bg-blue-500" : "bg-amber-500",
                )}
                style={{ width: `${parentGoalProgress.progressPercent}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">{Math.round(parentGoalProgress.progressPercent)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

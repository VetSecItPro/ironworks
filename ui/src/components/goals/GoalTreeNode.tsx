import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Loader2, ShieldAlert } from "lucide-react";
import type { Goal } from "@ironworksai/shared";
import type { GoalProgressItem } from "../../api/goalProgress";
import { cn } from "../../lib/utils";
import { StatusBadge } from "../StatusBadge";
import { Link } from "@/lib/router";
import { HealthBadge } from "./HealthBadge";
import { resolveGoalHealth } from "./goal-health";

function progressColor(percent: number): string {
  if (percent >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (percent >= 30) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function progressBarColor(percent: number): string {
  if (percent >= 70) return "bg-emerald-500";
  if (percent >= 30) return "bg-amber-500";
  return "bg-red-500";
}

export interface GoalTreeNodeProps {
  goal: Goal;
  progress?: GoalProgressItem;
  childGoals: Goal[];
  allGoals: Goal[];
  progressMap: Map<string, GoalProgressItem>;
  issuesByGoal: Map<string, Array<{ id: string; title: string; status: string; identifier: string | null }>>;
  depth?: number;
}

export function GoalTreeNode({ goal, progress, childGoals, allGoals, progressMap, issuesByGoal, depth = 0 }: GoalTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const percent = progress?.progressPercent ?? 0;
  const issues = issuesByGoal.get(goal.id) ?? [];
  const hasChildren = childGoals.length > 0 || issues.length > 0;
  const health = resolveGoalHealth(goal, progress);

  const issueStatusIcon = (status: string) => {
    if (status === "done") return <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />;
    if (status === "in_progress") return <Loader2 className="h-3 w-3 text-blue-500 shrink-0" />;
    if (status === "blocked") return <ShieldAlert className="h-3 w-3 text-red-500 shrink-0" />;
    return <Circle className="h-3 w-3 text-muted-foreground shrink-0" />;
  };

  return (
    <div className={cn("border border-border rounded-lg", depth > 0 && "ml-6 mt-2")}>
      <div
        className={cn(
          "flex items-center gap-2 p-3 rounded-t-lg",
          hasChildren && "cursor-pointer hover:bg-accent/30",
          !expanded && "rounded-b-lg",
        )}
        onClick={() => hasChildren && setExpanded((e) => !e)}
      >
        {hasChildren ? (
          expanded
            ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              to={`/goals/${goal.id}`}
              className="text-sm font-semibold hover:underline truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {goal.title}
            </Link>
            <StatusBadge status={goal.status} />
            <HealthBadge health={health} />
            <span className="text-xs text-muted-foreground shrink-0">{goal.level}</span>
          </div>
          {progress && progress.totalIssues > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 max-w-[200px] bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-[width] duration-500 ease-out", progressBarColor(percent))}
                  style={{ width: `${Math.min(100, percent)}%` }}
                />
              </div>
              <span className={cn("text-xs font-medium tabular-nums", progressColor(percent))}>
                {Math.round(percent)}%
              </span>
              <span className="text-[11px] text-muted-foreground">
                {progress.completedIssues}/{progress.totalIssues}
              </span>
            </div>
          )}
        </div>
      </div>

      {expanded && hasChildren && (
        <div className="border-t border-border px-3 py-2 space-y-1 rounded-b-lg bg-muted/20">
          {/* Issues linked to this goal */}
          {issues.map((issue) => (
            <div key={issue.id} className="flex items-center gap-2 py-1 pl-6">
              {issueStatusIcon(issue.status)}
              <Link
                to={`/issues/${issue.id}`}
                className="text-xs hover:underline text-muted-foreground hover:text-foreground truncate"
              >
                {issue.identifier ? (
                  <span className="font-mono mr-1 text-[10px]">{issue.identifier}</span>
                ) : null}
                {issue.title}
              </Link>
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full shrink-0",
                issue.status === "done" && "bg-emerald-500/10 text-emerald-600",
                issue.status === "in_progress" && "bg-blue-500/10 text-blue-600",
                issue.status === "blocked" && "bg-red-500/10 text-red-600",
                !["done", "in_progress", "blocked"].includes(issue.status) && "bg-muted text-muted-foreground",
              )}>
                {issue.status.replace("_", " ")}
              </span>
            </div>
          ))}
          {/* Child goals */}
          {childGoals.map((child) => (
            <GoalTreeNode
              key={child.id}
              goal={child}
              progress={progressMap.get(child.id)}
              childGoals={allGoals.filter((g) => g.parentId === child.id)}
              allGoals={allGoals}
              progressMap={progressMap}
              issuesByGoal={issuesByGoal}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

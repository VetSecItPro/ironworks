import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import type { Goal } from "@ironworksai/shared";
import type { GoalProgressItem } from "../../api/goalProgress";
import { resolveGoalHealth } from "./goal-health";

export function CascadeSummaryBanner({
  goals,
  progressMap,
}: {
  goals: Goal[];
  progressMap: Map<string, GoalProgressItem>;
}) {
  const counts = useMemo(() => {
    let onTrack = 0;
    let atRisk = 0;
    let offTrack = 0;
    let total = 0;

    for (const goal of goals) {
      const progress = progressMap.get(goal.id);
      const health = resolveGoalHealth(goal, progress);
      if (health === "no_data") continue;
      total++;
      if (health === "on_track") onTrack++;
      else if (health === "at_risk") atRisk++;
      else if (health === "off_track") offTrack++;
    }

    if (total === 0) return null;
    return {
      onTrack: Math.round((onTrack / total) * 100),
      atRisk: Math.round((atRisk / total) * 100),
      offTrack: Math.round((offTrack / total) * 100),
      total,
    };
  }, [goals, progressMap]);

  if (!counts) return null;

  return (
    <div className="flex items-center gap-4 px-4 py-2.5 rounded-lg border border-border bg-muted/30">
      <div className="flex items-center gap-1.5 text-xs">
        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground font-medium">Goal Health</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="font-medium text-emerald-600 dark:text-emerald-400">{counts.onTrack}%</span>
          <span className="text-muted-foreground">on track</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="font-medium text-amber-600 dark:text-amber-400">{counts.atRisk}%</span>
          <span className="text-muted-foreground">at risk</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="font-medium text-red-600 dark:text-red-400">{counts.offTrack}%</span>
          <span className="text-muted-foreground">off track</span>
        </span>
      </div>
      <span className="text-[11px] text-muted-foreground ml-auto">{counts.total} goals scored</span>
    </div>
  );
}

import { Link } from "../../lib/router";
import { cn } from "../../lib/utils";
import { Target, ClipboardList } from "lucide-react";
import { StatBlock } from "../briefing/BriefingCards";

interface GoalStats {
  total: number;
  completed: number;
  inProgress: number;
  atRisk: number;
  completionRate: number;
  onTrack: number;
  healthAtRisk: number;
  offTrack: number;
  topAtRisk: Array<{
    id: string;
    title: string;
    healthScore: number | null;
    healthStatus: string | null;
    ownerAgentId: string | null;
  }>;
}

interface GoalsPendingCardsProps {
  goalStats: GoalStats;
  pendingHiringCount: number;
  pendingApprovalsCount: number;
}

export function GoalsPendingCards({
  goalStats,
  pendingHiringCount,
  pendingApprovalsCount,
}: GoalsPendingCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Link to="/goals" className="no-underline text-inherit block">
        <div className="rounded-xl border border-border p-5 space-y-3 hover:border-foreground/20 transition-colors cursor-pointer">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <Target className="h-3.5 w-3.5" />
            Goal Health
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <StatBlock label="Total Goals" value={goalStats.total} />
            <StatBlock label="Completion Rate" value={`${goalStats.completionRate}%`} color="text-blue-400" />
            <StatBlock label="On Track" value={goalStats.onTrack} color="text-emerald-400" />
            <StatBlock label="At Risk" value={goalStats.healthAtRisk} color={goalStats.healthAtRisk > 0 ? "text-amber-400" : undefined} />
            <StatBlock label="Off Track" value={goalStats.offTrack} color={goalStats.offTrack > 0 ? "text-red-400" : undefined} />
            <StatBlock label="Completed" value={goalStats.completed} color="text-emerald-400" />
          </div>
          {goalStats.topAtRisk.length > 0 && (
            <div className="pt-2 border-t border-border space-y-1.5">
              <span className="text-[10px] text-muted-foreground font-medium uppercase">Top at-risk goals</span>
              {goalStats.topAtRisk.map((g) => (
                <div key={g.id} className="flex items-center gap-2 text-xs">
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full shrink-0",
                    g.healthStatus === "off_track" ? "bg-red-500" : "bg-amber-500",
                  )} />
                  <span className="truncate flex-1">{g.title}</span>
                  {g.healthScore != null && (
                    <span className="text-muted-foreground tabular-nums shrink-0">{g.healthScore}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Link>

      <div className="rounded-xl border border-border p-5 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <ClipboardList className="h-3.5 w-3.5" />
          Pending Decisions
        </h3>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Open hiring requests</span>
            <div className="flex items-center gap-2">
              <span className="font-medium tabular-nums">{pendingHiringCount}</span>
              {pendingHiringCount > 0 && (
                <Link to="/agents" className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2">
                  Review
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Pending approvals</span>
            <div className="flex items-center gap-2">
              <span className="font-medium tabular-nums">{pendingApprovalsCount}</span>
              {pendingApprovalsCount > 0 && (
                <Link to="/approvals/pending" className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2">
                  Review
                </Link>
              )}
            </div>
          </div>
          {pendingHiringCount === 0 && pendingApprovalsCount === 0 && (
            <p className="text-sm text-muted-foreground/80 pt-1">No pending decisions. All clear.</p>
          )}
        </div>
      </div>
    </div>
  );
}

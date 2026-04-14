import { Link } from "@/lib/router";
import { cn, formatCents } from "../../lib/utils";
import { LastUpdatedBadge } from "./LastUpdatedBadge";
import { EfficiencyMiniBar } from "./EfficiencyMiniBar";
import type { AgentPerfRow } from "../../pages/AgentPerformance";

interface ProjectActivityEntry {
  id: string;
  name: string;
  color: string;
  count: number;
  percent: number;
}

interface DashboardDataCosts {
  monthSpendCents: number;
}

export function SpendMetricsSection({
  todaySpendCents,
  dailyAvgCents,
  spendDeltaPercent,
  weekSpendCents,
  monthSpendCents,
  agentEfficiency,
  teamAvgCostPerTask,
  teamAvgCloseH,
  projectActivity,
  totalProjectIssues,
}: {
  todaySpendCents: number;
  dailyAvgCents: number;
  spendDeltaPercent: number;
  weekSpendCents: number;
  monthSpendCents: number;
  agentEfficiency: AgentPerfRow[];
  teamAvgCostPerTask: number | null;
  teamAvgCloseH: number | null;
  projectActivity: ProjectActivityEntry[];
  totalProjectIssues: number;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
      {/* Today's Spend */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Link to="/costs" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors no-underline">Today's Spend</Link>
          <LastUpdatedBadge dataUpdatedAt={Date.now()} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">{formatCents(todaySpendCents)}</span>
          <span className="text-sm text-muted-foreground">today</span>
        </div>
        <div className="space-y-1.5 text-sm text-muted-foreground tabular-nums">
          <div className="flex justify-between">
            <span>7-day avg</span>
            <span>{formatCents(dailyAvgCents)}/day</span>
          </div>
          {spendDeltaPercent !== 0 && (
            <div className="flex justify-between">
              <span>vs average</span>
              <span className={spendDeltaPercent > 20 ? "text-amber-400" : spendDeltaPercent < -20 ? "text-emerald-400" : ""}>
                {spendDeltaPercent > 0 ? "↑" : "↓"} {Math.abs(spendDeltaPercent)}%
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Week total</span>
            <span>{formatCents(weekSpendCents)}</span>
          </div>
          <div className="flex justify-between">
            <span>Month total</span>
            <span>{formatCents(monthSpendCents)}</span>
          </div>
        </div>
      </div>

      {/* Agent Efficiency */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">Agent Efficiency <LastUpdatedBadge dataUpdatedAt={Date.now()} /></h4>
          <Link to="/performance" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Details</Link>
        </div>
        {agentEfficiency.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agent cost data yet.</p>
        ) : (
          <>
            <div className="space-y-2">
              {agentEfficiency.map((a) => {
                const maxScore = 100;
                const barColor = a.ratingScore >= 80 ? "bg-emerald-500" : a.ratingScore >= 50 ? "bg-amber-500" : "bg-red-500";
                return (
                  <div key={a.agentId} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "inline-flex items-center justify-center h-5 w-5 rounded text-[10px] font-bold shrink-0",
                        a.rating === "A" ? "text-emerald-400 bg-emerald-500/10" :
                        a.rating === "B" ? "text-blue-400 bg-blue-500/10" :
                        a.rating === "C" ? "text-amber-400 bg-amber-500/10" :
                        a.rating === "D" ? "text-orange-400 bg-orange-500/10" :
                        "text-red-400 bg-red-500/10",
                      )}>
                        {a.rating}
                      </span>
                      <span className="text-sm truncate flex-1">{a.name}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{a.ratingScore}</span>
                    </div>
                    <EfficiencyMiniBar value={a.ratingScore} max={maxScore} color={barColor} />
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground tabular-nums">
                      <span>{a.costPerTask !== null ? `${formatCents(Math.round(a.costPerTask))}/task` : "-"}</span>
                      <span>{a.avgCloseH !== null ? `${a.avgCloseH.toFixed(1)}h avg` : "-"}</span>
                      <span>{a.tasksDone} done</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border/50 pt-2 space-y-1 text-sm text-muted-foreground tabular-nums">
              <div className="flex justify-between">
                <span>Team avg</span>
                <span>{teamAvgCostPerTask !== null ? `${formatCents(Math.round(teamAvgCostPerTask))}/task` : "-"}</span>
              </div>
              <div className="flex justify-between">
                <span>Avg close time</span>
                <span>{teamAvgCloseH !== null ? `${teamAvgCloseH.toFixed(1)}h` : "-"}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Project Activity */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project Activity</h4>
        {projectActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No project data yet.</p>
        ) : (
          <>
            <div className="space-y-2.5">
              {projectActivity.slice(0, 5).map((p) => (
                <div key={p.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="truncate">{p.name}</span>
                    </div>
                    <span className="text-muted-foreground shrink-0 tabular-nums">{p.percent}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{ width: `${p.percent}%`, backgroundColor: p.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border/50 pt-2 text-sm text-muted-foreground">
              {totalProjectIssues} issues across {projectActivity.length} projects
            </div>
          </>
        )}
      </div>
    </div>
  );
}

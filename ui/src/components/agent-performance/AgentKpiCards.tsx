import { ArrowDown, ArrowUp } from "lucide-react";
import { cn, formatCents, agentUrl } from "../../lib/utils";
import { Link } from "@/lib/router";
import { RATING_COLORS } from "../performance/ratingUtils";
import type { AgentPerfRow } from "../performance/ratingUtils";

interface AgentKpiCardsProps {
  sorted: AgentPerfRow[];
  prevScoreMap: Map<string, number>;
}

export function AgentKpiCards({ sorted, prevScoreMap }: AgentKpiCardsProps) {
  if (sorted.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {sorted.slice(0, 6).map((row) => {
        const successRate = row.tasksDone > 0 ? row.completionRate : null;
        const successColor = successRate !== null
          ? successRate >= 85 ? "text-emerald-400" : successRate >= 70 ? "text-amber-400" : "text-red-400"
          : "text-muted-foreground";
        const prev = prevScoreMap.get(row.agentId);
        const delta = prev !== undefined ? row.ratingScore - prev : null;
        return (
          <div key={row.agentId} className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className={cn(
                "inline-flex items-center justify-center h-7 w-7 rounded-lg border text-xs font-bold",
                RATING_COLORS[row.rating],
              )}>
                {row.rating}
              </span>
              <Link to={agentUrl({ id: row.agentId, urlKey: null, name: null })} className="no-underline text-inherit font-medium truncate">
                {row.name}
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Success</p>
                <p className={cn("text-lg font-bold tabular-nums", successColor)}>
                  {successRate !== null ? `${successRate}%` : "-"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">$/Task</p>
                <p className="text-lg font-bold tabular-nums text-muted-foreground">
                  {row.costPerTask !== null ? formatCents(Math.round(row.costPerTask)) : "-"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Score</p>
                <div className="flex items-center gap-1.5">
                  <p className="text-lg font-bold tabular-nums">{row.ratingScore}</p>
                  {delta !== null && delta !== 0 && (
                    delta > 0
                      ? <ArrowUp className="h-3 w-3 text-emerald-400" />
                      : <ArrowDown className="h-3 w-3 text-red-400" />
                  )}
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        row.ratingScore >= 80 ? "bg-emerald-500" : row.ratingScore >= 50 ? "bg-amber-500" : "bg-red-500",
                      )}
                      style={{ width: `${row.ratingScore}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

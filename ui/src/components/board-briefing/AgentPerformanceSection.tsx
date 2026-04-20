import { AlertTriangle, BarChart3 } from "lucide-react";
import { Link } from "../../lib/router";
import { AgentPerfSummaryRow } from "../briefing/BriefingCards";

interface PerfRow {
  agentId: string;
  name: string;
  rating: string;
  ratingScore: number;
  tasksDone: number;
  completionRate: number;
}

interface AgentPerformanceSectionProps {
  perfRows: PerfRow[];
  topPerformers: PerfRow[];
  bottomPerformers: PerfRow[];
}

export function AgentPerformanceSection({ perfRows, topPerformers, bottomPerformers }: AgentPerformanceSectionProps) {
  return (
    <div className="rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5" />
          Agent Performance Summary
        </h3>
        <Link to="/performance" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Full report
        </Link>
      </div>

      {perfRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No agent performance data yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Top Performers</h4>
            {topPerformers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <div className="space-y-1.5">
                {topPerformers.map((r) => (
                  <AgentPerfSummaryRow key={r.agentId} row={r} />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-medium text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              Concerns
            </h4>
            {bottomPerformers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <div className="space-y-1.5">
                {bottomPerformers.map((r) => (
                  <AgentPerfSummaryRow key={r.agentId} row={r} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

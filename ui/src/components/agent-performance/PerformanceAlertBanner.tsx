import { TrendingDown } from "lucide-react";
import type { AgentPerfRow } from "../performance/ratingUtils";

interface PerformanceAlertBannerProps {
  rows: AgentPerfRow[];
  prevScoreMap: Map<string, number>;
}

export function PerformanceAlertBanner({ rows, prevScoreMap }: PerformanceAlertBannerProps) {
  const bigDrops = rows.filter((r) => {
    const prev = prevScoreMap.get(r.agentId);
    return prev !== undefined && r.tasksDone > 0 && prev - r.ratingScore >= 15;
  });
  if (bigDrops.length === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/[0.04] px-4 py-3">
      <TrendingDown className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium">Significant rating changes detected</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {bigDrops.map((r) => {
            const prev = prevScoreMap.get(r.agentId) ?? 0;
            return `${r.name} dropped ${prev - r.ratingScore} points`;
          }).join("; ")}
        </p>
      </div>
    </div>
  );
}

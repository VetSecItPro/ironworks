import { Award, Medal } from "lucide-react";
import type { AgentPerfRow } from "../performance/ratingUtils";

interface LeaderboardHighlightsProps {
  topPerformer: AgentPerfRow | null;
  mostImproved: AgentPerfRow | null;
  prevScoreMap: Map<string, number>;
}

export function LeaderboardHighlights({ topPerformer, mostImproved, prevScoreMap }: LeaderboardHighlightsProps) {
  if (!topPerformer && !mostImproved) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {topPerformer && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5">
          <Award className="h-5 w-5 text-amber-400 shrink-0" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">Top Performer</div>
            <div className="text-sm font-medium">
              {topPerformer.name} <span className="text-muted-foreground">- Score {topPerformer.ratingScore}</span>
            </div>
          </div>
        </div>
      )}
      {mostImproved && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5">
          <Medal className="h-5 w-5 text-emerald-400 shrink-0" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">Most Improved</div>
            <div className="text-sm font-medium">
              {mostImproved.name}
              <span className="text-muted-foreground ml-1">
                - Score {mostImproved.ratingScore}
                {prevScoreMap.get(mostImproved.agentId) !== undefined && (
                  <span className="text-emerald-400 ml-1">
                    (+{mostImproved.ratingScore - (prevScoreMap.get(mostImproved.agentId) ?? 0)})
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

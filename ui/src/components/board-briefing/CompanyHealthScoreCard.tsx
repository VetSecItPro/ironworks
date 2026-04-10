import { cn } from "../../lib/utils";
import { Activity } from "lucide-react";
import { HealthBreakdownItem } from "../briefing/BriefingCards";
import type { CompanyHealthScore } from "../../api/executive";

interface CompanyHealthScoreCardProps {
  healthScore: CompanyHealthScore;
}

export function CompanyHealthScoreCard({ healthScore }: CompanyHealthScoreCardProps) {
  return (
    <div className="rounded-xl border border-border p-5 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Activity className="h-3.5 w-3.5" />
        Company Health Score
      </h3>
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-center">
          <span className={cn(
            "text-5xl font-bold tabular-nums",
            healthScore.score >= 80 ? "text-emerald-400" :
            healthScore.score >= 60 ? "text-blue-400" :
            healthScore.score >= 40 ? "text-amber-400" : "text-red-400",
          )}>
            {healthScore.score}
          </span>
          <span className="text-xs text-muted-foreground mt-1">out of 100</span>
        </div>
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <HealthBreakdownItem label="Agents" value={healthScore.breakdown.agentPerformance} />
          <HealthBreakdownItem label="Goals" value={healthScore.breakdown.goalCompletion} />
          <HealthBreakdownItem label="Budget" value={healthScore.breakdown.budgetHealth} />
          <HealthBreakdownItem label="SLA" value={healthScore.breakdown.slaCompliance} />
          <HealthBreakdownItem label="Risk" value={healthScore.breakdown.riskLevel} />
        </div>
      </div>
    </div>
  );
}

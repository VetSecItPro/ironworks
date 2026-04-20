import { Zap } from "lucide-react";
import { Link } from "@/lib/router";
import { formatCents } from "../../lib/utils";

interface ImpactMetrics {
  doneThisWeek: number;
  humanHoursEquiv: number;
  costPerTask: number;
  costPerHumanHour: number;
}

export function WorkforceImpactSection({
  impactMetrics,
  weekSpendCents,
  agentCount,
}: {
  impactMetrics: ImpactMetrics;
  weekSpendCents: number;
  agentCount: number;
}) {
  if (impactMetrics.doneThisWeek === 0 && weekSpendCents === 0) return null;

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
          AI Workforce Impact
        </h4>
        <Link to="/performance" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Details
        </Link>
      </div>
      <p className="text-sm text-foreground">
        Your {agentCount} agents completed <span className="font-semibold">{impactMetrics.doneThisWeek}</span> tasks
        this week
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-0.5">
          <p className="text-lg font-bold tabular-nums">{impactMetrics.humanHoursEquiv}h</p>
          <p className="text-[11px] text-muted-foreground">Human-hours equivalent</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-lg font-bold tabular-nums">{formatCents(weekSpendCents)}</p>
          <p className="text-[11px] text-muted-foreground">Total cost this week</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-lg font-bold tabular-nums">
            {impactMetrics.doneThisWeek > 0 ? formatCents(Math.round(impactMetrics.costPerTask)) : "-"}
          </p>
          <p className="text-[11px] text-muted-foreground">Cost per task</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-lg font-bold tabular-nums">
            {impactMetrics.humanHoursEquiv > 0 ? formatCents(Math.round(impactMetrics.costPerHumanHour)) : "-"}
          </p>
          <p className="text-[11px] text-muted-foreground">Cost per human-hour</p>
        </div>
      </div>
      {impactMetrics.humanHoursEquiv > 0 && (
        <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">
          Your AI workforce operates at{" "}
          <span className="font-medium text-foreground">
            {formatCents(Math.round(impactMetrics.costPerHumanHour))}/human-hour equivalent
          </span>
        </p>
      )}
    </div>
  );
}

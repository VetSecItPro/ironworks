import { Link } from "../../lib/router";
import { formatCents } from "../../lib/utils";

interface ExecutiveSummaryProps {
  companyName: string;
  totalAgents: number;
  fte: number;
  contractors: number;
  totalTasks: number;
  weekSpendCents: number;
  spendTrend: number;
  atRiskGoals: number;
  pendingHiringCount: number;
  pendingApprovalsCount: number;
}

export function ExecutiveSummary({
  companyName,
  totalAgents,
  fte,
  contractors,
  totalTasks,
  weekSpendCents,
  spendTrend,
  atRiskGoals,
  pendingHiringCount,
  pendingApprovalsCount,
}: ExecutiveSummaryProps) {
  return (
    <div className="rounded-xl border border-border p-5 bg-muted/10">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Executive Summary</h3>
      <p className="text-sm text-foreground leading-relaxed">
        {companyName} currently operates with{" "}
        <Link to="/org" className="text-blue-400 hover:underline font-medium">
          {totalAgents} agents
        </Link>{" "}
        ({fte} full-time, {contractors} contractors). Over the selected period, the team completed{" "}
        <Link to="/issues" className="text-blue-400 hover:underline font-medium">
          {totalTasks} tasks
        </Link>{" "}
        at a total cost of{" "}
        <Link to="/costs" className="text-blue-400 hover:underline font-medium">
          {formatCents(weekSpendCents)}
        </Link>{" "}
        this week ({spendTrend > 0 ? "up" : "down"} {formatCents(Math.abs(spendTrend))} from last week).
        {atRiskGoals > 0 &&
          ` There ${atRiskGoals === 1 ? "is" : "are"} ${atRiskGoals} goal${atRiskGoals === 1 ? "" : "s"} at risk requiring attention.`}
        {pendingHiringCount > 0 &&
          ` ${pendingHiringCount} hiring request${pendingHiringCount === 1 ? " is" : "s are"} pending review.`}
        {pendingApprovalsCount > 0 &&
          ` ${pendingApprovalsCount} approval${pendingApprovalsCount === 1 ? " awaits" : "s await"} decision.`}
      </p>
    </div>
  );
}

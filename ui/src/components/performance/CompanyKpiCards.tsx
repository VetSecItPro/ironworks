import { formatCents } from "../../lib/utils";
import { KpiCard } from "./PerformanceCharts";
import type { AgentPerfRow } from "./ratingUtils";

export function CompanyKpiCards({ rows }: { rows: AgentPerfRow[] }) {
  const activeRows = rows.filter((r) => r.tasksDone > 0);
  const totalDone = rows.reduce((s, r) => s + r.tasksDone, 0);
  const totalCancelled = rows.reduce(
    (s, r) =>
      s +
      (r.completionRate > 0 && r.tasksDone > 0
        ? Math.round((r.tasksDone * (100 - r.completionRate)) / r.completionRate)
        : 0),
    0,
  );
  const overallSuccessRate =
    totalDone + totalCancelled > 0 ? Math.round((totalDone / (totalDone + totalCancelled)) * 100) : 0;
  const totalSpend = rows.reduce((s, r) => s + r.totalSpendCents, 0);
  const avgCostPerTask = totalDone > 0 ? totalSpend / totalDone : 0;
  const avgPerfScore =
    activeRows.length > 0 ? Math.round(activeRows.reduce((s, r) => s + r.ratingScore, 0) / activeRows.length) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard
        label="Overall Success Rate"
        value={`${overallSuccessRate}%`}
        color={
          overallSuccessRate >= 85 ? "text-emerald-400" : overallSuccessRate >= 70 ? "text-amber-400" : "text-red-400"
        }
      />
      <KpiCard label="Avg Cost / Task" value={avgCostPerTask > 0 ? formatCents(Math.round(avgCostPerTask)) : "-"} />
      <KpiCard label="Avg Performance Score" value={avgPerfScore > 0 ? String(avgPerfScore) : "-"} />
      <KpiCard label="Tasks Completed" value={String(totalDone)} color="text-foreground" />
    </div>
  );
}

import { LineChart } from "lucide-react";
import { formatCents } from "../../lib/utils";
import { WeeklyLineChart, WeeklyBarChart } from "../briefing/BriefingCharts";

interface WeeklyTrendsSectionProps {
  spendTrendWeeks: Array<{ label: string; cost: number }>;
  issueTrendWeeks: Array<{ label: string; count: number }>;
}

export function WeeklyTrendsSection({ spendTrendWeeks, issueTrendWeeks }: WeeklyTrendsSectionProps) {
  return (
    <div className="rounded-xl border border-border p-5 space-y-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <LineChart className="h-3.5 w-3.5" />
        Trends (Last 8 Weeks)
      </h3>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Weekly Spend</p>
        <WeeklyLineChart
          data={spendTrendWeeks.map((w) => ({ label: w.label, value: w.cost }))}
          formatValue={(v) => formatCents(v)}
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Missions Completed per Week</p>
        <WeeklyBarChart
          data={issueTrendWeeks.map((w) => ({ label: w.label, value: w.count }))}
        />
      </div>
    </div>
  );
}

import { TrendingUp } from "lucide-react";
import { cn } from "../../lib/utils";
import type { GoalHealthStatus } from "@ironworksai/shared";
import type { GoalSnapshotDTO } from "../../api/goalSnapshots";

export const HEALTH_STATUS_COLORS: Record<string, string> = {
  on_track: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  at_risk: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  off_track: "bg-red-500/10 text-red-600 dark:text-red-400",
  achieved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  no_data: "bg-muted text-muted-foreground",
};

export const HEALTH_STATUS_LABELS: Record<string, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  off_track: "Off Track",
  achieved: "Achieved",
  no_data: "No Data",
};

export function GoalHealthBadge({ status }: { status: GoalHealthStatus | null }) {
  const key = status ?? "no_data";
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0", HEALTH_STATUS_COLORS[key] ?? HEALTH_STATUS_COLORS.no_data)}>
      {HEALTH_STATUS_LABELS[key] ?? "No Data"}
    </span>
  );
}

export function HealthTrendChart({ snapshots }: { snapshots: GoalSnapshotDTO[] }) {
  if (snapshots.length < 2) return null;

  // Sort chronologically
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime(),
  );

  const points = sorted
    .filter((s) => s.healthScore != null)
    .map((s) => ({
      date: new Date(s.snapshotDate),
      score: s.healthScore!,
    }));

  if (points.length < 2) return null;

  const minScore = Math.min(...points.map((p) => p.score));
  const maxScore = Math.max(...points.map((p) => p.score));
  const scoreRange = maxScore - minScore || 1;
  const minDate = points[0].date.getTime();
  const maxDate = points[points.length - 1].date.getTime();
  const dateRange = maxDate - minDate || 1;

  const svgWidth = 360;
  const svgHeight = 80;
  const padding = 8;
  const chartWidth = svgWidth - padding * 2;
  const chartHeight = svgHeight - padding * 2;

  const pathPoints = points.map((p) => ({
    x: padding + ((p.date.getTime() - minDate) / dateRange) * chartWidth,
    y: padding + chartHeight - ((p.score - minScore) / scoreRange) * chartHeight,
  }));

  const pathD = pathPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const startLabel = points[0].date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = points[points.length - 1].date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="rounded-xl border border-border p-4 space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5" />
        Health Trend (last 30 days)
      </h4>
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight + 16}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid */}
        <line x1={padding} y1={padding} x2={svgWidth - padding} y2={padding} className="stroke-muted/30" strokeWidth="0.5" />
        <line x1={padding} y1={padding + chartHeight / 2} x2={svgWidth - padding} y2={padding + chartHeight / 2} className="stroke-muted/30" strokeWidth="0.5" />
        <line x1={padding} y1={padding + chartHeight} x2={svgWidth - padding} y2={padding + chartHeight} className="stroke-muted/30" strokeWidth="0.5" />

        {/* Y labels */}
        <text x={2} y={padding + 3} className="fill-muted-foreground text-[7px]">{maxScore}</text>
        <text x={2} y={padding + chartHeight + 3} className="fill-muted-foreground text-[7px]">{minScore}</text>

        {/* Line */}
        <path d={pathD} fill="none" className="stroke-blue-500" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots */}
        {pathPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" className="fill-blue-500" />
        ))}

        {/* X labels */}
        <text x={padding} y={svgHeight + 12} className="fill-muted-foreground text-[7px]">{startLabel}</text>
        <text x={svgWidth - padding} y={svgHeight + 12} textAnchor="end" className="fill-muted-foreground text-[7px]">{endLabel}</text>
      </svg>
    </div>
  );
}

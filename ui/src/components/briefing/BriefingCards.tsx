import { cn } from "../../lib/utils";

export function StatBlock({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/30 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-bold tabular-nums", color)}>{value}</p>
    </div>
  );
}

export function DORAMetricBlock({
  label,
  value,
  tier,
  description,
}: {
  label: string;
  value: string;
  tier: "elite" | "high" | "medium" | "low";
  description: string;
}) {
  const tierColors: Record<string, string> = {
    elite: "text-emerald-400",
    high: "text-blue-400",
    medium: "text-amber-400",
    low: "text-red-400",
  };
  const tierLabels: Record<string, string> = {
    elite: "Elite",
    high: "High",
    medium: "Medium",
    low: "Low",
  };
  return (
    <div className="rounded-lg bg-muted/30 px-3 py-3 space-y-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("text-xl font-bold tabular-nums", tierColors[tier])}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{description}</p>
      <span
        className={cn(
          "inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded",
          tierColors[tier],
          "bg-current/10",
        )}
      >
        {tierLabels[tier]}
      </span>
    </div>
  );
}

export const RATING_COLORS: Record<string, string> = {
  A: "text-emerald-400 bg-emerald-500/10",
  B: "text-blue-400 bg-blue-500/10",
  C: "text-amber-400 bg-amber-500/10",
  D: "text-orange-400 bg-orange-500/10",
  F: "text-red-400 bg-red-500/10",
};

export function HealthBreakdownItem({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="text-center">
      <div
        className={cn(
          "text-lg font-bold tabular-nums",
          value >= 80
            ? "text-emerald-400"
            : value >= 60
              ? "text-blue-400"
              : value >= 40
                ? "text-amber-400"
                : "text-red-400",
        )}
      >
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

export function AgentPerfSummaryRow({
  row,
}: {
  row: {
    agentId: string;
    name: string;
    rating: string;
    ratingScore: number;
    tasksDone: number;
    completionRate: number;
  };
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-sm">
      <span
        className={cn(
          "inline-flex items-center justify-center h-6 w-6 rounded text-xs font-bold shrink-0",
          RATING_COLORS[row.rating] ?? "text-muted-foreground bg-muted",
        )}
      >
        {row.rating}
      </span>
      <span className="truncate flex-1 font-medium">{row.name}</span>
      <span className="text-muted-foreground tabular-nums shrink-0 text-xs">
        {row.tasksDone} tasks - {row.completionRate}%
      </span>
    </div>
  );
}

import { TrendingDown, TrendingUp, Wrench } from "lucide-react";
import type { TechDebt } from "../../api/executive";
import { cn } from "../../lib/utils";

interface TechDebtCardProps {
  techDebtData: TechDebt | undefined;
}

export function TechDebtCard({ techDebtData }: TechDebtCardProps) {
  return (
    <div className="rounded-xl border border-border p-5 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Wrench className="h-3.5 w-3.5" />
        Tech Debt
      </h3>
      {techDebtData ? (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-3xl font-bold tabular-nums",
                techDebtData.openCount > 10
                  ? "text-red-400"
                  : techDebtData.openCount > 5
                    ? "text-amber-400"
                    : "text-foreground",
              )}
            >
              {techDebtData.openCount}
            </span>
            <span className="text-sm text-muted-foreground">open items</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground tabular-nums">
            <div className="flex justify-between">
              <span>Last 30d</span>
              <span className="font-medium text-foreground">{techDebtData.createdLast30d}</span>
            </div>
            <div className="flex justify-between">
              <span>Trend</span>
              <span
                className={cn(
                  "flex items-center gap-1 font-medium",
                  techDebtData.trend > 0
                    ? "text-amber-400"
                    : techDebtData.trend < 0
                      ? "text-emerald-400"
                      : "text-foreground",
                )}
              >
                {techDebtData.trend > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : techDebtData.trend < 0 ? (
                  <TrendingDown className="h-3 w-3" />
                ) : null}
                {techDebtData.trend > 0 ? "+" : ""}
                {techDebtData.trend}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Loading tech debt data...</p>
      )}
    </div>
  );
}

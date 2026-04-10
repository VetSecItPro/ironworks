import { Link } from "../../lib/router";
import { cn, formatCents } from "../../lib/utils";
import { Users, DollarSign, TrendingUp, TrendingDown } from "lucide-react";

interface HeadcountCostCardsProps {
  headcount: { fte: number; contractor: number } | undefined;
  weekSpendCents: number;
  lastWeekEstimate: number;
  spendTrend: number;
  monthlyProjection: number;
}

export function HeadcountCostCards({
  headcount,
  weekSpendCents,
  lastWeekEstimate,
  spendTrend,
  monthlyProjection,
}: HeadcountCostCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Link to="/org" className="no-underline text-inherit block">
        <div className="rounded-xl border border-border p-5 space-y-3 hover:border-foreground/20 transition-colors cursor-pointer">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <Users className="h-3.5 w-3.5" />
            Headcount
          </h3>
          {headcount ? (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">{headcount.fte + headcount.contractor}</span>
                <span className="text-sm text-muted-foreground">total agents</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground tabular-nums">
                <div className="flex justify-between">
                  <span>Full-time</span>
                  <span className="font-medium text-foreground">{headcount.fte}</span>
                </div>
                <div className="flex justify-between">
                  <span>Contractors</span>
                  <span className="font-medium text-foreground">{headcount.contractor}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No headcount data.</p>
          )}
        </div>
      </Link>

      <Link to="/costs" className="no-underline text-inherit block">
        <div className="rounded-xl border border-border p-5 space-y-3 hover:border-foreground/20 transition-colors cursor-pointer">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5" />
            Cost Summary
          </h3>
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums">{formatCents(weekSpendCents)}</span>
              <span className="text-sm text-muted-foreground">this week</span>
            </div>
            <div className="space-y-1.5 text-sm text-muted-foreground tabular-nums">
              <div className="flex justify-between">
                <span>Last week (est.)</span>
                <span>{formatCents(lastWeekEstimate)}</span>
              </div>
              <div className="flex justify-between">
                <span>Trend</span>
                <span className={cn(
                  "flex items-center gap-1",
                  spendTrend > 0 ? "text-amber-400" : "text-emerald-400",
                )}>
                  {spendTrend > 0 ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" />
                  )}
                  {spendTrend > 0 ? "+" : ""}{formatCents(Math.abs(spendTrend))}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Monthly projection</span>
                <span className="font-medium text-foreground">{formatCents(monthlyProjection)}</span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

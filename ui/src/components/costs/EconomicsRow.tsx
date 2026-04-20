import { Flame, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCents } from "../../lib/utils";

interface UnitEconomics {
  current: { costPerIssue: number; costPerActiveHour: number; issuesDone: number; activeHours: number };
  costPerIssueTrend: number;
  costPerHourTrend: number;
}

interface BurnRate {
  monthlyRateCents: number;
  dailyRateCents: number;
  budgetCents: number;
  runwayDays: number | null;
  remainingCents: number;
}

interface CostAllocationRow {
  projectId: string;
  projectName: string;
  costCents: number;
  issueCount: number;
  costPerIssue: number;
}

export function EconomicsRow({
  unitEconomics,
  burnRateData,
  costAllocation,
}: {
  unitEconomics?: UnitEconomics | null;
  burnRateData?: BurnRate | null;
  costAllocation?: CostAllocationRow[] | null;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card>
        <CardHeader className="px-5 pt-5 pb-2">
          <CardTitle className="text-base">Unit Economics</CardTitle>
          <CardDescription>Cost efficiency per completed issue and active hour.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-5 pb-5 pt-2">
          {unitEconomics ? (
            <>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Cost / Issue</div>
                  <div className="text-2xl font-semibold tabular-nums mt-1">
                    {formatCents(unitEconomics.current.costPerIssue)}
                  </div>
                </div>
                <span
                  className={cn(
                    "flex items-center gap-1 text-xs font-medium",
                    unitEconomics.costPerIssueTrend > 0 ? "text-amber-400" : "text-emerald-400",
                  )}
                >
                  {unitEconomics.costPerIssueTrend > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {unitEconomics.costPerIssueTrend > 0 ? "+" : ""}
                  {formatCents(Math.abs(unitEconomics.costPerIssueTrend))} vs prior
                </span>
              </div>
              <div className="border-t border-border/50 pt-2 flex items-end justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Cost / Active Hour</div>
                  <div className="text-2xl font-semibold tabular-nums mt-1">
                    {formatCents(unitEconomics.current.costPerActiveHour)}
                  </div>
                </div>
                <span
                  className={cn(
                    "flex items-center gap-1 text-xs font-medium",
                    unitEconomics.costPerHourTrend > 0 ? "text-amber-400" : "text-emerald-400",
                  )}
                >
                  {unitEconomics.costPerHourTrend > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {unitEconomics.costPerHourTrend > 0 ? "+" : ""}
                  {formatCents(Math.abs(unitEconomics.costPerHourTrend))} vs prior
                </span>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums pt-1 border-t border-border/50">
                {unitEconomics.current.issuesDone} issues done - {unitEconomics.current.activeHours}h active
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-2">Loading...</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-5 pt-5 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-400" />
            Burn Rate
          </CardTitle>
          <CardDescription>Extrapolated from last 7 days of spend.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-5 pb-5 pt-2">
          {burnRateData ? (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Monthly rate</div>
                <div className="text-2xl font-semibold tabular-nums mt-1">
                  {formatCents(burnRateData.monthlyRateCents)}
                </div>
                <div className="text-xs text-muted-foreground">{formatCents(burnRateData.dailyRateCents)}/day</div>
              </div>
              {burnRateData.budgetCents > 0 && (
                <div className="border-t border-border/50 pt-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Runway</div>
                  <div
                    className={cn(
                      "text-2xl font-semibold tabular-nums mt-1",
                      burnRateData.runwayDays !== null && burnRateData.runwayDays < 7
                        ? "text-red-400"
                        : burnRateData.runwayDays !== null && burnRateData.runwayDays < 14
                          ? "text-amber-400"
                          : "text-emerald-400",
                    )}
                  >
                    {burnRateData.runwayDays !== null ? `${burnRateData.runwayDays}d` : "N/A"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatCents(burnRateData.remainingCents)} remaining of {formatCents(burnRateData.budgetCents)}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-2">Loading...</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-5 pt-5 pb-2">
          <CardTitle className="text-base">Cost Allocation</CardTitle>
          <CardDescription>Per-project cost breakdown with issue counts.</CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-2">
          {costAllocation && costAllocation.length > 0 ? (
            <div className="space-y-1">
              <div className="grid grid-cols-4 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/50">
                <span className="col-span-1">Project</span>
                <span className="text-right">Cost</span>
                <span className="text-right">Issues</span>
                <span className="text-right">$/Issue</span>
              </div>
              {costAllocation.slice(0, 8).map((row) => (
                <div key={row.projectId} className="grid grid-cols-4 gap-2 text-sm py-1">
                  <span className="truncate font-medium col-span-1">{row.projectName}</span>
                  <span className="text-right tabular-nums">{formatCents(row.costCents)}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{row.issueCount}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{formatCents(row.costPerIssue)}</span>
                </div>
              ))}
            </div>
          ) : costAllocation ? (
            <p className="text-sm text-muted-foreground py-2">No project costs this period.</p>
          ) : (
            <p className="text-sm text-muted-foreground py-2">Loading...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

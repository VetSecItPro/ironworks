import type { BudgetIncident, FinanceEvent } from "@ironworksai/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetIncidentCard } from "../BudgetIncidentCard";
import { cn, formatCents, formatTokens } from "../../lib/utils";
import type { CostByAgentModel } from "@ironworksai/shared";
import { ByAgentCard } from "./ByAgentCard";
import { ByProjectCard } from "./ByProjectCard";
import { FinanceBreakdownSection } from "./FinanceBreakdownSection";
import { EconomicsRow } from "./EconomicsRow";

interface SpendSummary {
  spendCents: number;
  budgetCents: number;
  utilizationPercent: number;
}

interface FinanceSummary {
  debitCents: number;
  creditCents: number;
  netCents: number;
  estimatedDebitCents: number;
  eventCount: number;
}

interface EquivalentSpend {
  billingMode: string;
  actualSpendCents: number;
  subscriptionEquivalentCents: number;
  totalEquivalentCents: number;
}

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

interface ByAgentRow {
  agentId: string;
  agentName?: string | null;
  agentStatus?: string | null;
  costCents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  apiRunCount: number;
  subscriptionRunCount: number;
}

interface ByProjectRow {
  projectId?: string | null;
  projectName?: string | null;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
}

export function OverviewTabContent({
  activeBudgetIncidents,
  incidentMutation,
  spendData,
  financeData,
  topFinanceEvents,
  equivalentSpend,
  unitEconomics,
  burnRateData,
  costAllocation,
  agentModelRows,
  expandedAgents,
  toggleAgent,
}: {
  activeBudgetIncidents: BudgetIncident[];
  incidentMutation: { isPending: boolean; mutate: (args: { incidentId: string; action: "keep_paused" | "raise_budget_and_resume"; amount?: number }) => void };
  spendData?: { summary: SpendSummary; byAgent: ByAgentRow[]; byProject: ByProjectRow[] } | null;
  financeData?: { summary: FinanceSummary; byBiller: Array<{ biller: string }>; byKind: Array<unknown> } | null;
  topFinanceEvents: FinanceEvent[];
  equivalentSpend?: EquivalentSpend | null;
  unitEconomics?: UnitEconomics | null;
  burnRateData?: BurnRate | null;
  costAllocation?: CostAllocationRow[] | null;
  agentModelRows: Map<string, CostByAgentModel[]>;
  expandedAgents: Set<string>;
  toggleAgent: (agentId: string) => void;
}) {
  const inferenceTokenTotal =
    (spendData?.byAgent ?? []).reduce(
      (sum, row) => sum + row.inputTokens + row.cachedInputTokens + row.outputTokens,
      0,
    );

  return (
    <>
      {activeBudgetIncidents.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {activeBudgetIncidents.slice(0, 2).map((incident) => (
            <BudgetIncidentCard
              key={incident.id}
              incident={incident}
              isMutating={incidentMutation.isPending}
              onKeepPaused={() => incidentMutation.mutate({ incidentId: incident.id, action: "keep_paused" })}
              onRaiseAndResume={(amount) =>
                incidentMutation.mutate({
                  incidentId: incident.id,
                  action: "raise_budget_and_resume",
                  amount,
                })}
            />
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Inference Ledger */}
        <Card>
          <CardHeader className="px-5 pt-5 pb-2">
            <CardTitle className="text-base">Inference Ledger</CardTitle>
            <CardDescription>Total API and subscription spend across all agent runs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-5 pb-5 pt-2">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-3xl font-semibold tabular-nums">
                  {formatCents(spendData?.summary.spendCents ?? 0)}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {spendData?.summary.budgetCents && spendData.summary.budgetCents > 0
                    ? `of ${formatCents(spendData.summary.budgetCents)} monthly budget`
                    : "No budget cap configured"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-semibold tabular-nums">
                  {formatTokens(inferenceTokenTotal)}
                </div>
                <div className="text-sm text-muted-foreground">tokens used</div>
              </div>
            </div>
            {spendData?.summary.budgetCents && spendData.summary.budgetCents > 0 ? (
              <div className="space-y-1.5">
                <div className="h-2 overflow-hidden bg-muted rounded-full">
                  <div
                    className={cn(
                      "h-full transition-[width,background-color] duration-150 rounded-full",
                      spendData.summary.utilizationPercent > 90
                        ? "bg-red-400"
                        : spendData.summary.utilizationPercent > 70
                          ? "bg-yellow-400"
                          : "bg-emerald-400",
                    )}
                    style={{ width: `${Math.min(100, spendData.summary.utilizationPercent)}%` }}
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  {spendData.summary.utilizationPercent}% of monthly budget consumed
                </div>
              </div>
            ) : null}
            {equivalentSpend && equivalentSpend.subscriptionEquivalentCents > 0 && (
              <div className="pt-2 border-t border-border space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">API spend (billed)</span>
                  <span className="font-mono font-medium">{formatCents(equivalentSpend.actualSpendCents)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subscription value (covered)</span>
                  <span className="font-mono font-medium text-blue-500">{formatCents(equivalentSpend.subscriptionEquivalentCents)}</span>
                </div>
                <div className="flex items-center justify-between text-sm pt-1 border-t border-border/50">
                  <span className="font-medium">Total compute value</span>
                  <span className="font-mono font-semibold">{formatCents(equivalentSpend.totalEquivalentCents)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Spend Forecast */}
        <Card>
          <CardHeader className="px-5 pt-5 pb-2">
            <CardTitle className="text-base">Spend Forecast</CardTitle>
            <CardDescription>Projected end-of-month spend based on current burn rate.</CardDescription>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-2 space-y-3">
            {(() => {
              const currentSpend = spendData?.summary.spendCents ?? 0;
              const budget = spendData?.summary.budgetCents ?? 0;
              const now = new Date();
              const daysElapsed = Math.max(1, now.getDate());
              const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
              const burnRate = currentSpend / daysElapsed;
              const projected = Math.round(burnRate * daysInMonth);
              const overBudget = budget > 0 && projected > budget;
              const pctElapsed = (daysElapsed / daysInMonth) * 100;

              return (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tabular-nums">{formatCents(projected)}</span>
                    <span className="text-sm text-muted-foreground">projected</span>
                  </div>
                  {budget > 0 && (
                    <div className={cn("text-sm", overBudget ? "text-red-400" : "text-emerald-400")}>
                      {overBudget ? `Over budget by ${formatCents(projected - budget)}` : `Under budget by ${formatCents(budget - projected)}`}
                    </div>
                  )}
                  <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="absolute top-0 bottom-0 left-0 bg-blue-500 rounded-l-full"
                      style={{ width: `${Math.min(100, budget > 0 ? (currentSpend / budget) * 100 : pctElapsed)}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 bg-blue-500/20 border-r-2 border-dashed border-blue-400"
                      style={{
                        left: `${Math.min(100, budget > 0 ? (currentSpend / budget) * 100 : pctElapsed)}%`,
                        width: `${Math.min(100 - (budget > 0 ? (currentSpend / budget) * 100 : pctElapsed), budget > 0 ? ((projected - currentSpend) / budget) * 100 : 100 - pctElapsed)}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{formatCents(currentSpend)} actual</span>
                    <span>{formatCents(burnRate)}/day burn rate</span>
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>

        {/* Finance Ledger */}
        <Card>
          <CardHeader className="px-5 pt-5 pb-2">
            <CardTitle className="text-base">Finance Ledger</CardTitle>
            <CardDescription>Account-level charges, credits, and platform fees.</CardDescription>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-border rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Debits</div>
                <div className="text-xl font-semibold tabular-nums mt-1">{formatCents(financeData?.summary.debitCents ?? 0)}</div>
              </div>
              <div className="border border-border rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Credits</div>
                <div className="text-xl font-semibold tabular-nums mt-1">{formatCents(financeData?.summary.creditCents ?? 0)}</div>
              </div>
              <div className="border border-border rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Net</div>
                <div className="text-xl font-semibold tabular-nums mt-1">{formatCents(financeData?.summary.netCents ?? 0)}</div>
              </div>
              <div className="border border-border rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Estimated</div>
                <div className="text-xl font-semibold tabular-nums mt-1">{formatCents(financeData?.summary.estimatedDebitCents ?? 0)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Events */}
        <Card>
          <CardHeader className="px-5 pt-5 pb-2">
            <CardTitle className="text-base">Recent Events</CardTitle>
            <CardDescription>Latest financial activity and charges.</CardDescription>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-2">
            {topFinanceEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No finance events yet.</p>
            ) : (
              <div className="space-y-2">
                {topFinanceEvents.slice(0, 5).map((event) => (
                  <div key={event.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{event.description ?? event.eventKind}</div>
                      <div className="text-[10px] text-muted-foreground">{event.biller}</div>
                    </div>
                    <span className={cn(
                      "font-mono text-sm shrink-0 ml-2",
                      event.direction === "credit" ? "text-emerald-500" : "",
                    )}>
                      {event.direction === "credit" ? "+" : "-"}{formatCents(event.amountCents)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <EconomicsRow
        unitEconomics={unitEconomics}
        burnRateData={burnRateData}
        costAllocation={costAllocation}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <ByAgentCard
          byAgent={spendData?.byAgent ?? []}
          agentModelRows={agentModelRows}
          expandedAgents={expandedAgents}
          toggleAgent={toggleAgent}
        />
        <ByProjectCard byProject={spendData?.byProject ?? []} />
      </div>

      {financeData && (
        <FinanceBreakdownSection
          financeData={financeData}
          topFinanceEvents={topFinanceEvents}
        />
      )}
    </>
  );
}

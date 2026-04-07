import { ArrowDownLeft, ArrowUpRight, CreditCard, DollarSign, Flame, TrendingDown, TrendingUp } from "lucide-react";
import type { BudgetIncident, FinanceEvent } from "@ironworksai/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetIncidentCard } from "../BudgetIncidentCard";
import { FinanceBillerCard } from "../FinanceBillerCard";
import { FinanceKindCard } from "../FinanceKindCard";
import { FinanceTimelineCard } from "../FinanceTimelineCard";
import { Identity } from "../Identity";
import { StatusBadge } from "../StatusBadge";
import { cn, formatCents, formatTokens, providerDisplayName, billingTypeDisplayName } from "../../lib/utils";
import type { CostByAgentModel } from "@ironworksai/shared";
import { ChevronDown, ChevronRight } from "lucide-react";

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

      {/* Unit Economics + Burn Rate + Cost Allocation */}
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
                  <span className={cn(
                    "flex items-center gap-1 text-xs font-medium",
                    unitEconomics.costPerIssueTrend > 0 ? "text-amber-400" : "text-emerald-400",
                  )}>
                    {unitEconomics.costPerIssueTrend > 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {unitEconomics.costPerIssueTrend > 0 ? "+" : ""}{formatCents(Math.abs(unitEconomics.costPerIssueTrend))} vs prior
                  </span>
                </div>
                <div className="border-t border-border/50 pt-2 flex items-end justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Cost / Active Hour</div>
                    <div className="text-2xl font-semibold tabular-nums mt-1">
                      {formatCents(unitEconomics.current.costPerActiveHour)}
                    </div>
                  </div>
                  <span className={cn(
                    "flex items-center gap-1 text-xs font-medium",
                    unitEconomics.costPerHourTrend > 0 ? "text-amber-400" : "text-emerald-400",
                  )}>
                    {unitEconomics.costPerHourTrend > 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {unitEconomics.costPerHourTrend > 0 ? "+" : ""}{formatCents(Math.abs(unitEconomics.costPerHourTrend))} vs prior
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
                  <div className="text-xs text-muted-foreground">
                    {formatCents(burnRateData.dailyRateCents)}/day
                  </div>
                </div>
                {burnRateData.budgetCents > 0 && (
                  <div className="border-t border-border/50 pt-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Runway</div>
                    <div className={cn(
                      "text-2xl font-semibold tabular-nums mt-1",
                      burnRateData.runwayDays !== null && burnRateData.runwayDays < 7 ? "text-red-400" :
                      burnRateData.runwayDays !== null && burnRateData.runwayDays < 14 ? "text-amber-400" : "text-emerald-400",
                    )}>
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

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="px-5 pt-5 pb-2">
            <CardTitle className="text-base">By Agent</CardTitle>
            <CardDescription>What each agent consumed in the selected period.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 px-5 pb-5 pt-2">
            {(spendData?.byAgent.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No cost events yet.</p>
            ) : (
              spendData?.byAgent.map((row) => {
                const modelRows = agentModelRows.get(row.agentId) ?? [];
                const isExpanded = expandedAgents.has(row.agentId);
                const hasBreakdown = modelRows.length > 0;
                return (
                  <div key={row.agentId} className="border border-border px-4 py-3">
                    <div
                      className={cn("flex items-start justify-between gap-3", hasBreakdown ? "cursor-pointer select-none" : "")}
                      onClick={() => hasBreakdown && toggleAgent(row.agentId)}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {hasBreakdown ? (
                          isExpanded
                            ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                            : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        ) : (
                          <span className="h-3 w-3 shrink-0" />
                        )}
                        <Identity name={row.agentName ?? row.agentId} size="sm" />
                        {row.agentStatus === "terminated" ? <StatusBadge status="terminated" /> : null}
                      </div>
                      <div className="text-right text-sm tabular-nums">
                        <div className="font-medium">{formatCents(row.costCents)}</div>
                        <div className="text-sm text-muted-foreground">
                          in {formatTokens(row.inputTokens + row.cachedInputTokens)} - out {formatTokens(row.outputTokens)}
                        </div>
                        {(row.apiRunCount > 0 || row.subscriptionRunCount > 0) ? (
                          <div className="text-sm text-muted-foreground">
                            {row.apiRunCount > 0 ? `${row.apiRunCount} api` : "0 api"}
                            {" - "}
                            {row.subscriptionRunCount > 0
                              ? `${row.subscriptionRunCount} subscription`
                              : "0 subscription"}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {isExpanded && modelRows.length > 0 ? (
                      <div className="mt-3 space-y-2 border-l border-border pl-4">
                        {modelRows.map((modelRow) => {
                          const sharePct = row.costCents > 0 ? Math.round((modelRow.costCents / row.costCents) * 100) : 0;
                          return (
                            <div
                              key={`${modelRow.provider}:${modelRow.model}:${modelRow.billingType}`}
                              className="flex items-start justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="truncate font-medium text-foreground">
                                  {providerDisplayName(modelRow.provider)}
                                  <span className="mx-1 text-border">/</span>
                                  <span className="font-mono">{modelRow.model}</span>
                                </div>
                                <div className="truncate text-muted-foreground">
                                  {providerDisplayName(modelRow.biller)} - {billingTypeDisplayName(modelRow.billingType)}
                                </div>
                              </div>
                              <div className="text-right tabular-nums">
                                <div className="font-medium">
                                  {formatCents(modelRow.costCents)}
                                  <span className="ml-1 font-normal text-muted-foreground">({sharePct}%)</span>
                                </div>
                                <div className="text-muted-foreground">
                                  {formatTokens(modelRow.inputTokens + modelRow.cachedInputTokens + modelRow.outputTokens)} tok
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="px-5 pt-5 pb-2">
            <CardTitle className="text-base">By Project</CardTitle>
            <CardDescription>Run costs attributed through project-linked issues.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 px-5 pb-5 pt-2 flex-1">
            {(spendData?.byProject.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No project-attributed run costs yet.</p>
            ) : (
              spendData?.byProject.map((row, index) => (
                <div
                  key={row.projectId ?? `unattributed-${index}`}
                  className="flex items-center justify-between gap-3 border border-border rounded-lg px-4 py-3 text-sm"
                >
                  <span className="truncate font-medium">{row.projectName ?? row.projectId ?? "Unattributed"}</span>
                  <div className="text-right shrink-0">
                    <div className="font-semibold tabular-nums">{formatCents(row.costCents)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatTokens(row.inputTokens + row.outputTokens)} tokens
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {financeData && (
        <div className="grid gap-4 xl:grid-cols-[1.2fr,0.95fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader className="px-5 pt-5 pb-2">
                <CardTitle className="text-base">By biller</CardTitle>
                <CardDescription>Account-level financial events grouped by who charged or credited them.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 px-5 pb-5 pt-2 md:grid-cols-2">
                {(financeData.byBiller.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No finance events yet.</p>
                ) : (
                  financeData.byBiller.map((row) => <FinanceBillerCard key={row.biller} row={row as Parameters<typeof FinanceBillerCard>[0]["row"]} />)
                )}
              </CardContent>
            </Card>
            <FinanceTimelineCard rows={topFinanceEvents} />
          </div>
          <FinanceKindCard rows={financeData.byKind as Parameters<typeof FinanceKindCard>[0]["rows"]} />
        </div>
      )}
    </>
  );
}

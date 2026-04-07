import { useEffect, useMemo, useRef, useState } from "react";
import { exportToCSV } from "../lib/exportCSV";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BudgetPolicySummary, CostByAgentModel, CostByBiller, CostByProviderModel, CostWindowSpendRow, FinanceEvent, QuotaWindow } from "@ironworksai/shared";
import { ArrowUpRight, Coins, CreditCard, DollarSign, Download, ReceiptText } from "lucide-react";
import { budgetsApi } from "../api/budgets";
import { costsApi } from "../api/costs";
import { executiveApi } from "../api/executive";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { useDateRange, PRESET_KEYS, PRESET_LABELS } from "../hooks/useDateRange";
import { queryKeys } from "../lib/queryKeys";
import { formatCents, formatTokens } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NewFinanceEventDialog } from "../components/NewFinanceEventDialog";
import { NewBudgetDialog } from "../components/NewBudgetDialog";
import { totalEquivalentSpendCents as totalEquivSpend } from "../lib/equivalent-spend";

/* ── Tab content components ── */
import { MetricTile } from "../components/costs/MetricTile";
import { OverviewTabContent } from "../components/costs/OverviewTabContent";
import { BudgetsTabContent } from "../components/costs/BudgetsTabContent";
import { ProvidersTabContent } from "../components/costs/ProvidersTabContent";
import { BillersTabContent } from "../components/costs/BillersTabContent";
import { FinanceTabContent } from "../components/costs/FinanceTabContent";
import { ProjectsTabContent } from "../components/costs/ProjectsTabContent";
import { TokensTabContent } from "../components/costs/TokensTabContent";
import { DepartmentsTabContent } from "../components/costs/DepartmentsTabContent";
import { AnalysisTabContent } from "../components/costs/AnalysisTabContent";
import { ProviderTabLabel, BillerTabLabel } from "../components/costs/ProviderBillerTabLabels";

const NO_COMPANY = "__none__";

function currentWeekRange(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon, 0, 0, 0, 0);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6, 23, 59, 59, 999);
  return { from: mon.toISOString(), to: sun.toISOString() };
}

export function Costs() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const [mainTab, setMainTab] = useState<"overview" | "budgets" | "providers" | "billers" | "finance" | "projects" | "tokens" | "departments" | "analysis">("overview");
  const [activeProvider, setActiveProvider] = useState("all");
  const [activeBiller, setActiveBiller] = useState("all");
  const [showNewFinanceEvent, setShowNewFinanceEvent] = useState(false);
  const [showNewBudget, setShowNewBudget] = useState(false);

  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, from, to, customReady } = useDateRange();

  useEffect(() => { setBreadcrumbs([{ label: "Costs" }]); }, [setBreadcrumbs]);

  const [today, setToday] = useState(() => new Date().toDateString());
  const todayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const schedule = () => {
      const now = new Date();
      const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
      todayTimerRef.current = setTimeout(() => { setToday(new Date().toDateString()); schedule(); }, ms);
    };
    schedule();
    return () => { if (todayTimerRef.current != null) clearTimeout(todayTimerRef.current); };
  }, []);

  const weekRange = useMemo(() => currentWeekRange(), [today]);
  const companyId = selectedCompanyId ?? NO_COMPANY;

  const { data: budgetData, isLoading: budgetLoading, error: budgetError } = useQuery({
    queryKey: queryKeys.budgets.overview(companyId),
    queryFn: () => budgetsApi.overview(companyId),
    enabled: !!selectedCompanyId && customReady,
    refetchInterval: 30_000,
    staleTime: 5_000,
  });

  const invalidateBudgetViews = () => {
    if (!selectedCompanyId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.budgets.overview(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(selectedCompanyId) });
  };

  const policyMutation = useMutation({
    mutationFn: (input: { scopeType: BudgetPolicySummary["scopeType"]; scopeId: string; amount: number; windowKind: BudgetPolicySummary["windowKind"] }) =>
      budgetsApi.upsertPolicy(companyId, { scopeType: input.scopeType, scopeId: input.scopeId, amount: input.amount, windowKind: input.windowKind }),
    onSuccess: invalidateBudgetViews,
  });

  const financeEventMutation = useMutation({
    mutationFn: (event: Parameters<typeof costsApi.createFinanceEvent>[1]) => costsApi.createFinanceEvent(companyId, event),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.financeSummary(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.financeByBiller(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.financeByKind(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.financeEvents(companyId) });
      setShowNewFinanceEvent(false);
    },
  });

  const incidentMutation = useMutation({
    mutationFn: (input: { incidentId: string; action: "keep_paused" | "raise_budget_and_resume"; amount?: number }) =>
      budgetsApi.resolveIncident(companyId, input.incidentId, input),
    onSuccess: invalidateBudgetViews,
  });

  const { data: spendData, isLoading: spendLoading, error: spendError } = useQuery({
    queryKey: queryKeys.costs(companyId, from || undefined, to || undefined),
    queryFn: async () => {
      const [summary, byAgent, byProject, byAgentModel] = await Promise.all([
        costsApi.summary(companyId, from || undefined, to || undefined),
        costsApi.byAgent(companyId, from || undefined, to || undefined),
        costsApi.byProject(companyId, from || undefined, to || undefined),
        costsApi.byAgentModel(companyId, from || undefined, to || undefined),
      ]);
      return { summary, byAgent, byProject, byAgentModel };
    },
    enabled: !!selectedCompanyId && customReady,
  });

  const { data: financeData, isLoading: financeLoading, error: financeError } = useQuery({
    queryKey: [
      queryKeys.financeSummary(companyId, from || undefined, to || undefined),
      queryKeys.financeByBiller(companyId, from || undefined, to || undefined),
      queryKeys.financeByKind(companyId, from || undefined, to || undefined),
      queryKeys.financeEvents(companyId, from || undefined, to || undefined, 18),
    ],
    queryFn: async () => {
      const [summary, byBiller, byKind, events] = await Promise.all([
        costsApi.financeSummary(companyId, from || undefined, to || undefined),
        costsApi.financeByBiller(companyId, from || undefined, to || undefined),
        costsApi.financeByKind(companyId, from || undefined, to || undefined),
        costsApi.financeEvents(companyId, from || undefined, to || undefined, 18),
      ]);
      return { summary, byBiller, byKind, events };
    },
    enabled: !!selectedCompanyId && customReady,
  });

  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  useEffect(() => { setExpandedAgents(new Set()); }, [companyId, from, to]);

  const { data: equivalentSpend } = useQuery({
    queryKey: ["equivalent-spend", companyId, from, to],
    queryFn: () => costsApi.equivalentSpend(companyId, from || undefined, to || undefined),
    enabled: !!selectedCompanyId && customReady,
  });

  const { data: projectDetailCosts } = useQuery({
    queryKey: ["project-detail-costs", companyId, from, to],
    queryFn: () => costsApi.byProjectDetail(companyId, from || undefined, to || undefined),
    enabled: !!selectedCompanyId && customReady && mainTab === "projects",
  });

  const { data: unitEconomics } = useQuery({
    queryKey: ["executive", "unit-economics", companyId],
    queryFn: () => executiveApi.unitEconomics(companyId),
    enabled: !!selectedCompanyId && mainTab === "overview",
    staleTime: 60_000,
  });

  const { data: burnRateData } = useQuery({
    queryKey: ["executive", "burn-rate", companyId],
    queryFn: () => executiveApi.burnRate(companyId),
    enabled: !!selectedCompanyId && mainTab === "overview",
    staleTime: 60_000,
  });

  const { data: costAllocation } = useQuery({
    queryKey: ["executive", "cost-allocation", companyId],
    queryFn: () => executiveApi.costAllocation(companyId),
    enabled: !!selectedCompanyId && mainTab === "overview",
    staleTime: 60_000,
  });

  const { data: budgetForecastData } = useQuery({
    queryKey: ["executive", "budget-forecast", companyId],
    queryFn: () => executiveApi.budgetForecast(companyId),
    enabled: !!selectedCompanyId && (mainTab === "overview" || mainTab === "analysis"),
    staleTime: 60_000,
  });

  const { data: deptBudgetVsActual } = useQuery({
    queryKey: ["executive", "dept-budget-vs-actual", companyId],
    queryFn: () => executiveApi.departmentBudgetVsActual(companyId),
    enabled: !!selectedCompanyId && mainTab === "analysis",
    staleTime: 60_000,
  });

  const { data: agentEfficiency } = useQuery({
    queryKey: ["executive", "agent-efficiency", companyId],
    queryFn: () => executiveApi.agentEfficiencyRankings(companyId),
    enabled: !!selectedCompanyId && mainTab === "analysis",
    staleTime: 60_000,
  });

  function toggleAgent(agentId: string) {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId); else next.add(agentId);
      return next;
    });
  }

  const agentModelRows = useMemo(() => {
    const map = new Map<string, CostByAgentModel[]>();
    for (const row of spendData?.byAgentModel ?? []) {
      const rows = map.get(row.agentId) ?? [];
      rows.push(row);
      map.set(row.agentId, rows);
    }
    for (const [agentId, rows] of map) {
      map.set(agentId, rows.slice().sort((a, b) => b.costCents - a.costCents));
    }
    return map;
  }, [spendData?.byAgentModel]);

  const { data: providerData } = useQuery({
    queryKey: queryKeys.usageByProvider(companyId, from || undefined, to || undefined),
    queryFn: () => costsApi.byProvider(companyId, from || undefined, to || undefined),
    enabled: !!selectedCompanyId && customReady && (mainTab === "providers" || mainTab === "billers"),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const { data: billerData } = useQuery({
    queryKey: queryKeys.usageByBiller(companyId, from || undefined, to || undefined),
    queryFn: () => costsApi.byBiller(companyId, from || undefined, to || undefined),
    enabled: !!selectedCompanyId && customReady && mainTab === "billers",
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const { data: weekData } = useQuery({
    queryKey: queryKeys.usageByProvider(companyId, weekRange.from, weekRange.to),
    queryFn: () => costsApi.byProvider(companyId, weekRange.from, weekRange.to),
    enabled: !!selectedCompanyId && (mainTab === "providers" || mainTab === "billers"),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const { data: weekBillerData } = useQuery({
    queryKey: queryKeys.usageByBiller(companyId, weekRange.from, weekRange.to),
    queryFn: () => costsApi.byBiller(companyId, weekRange.from, weekRange.to),
    enabled: !!selectedCompanyId && mainTab === "billers",
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const { data: windowData } = useQuery({
    queryKey: queryKeys.usageWindowSpend(companyId),
    queryFn: () => costsApi.windowSpend(companyId),
    enabled: !!selectedCompanyId && mainTab === "providers",
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const { data: quotaData, isLoading: quotaLoading } = useQuery({
    queryKey: queryKeys.usageQuotaWindows(companyId),
    queryFn: () => costsApi.quotaWindows(companyId),
    enabled: !!selectedCompanyId && mainTab === "providers",
    refetchInterval: 30_000,
    staleTime: 10_000,
    refetchOnMount: "always",
  });

  const { data: tokenAnalyticsData, isLoading: tokenAnalyticsLoading } = useQuery({
    queryKey: ["token-analytics", companyId],
    queryFn: () => executiveApi.tokenAnalytics(companyId),
    enabled: !!selectedCompanyId && mainTab === "tokens",
  });

  const { data: departmentSpendingData } = useQuery({
    queryKey: ["department-spending", companyId],
    queryFn: () => executiveApi.departmentSpending(companyId),
    enabled: !!selectedCompanyId && mainTab === "departments",
  });

  const byProvider = useMemo(() => {
    const map = new Map<string, CostByProviderModel[]>();
    for (const row of providerData ?? []) {
      const rows = map.get(row.provider) ?? [];
      rows.push(row);
      map.set(row.provider, rows);
    }
    return map;
  }, [providerData]);

  const byBiller = useMemo(() => {
    const map = new Map<string, CostByBiller[]>();
    for (const row of billerData ?? []) {
      const rows = map.get(row.biller) ?? [];
      rows.push(row);
      map.set(row.biller, rows);
    }
    return map;
  }, [billerData]);

  const weekSpendByProvider = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of weekData ?? []) map.set(row.provider, (map.get(row.provider) ?? 0) + row.costCents);
    return map;
  }, [weekData]);

  const weekSpendByBiller = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of weekBillerData ?? []) map.set(row.biller, (map.get(row.biller) ?? 0) + row.costCents);
    return map;
  }, [weekBillerData]);

  const windowSpendByProvider = useMemo(() => {
    const map = new Map<string, CostWindowSpendRow[]>();
    for (const row of windowData ?? []) {
      const rows = map.get(row.provider) ?? [];
      rows.push(row);
      map.set(row.provider, rows);
    }
    return map;
  }, [windowData]);

  const quotaWindowsByProvider = useMemo(() => {
    const map = new Map<string, QuotaWindow[]>();
    for (const result of quotaData ?? []) {
      if (result.ok && result.windows.length > 0) map.set(result.provider, result.windows);
    }
    return map;
  }, [quotaData]);

  const quotaErrorsByProvider = useMemo(() => {
    const map = new Map<string, string>();
    for (const result of quotaData ?? []) {
      if (!result.ok && result.error) map.set(result.provider, result.error);
    }
    return map;
  }, [quotaData]);

  const quotaSourcesByProvider = useMemo(() => {
    const map = new Map<string, string>();
    for (const result of quotaData ?? []) {
      if (typeof result.source === "string" && result.source.length > 0) map.set(result.provider, result.source);
    }
    return map;
  }, [quotaData]);

  const deficitNotchByProvider = useMemo(() => {
    const map = new Map<string, boolean>();
    if (preset !== "mtd") return map;
    const budget = spendData?.summary.budgetCents ?? 0;
    if (budget <= 0) return map;
    const totalSpend = spendData?.summary.spendCents ?? 0;
    const now = new Date();
    const daysElapsed = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (const [providerKey, rows] of byProvider) {
      const providerCostCents = rows.reduce((sum, row) => sum + row.costCents, 0);
      const providerShare = totalSpend > 0 ? providerCostCents / totalSpend : 0;
      const providerBudget = budget * providerShare;
      if (providerBudget <= 0) { map.set(providerKey, false); continue; }
      const burnRate = providerCostCents / Math.max(daysElapsed, 1);
      map.set(providerKey, providerCostCents + burnRate * (daysInMonth - daysElapsed) > providerBudget);
    }
    return map;
  }, [preset, spendData, byProvider]);

  const providers = useMemo(() => Array.from(byProvider.keys()), [byProvider]);
  const billers = useMemo(() => Array.from(byBiller.keys()), [byBiller]);

  const effectiveProvider = activeProvider === "all" || providers.includes(activeProvider) ? activeProvider : "all";
  useEffect(() => { if (effectiveProvider !== activeProvider) setActiveProvider("all"); }, [effectiveProvider, activeProvider]);

  const effectiveBiller = activeBiller === "all" || billers.includes(activeBiller) ? activeBiller : "all";
  useEffect(() => { if (effectiveBiller !== activeBiller) setActiveBiller("all"); }, [effectiveBiller, activeBiller]);

  const providerTabItems = useMemo(() => {
    const providerKeys = Array.from(byProvider.keys());
    const allTokens = providerKeys.reduce((sum, provider) => sum + (byProvider.get(provider)?.reduce((acc, row) => acc + row.inputTokens + row.cachedInputTokens + row.outputTokens, 0) ?? 0), 0);
    const allCents = providerKeys.reduce((sum, provider) => sum + (byProvider.get(provider)?.reduce((acc, row) => acc + row.costCents, 0) ?? 0), 0);
    const allEquiv = allCents === 0 && allTokens > 0
      ? providerKeys.reduce((sum, p) => {
          const pRows = byProvider.get(p) ?? [];
          return sum + totalEquivSpend(pRows.map((r) => ({ model: r.model, inputTokens: r.inputTokens, cachedInputTokens: r.cachedInputTokens, outputTokens: r.outputTokens })));
        }, 0)
      : 0;
    return [
      {
        value: "all",
        label: (
          <span className="flex items-center gap-1.5">
            <span>All providers</span>
            {providerKeys.length > 0 ? (
              <>
                <span className="font-mono text-xs text-muted-foreground">{formatTokens(allTokens)}</span>
                {allCents === 0 && allEquiv > 0 ? (
                  <span className="text-xs text-blue-500">~{formatCents(allEquiv)}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">{formatCents(allCents)}</span>
                )}
              </>
            ) : null}
          </span>
        ),
      },
      ...providerKeys.map((provider) => ({
        value: provider,
        label: <ProviderTabLabel provider={provider} rows={byProvider.get(provider) ?? []} />,
      })),
    ];
  }, [byProvider]);

  const billerTabItems = useMemo(() => {
    const billerKeys = Array.from(byBiller.keys());
    const allTokens = billerKeys.reduce((sum, biller) => sum + (byBiller.get(biller)?.reduce((acc, row) => acc + row.inputTokens + row.cachedInputTokens + row.outputTokens, 0) ?? 0), 0);
    const allCents = billerKeys.reduce((sum, biller) => sum + (byBiller.get(biller)?.reduce((acc, row) => acc + row.costCents, 0) ?? 0), 0);
    return [
      {
        value: "all",
        label: (
          <span className="flex items-center gap-1.5">
            <span>All billers</span>
            {billerKeys.length > 0 ? (
              <>
                <span className="font-mono text-xs text-muted-foreground">{formatTokens(allTokens)}</span>
                <span className="text-xs text-muted-foreground">{formatCents(allCents)}</span>
              </>
            ) : null}
          </span>
        ),
      },
      ...billerKeys.map((biller) => ({
        value: biller,
        label: <BillerTabLabel biller={biller} rows={byBiller.get(biller) ?? []} />,
      })),
    ];
  }, [byBiller]);

  const inferenceTokenTotal = (spendData?.byAgent ?? []).reduce((sum, row) => sum + row.inputTokens + row.cachedInputTokens + row.outputTokens, 0);
  const topFinanceEvents = (financeData?.events ?? []) as FinanceEvent[];
  const budgetPolicies = budgetData?.policies ?? [];
  const activeBudgetIncidents = budgetData?.activeIncidents ?? [];
  const budgetPoliciesByScope = useMemo(() => ({
    company: budgetPolicies.filter((policy) => policy.scopeType === "company"),
    agent: budgetPolicies.filter((policy) => policy.scopeType === "agent"),
    project: budgetPolicies.filter((policy) => policy.scopeType === "project"),
  }), [budgetPolicies]);

  if (!selectedCompanyId) {
    return <EmptyState icon={DollarSign} message="Select a company to view costs." />;
  }

  const showCustomPrompt = preset === "custom" && !customReady;
  const showOverviewLoading = spendLoading || financeLoading;
  const overviewError = spendError ?? financeError;

  return (
    <div className="space-y-6">
      <div className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Costs</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Inference spend, platform fees, credits, and live quota windows.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const rows = spendData?.byAgent ?? [];
                if (rows.length === 0) return;
                exportToCSV(
                  rows.map((r) => ({
                    agent: r.agentName || r.agentId,
                    cost: (r.costCents / 100).toFixed(2),
                    inputTokens: r.inputTokens,
                    outputTokens: r.outputTokens,
                    apiRuns: r.apiRunCount,
                  })),
                  "costs-export",
                  [
                    { key: "agent", label: "Agent" },
                    { key: "cost", label: "Cost ($)" },
                    { key: "inputTokens", label: "Input Tokens" },
                    { key: "outputTokens", label: "Output Tokens" },
                    { key: "apiRuns", label: "API Runs" },
                  ],
                );
              }}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
            {PRESET_KEYS.map((key) => (
              <Button key={key} variant={preset === key ? "secondary" : "ghost"} size="sm" onClick={() => setPreset(key)}>
                {PRESET_LABELS[key]}
              </Button>
            ))}
          </div>
        </div>

        {preset === "custom" ? (
          <div className="flex flex-wrap items-center gap-2 border border-border p-3">
            <input
              type="date"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            />
          </div>
        ) : null}

        {equivalentSpend && equivalentSpend.billingMode !== "none" && equivalentSpend.billingMode !== "api" && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-blue-500/20 bg-blue-500/5 text-sm">
            <CreditCard className="h-4 w-4 text-blue-500 shrink-0" />
            <span className="text-muted-foreground">
              {equivalentSpend.billingMode === "subscription" ? "Subscription covers all usage." : "Mixed billing."}{" "}
              <span className="font-medium text-foreground">
                Equivalent API spend: {formatCents(equivalentSpend.totalEquivalentCents)}
              </span>
            </span>
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-4">
          <MetricTile
            label="Inference spend"
            value={formatCents(spendData?.summary.spendCents ?? 0)}
            subtitle={`${formatTokens(inferenceTokenTotal)} tokens across request-scoped events`}
            icon={DollarSign}
            onClick={() => setMainTab("providers")}
          />
          <MetricTile
            label="Budget"
            value={activeBudgetIncidents.length > 0 ? String(activeBudgetIncidents.length) : (
              spendData?.summary.budgetCents && spendData.summary.budgetCents > 0
                ? `${spendData.summary.utilizationPercent}%`
                : "Open"
            )}
            subtitle={
              activeBudgetIncidents.length > 0
                ? `${budgetData?.pausedAgentCount ?? 0} agents paused - ${budgetData?.pausedProjectCount ?? 0} projects paused`
                : spendData?.summary.budgetCents && spendData.summary.budgetCents > 0
                  ? `${formatCents(spendData.summary.spendCents)} of ${formatCents(spendData.summary.budgetCents)}`
                  : "No monthly cap configured"
            }
            icon={Coins}
            onClick={() => setMainTab("budgets")}
          />
          <MetricTile
            label="Finance net"
            value={formatCents(financeData?.summary.netCents ?? 0)}
            subtitle={`${formatCents(financeData?.summary.debitCents ?? 0)} debits - ${formatCents(financeData?.summary.creditCents ?? 0)} credits`}
            icon={ReceiptText}
            onClick={() => setMainTab("finance")}
          />
          <MetricTile
            label="Finance events"
            value={String(financeData?.summary.eventCount ?? 0)}
            subtitle={`${formatCents(financeData?.summary.estimatedDebitCents ?? 0)} estimated in range`}
            icon={ArrowUpRight}
            onClick={() => setMainTab("finance")}
          />
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={(value) => setMainTab(value as typeof mainTab)}>
        <TabsList variant="line" className="justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="budgets">Budgets</TabsTrigger>
          <TabsTrigger value="providers">AI Providers</TabsTrigger>
          <TabsTrigger value="billers">Billers</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="tokens">Token Usage</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {showCustomPrompt ? (
            <p className="text-sm text-muted-foreground">Select a start and end date to load data.</p>
          ) : showOverviewLoading ? (
            <PageSkeleton variant="costs" />
          ) : overviewError ? (
            <p className="text-sm text-destructive">{(overviewError as Error).message}</p>
          ) : (
            <OverviewTabContent
              activeBudgetIncidents={activeBudgetIncidents}
              incidentMutation={incidentMutation}
              spendData={spendData}
              financeData={financeData}
              topFinanceEvents={topFinanceEvents}
              equivalentSpend={equivalentSpend}
              unitEconomics={unitEconomics}
              burnRateData={burnRateData}
              costAllocation={costAllocation}
              agentModelRows={agentModelRows}
              expandedAgents={expandedAgents}
              toggleAgent={toggleAgent}
            />
          )}
        </TabsContent>

        <TabsContent value="budgets" className="mt-4 space-y-4">
          <BudgetsTabContent
            budgetData={budgetData}
            budgetLoading={budgetLoading}
            budgetError={budgetError as Error | null}
            showNewBudget={showNewBudget}
            setShowNewBudget={setShowNewBudget}
            policyMutation={policyMutation}
            incidentMutation={incidentMutation}
            activeBudgetIncidents={activeBudgetIncidents}
            budgetPoliciesByScope={budgetPoliciesByScope}
          />
        </TabsContent>

        <TabsContent value="providers" className="mt-4 space-y-4">
          <ProvidersTabContent
            showCustomPrompt={showCustomPrompt}
            effectiveProvider={effectiveProvider}
            setActiveProvider={setActiveProvider}
            providerTabItems={providerTabItems}
            providers={providers}
            byProvider={byProvider}
            spendData={spendData}
            weekSpendByProvider={weekSpendByProvider}
            windowSpendByProvider={windowSpendByProvider}
            deficitNotchByProvider={deficitNotchByProvider}
            quotaWindowsByProvider={quotaWindowsByProvider}
            quotaErrorsByProvider={quotaErrorsByProvider}
            quotaSourcesByProvider={quotaSourcesByProvider}
            quotaLoading={quotaLoading}
          />
        </TabsContent>

        <TabsContent value="billers" className="mt-4 space-y-4">
          <BillersTabContent
            showCustomPrompt={showCustomPrompt}
            effectiveBiller={effectiveBiller}
            setActiveBiller={setActiveBiller}
            billerTabItems={billerTabItems}
            billers={billers}
            byBiller={byBiller}
            weekSpendByBiller={weekSpendByBiller}
            spendData={spendData}
            providerData={providerData}
          />
        </TabsContent>

        <TabsContent value="finance" className="mt-4 space-y-4">
          <FinanceTabContent
            showNewFinanceEvent={showNewFinanceEvent}
            setShowNewFinanceEvent={setShowNewFinanceEvent}
            financeEventMutation={financeEventMutation}
            showCustomPrompt={showCustomPrompt}
            financeLoading={financeLoading}
            financeError={financeError as Error | null}
            financeData={financeData}
            topFinanceEvents={topFinanceEvents}
          />
        </TabsContent>

        <TabsContent value="projects" className="mt-4 space-y-4">
          <ProjectsTabContent
            equivalentSpend={equivalentSpend}
            projectDetailCosts={projectDetailCosts}
            companyId={companyId}
            from={from}
            to={to}
          />
        </TabsContent>

        <TabsContent value="tokens" className="mt-4 space-y-4">
          <TokensTabContent
            tokenAnalyticsLoading={tokenAnalyticsLoading}
            tokenAnalyticsData={tokenAnalyticsData}
          />
        </TabsContent>

        <TabsContent value="departments" className="mt-4 space-y-4">
          <DepartmentsTabContent
            departmentSpendingData={departmentSpendingData}
          />
        </TabsContent>

        <TabsContent value="analysis" className="mt-4 space-y-4">
          <AnalysisTabContent
            budgetForecastData={budgetForecastData}
            costAllocation={costAllocation}
            deptBudgetVsActual={deptBudgetVsActual}
            agentEfficiency={agentEfficiency}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

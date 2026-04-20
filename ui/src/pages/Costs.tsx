import type { CostByAgentModel, FinanceEvent } from "@ironworksai/shared";
import { useQuery } from "@tanstack/react-query";
import { DollarSign } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { budgetsApi } from "../api/budgets";
import { costsApi } from "../api/costs";
import { executiveApi } from "../api/executive";
import { AnalysisTabContent } from "../components/costs/AnalysisTabContent";
import { BillersTabContent } from "../components/costs/BillersTabContent";
import { BudgetsTabContent } from "../components/costs/BudgetsTabContent";
import { CostsHeader } from "../components/costs/CostsHeader";
import { DepartmentsTabContent } from "../components/costs/DepartmentsTabContent";
import { FinanceTabContent } from "../components/costs/FinanceTabContent";
import { OverviewTabContent } from "../components/costs/OverviewTabContent";
import { ProjectsTabContent } from "../components/costs/ProjectsTabContent";
import { ProvidersTabContent } from "../components/costs/ProvidersTabContent";
import { TokensTabContent } from "../components/costs/TokensTabContent";
import { useCostsDerivedData } from "../components/costs/useCostsDerivedData";
import { useCostsMutations } from "../components/costs/useCostsMutations";
import { useProviderBillerTabs } from "../components/costs/useProviderBillerTabs";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { useDateRange } from "../hooks/useDateRange";
import { queryKeys } from "../lib/queryKeys";

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

  const [mainTab, setMainTab] = useState<
    "overview" | "budgets" | "providers" | "billers" | "finance" | "projects" | "tokens" | "departments" | "analysis"
  >("overview");
  const [showNewFinanceEvent, setShowNewFinanceEvent] = useState(false);
  const [showNewBudget, setShowNewBudget] = useState(false);

  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, from, to, customReady } = useDateRange();

  useEffect(() => {
    setBreadcrumbs([{ label: "Costs" }]);
  }, [setBreadcrumbs]);

  const [today, setToday] = useState(() => new Date().toDateString());
  const todayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const schedule = () => {
      const now = new Date();
      const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
      todayTimerRef.current = setTimeout(() => {
        setToday(new Date().toDateString());
        schedule();
      }, ms);
    };
    schedule();
    return () => {
      if (todayTimerRef.current != null) clearTimeout(todayTimerRef.current);
    };
  }, []);

  const weekRange = useMemo(() => currentWeekRange(), [today]);
  const companyId = selectedCompanyId ?? NO_COMPANY;

  const f = from || undefined;
  const t = to || undefined;
  const ok = !!selectedCompanyId;

  const {
    data: budgetData,
    isLoading: budgetLoading,
    error: budgetError,
  } = useQuery({
    queryKey: queryKeys.budgets.overview(companyId),
    queryFn: () => budgetsApi.overview(companyId),
    enabled: ok && customReady,
    refetchInterval: 30_000,
    staleTime: 5_000,
  });
  const {
    data: spendData,
    isLoading: spendLoading,
    error: spendError,
  } = useQuery({
    queryKey: queryKeys.costs(companyId, f, t),
    queryFn: async () => {
      const [summary, byAgent, byProject, byAgentModel] = await Promise.all([
        costsApi.summary(companyId, f, t),
        costsApi.byAgent(companyId, f, t),
        costsApi.byProject(companyId, f, t),
        costsApi.byAgentModel(companyId, f, t),
      ]);
      return { summary, byAgent, byProject, byAgentModel };
    },
    enabled: ok && customReady,
  });
  const {
    data: financeData,
    isLoading: financeLoading,
    error: financeError,
  } = useQuery({
    queryKey: [
      queryKeys.financeSummary(companyId, f, t),
      queryKeys.financeByBiller(companyId, f, t),
      queryKeys.financeByKind(companyId, f, t),
      queryKeys.financeEvents(companyId, f, t, 18),
    ],
    queryFn: async () => {
      const [summary, byBiller, byKind, events] = await Promise.all([
        costsApi.financeSummary(companyId, f, t),
        costsApi.financeByBiller(companyId, f, t),
        costsApi.financeByKind(companyId, f, t),
        costsApi.financeEvents(companyId, f, t, 18),
      ]);
      return { summary, byBiller, byKind, events };
    },
    enabled: ok && customReady,
  });
  const { data: equivalentSpend } = useQuery({
    queryKey: ["equivalent-spend", companyId, from, to],
    queryFn: () => costsApi.equivalentSpend(companyId, f, t),
    enabled: ok && customReady,
  });
  const { data: projectDetailCosts } = useQuery({
    queryKey: ["project-detail-costs", companyId, from, to],
    queryFn: () => costsApi.byProjectDetail(companyId, f, t),
    enabled: ok && customReady && mainTab === "projects",
  });
  const { data: unitEconomics } = useQuery({
    queryKey: ["executive", "unit-economics", companyId],
    queryFn: () => executiveApi.unitEconomics(companyId),
    enabled: ok && mainTab === "overview",
    staleTime: 60_000,
  });
  const { data: burnRateData } = useQuery({
    queryKey: ["executive", "burn-rate", companyId],
    queryFn: () => executiveApi.burnRate(companyId),
    enabled: ok && mainTab === "overview",
    staleTime: 60_000,
  });
  const { data: costAllocation } = useQuery({
    queryKey: ["executive", "cost-allocation", companyId],
    queryFn: () => executiveApi.costAllocation(companyId),
    enabled: ok && mainTab === "overview",
    staleTime: 60_000,
  });
  const { data: budgetForecastData } = useQuery({
    queryKey: ["executive", "budget-forecast", companyId],
    queryFn: () => executiveApi.budgetForecast(companyId),
    enabled: ok && (mainTab === "overview" || mainTab === "analysis"),
    staleTime: 60_000,
  });
  const { data: deptBudgetVsActual } = useQuery({
    queryKey: ["executive", "dept-budget-vs-actual", companyId],
    queryFn: () => executiveApi.departmentBudgetVsActual(companyId),
    enabled: ok && mainTab === "analysis",
    staleTime: 60_000,
  });
  const { data: agentEfficiency } = useQuery({
    queryKey: ["executive", "agent-efficiency", companyId],
    queryFn: () => executiveApi.agentEfficiencyRankings(companyId),
    enabled: ok && mainTab === "analysis",
    staleTime: 60_000,
  });
  const { data: providerData } = useQuery({
    queryKey: queryKeys.usageByProvider(companyId, f, t),
    queryFn: () => costsApi.byProvider(companyId, f, t),
    enabled: ok && customReady && (mainTab === "providers" || mainTab === "billers"),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  const { data: billerData } = useQuery({
    queryKey: queryKeys.usageByBiller(companyId, f, t),
    queryFn: () => costsApi.byBiller(companyId, f, t),
    enabled: ok && customReady && mainTab === "billers",
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  const { data: weekData } = useQuery({
    queryKey: queryKeys.usageByProvider(companyId, weekRange.from, weekRange.to),
    queryFn: () => costsApi.byProvider(companyId, weekRange.from, weekRange.to),
    enabled: ok && (mainTab === "providers" || mainTab === "billers"),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  const { data: weekBillerData } = useQuery({
    queryKey: queryKeys.usageByBiller(companyId, weekRange.from, weekRange.to),
    queryFn: () => costsApi.byBiller(companyId, weekRange.from, weekRange.to),
    enabled: ok && mainTab === "billers",
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  const { data: windowData } = useQuery({
    queryKey: queryKeys.usageWindowSpend(companyId),
    queryFn: () => costsApi.windowSpend(companyId),
    enabled: ok && mainTab === "providers",
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  const { data: quotaData, isLoading: quotaLoading } = useQuery({
    queryKey: queryKeys.usageQuotaWindows(companyId),
    queryFn: () => costsApi.quotaWindows(companyId),
    enabled: ok && mainTab === "providers",
    refetchInterval: 30_000,
    staleTime: 10_000,
    refetchOnMount: "always",
  });
  const { data: tokenAnalyticsData, isLoading: tokenAnalyticsLoading } = useQuery({
    queryKey: ["token-analytics", companyId],
    queryFn: () => executiveApi.tokenAnalytics(companyId),
    enabled: ok && mainTab === "tokens",
  });
  const { data: departmentSpendingData } = useQuery({
    queryKey: ["department-spending", companyId],
    queryFn: () => executiveApi.departmentSpending(companyId),
    enabled: ok && mainTab === "departments",
  });

  /* ── Mutations ── */

  const { policyMutation, financeEventMutation, incidentMutation } = useCostsMutations({
    selectedCompanyId,
    companyId,
    onFinanceEventSuccess: () => setShowNewFinanceEvent(false),
  });

  /* ── Derived data ── */

  const derived = useCostsDerivedData({
    providerData,
    billerData,
    weekData,
    weekBillerData,
    windowData,
    quotaData,
    preset,
    spendData,
  });

  const { providerTabItems, billerTabItems } = useProviderBillerTabs(derived.byProvider, derived.byBiller);

  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  useEffect(() => {
    setExpandedAgents(new Set());
  }, [companyId, from, to]);

  function toggleAgent(agentId: string) {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
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
    for (const [, rows] of map) {
      rows.sort((a, b) => b.costCents - a.costCents);
    }
    return map;
  }, [spendData?.byAgentModel]);

  const inferenceTokenTotal = (spendData?.byAgent ?? []).reduce(
    (sum, row) => sum + row.inputTokens + row.cachedInputTokens + row.outputTokens,
    0,
  );
  const topFinanceEvents = (financeData?.events ?? []) as FinanceEvent[];
  const budgetPolicies = budgetData?.policies ?? [];
  const activeBudgetIncidents = budgetData?.activeIncidents ?? [];
  const budgetPoliciesByScope = useMemo(
    () => ({
      company: budgetPolicies.filter((p) => p.scopeType === "company"),
      agent: budgetPolicies.filter((p) => p.scopeType === "agent"),
      project: budgetPolicies.filter((p) => p.scopeType === "project"),
    }),
    [budgetPolicies],
  );

  if (!selectedCompanyId) {
    return <EmptyState icon={DollarSign} message="Select a company to view costs." />;
  }

  const showCustomPrompt = preset === "custom" && !customReady;
  const showOverviewLoading = spendLoading || financeLoading;
  const overviewError = spendError ?? financeError;

  return (
    <div className="space-y-6">
      <CostsHeader
        preset={preset}
        setPreset={setPreset}
        customFrom={customFrom}
        setCustomFrom={setCustomFrom}
        customTo={customTo}
        setCustomTo={setCustomTo}
        spendData={spendData}
        financeData={financeData}
        equivalentSpend={equivalentSpend}
        budgetData={budgetData}
        activeBudgetIncidents={activeBudgetIncidents}
        inferenceTokenTotal={inferenceTokenTotal}
        setMainTab={setMainTab}
      />

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
            effectiveProvider={derived.effectiveProvider}
            setActiveProvider={derived.setActiveProvider}
            providerTabItems={providerTabItems}
            providers={derived.providers}
            byProvider={derived.byProvider}
            spendData={spendData}
            weekSpendByProvider={derived.weekSpendByProvider}
            windowSpendByProvider={derived.windowSpendByProvider}
            deficitNotchByProvider={derived.deficitNotchByProvider}
            quotaWindowsByProvider={derived.quotaWindowsByProvider}
            quotaErrorsByProvider={derived.quotaErrorsByProvider}
            quotaSourcesByProvider={derived.quotaSourcesByProvider}
            quotaLoading={quotaLoading}
          />
        </TabsContent>

        <TabsContent value="billers" className="mt-4 space-y-4">
          <BillersTabContent
            showCustomPrompt={showCustomPrompt}
            effectiveBiller={derived.effectiveBiller}
            setActiveBiller={derived.setActiveBiller}
            billerTabItems={billerTabItems}
            billers={derived.billers}
            byBiller={derived.byBiller}
            weekSpendByBiller={derived.weekSpendByBiller}
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
          <TokensTabContent tokenAnalyticsLoading={tokenAnalyticsLoading} tokenAnalyticsData={tokenAnalyticsData} />
        </TabsContent>

        <TabsContent value="departments" className="mt-4 space-y-4">
          <DepartmentsTabContent departmentSpendingData={departmentSpendingData} />
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

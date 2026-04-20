import type { Agent } from "@ironworksai/shared";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { activityApi } from "../api/activity";
import { agentsApi } from "../api/agents";
import { approvalsApi } from "../api/approvals";
import { channelsApi } from "../api/channels";
import { costsApi } from "../api/costs";
import { executiveApi } from "../api/executive";
import { goalProgressApi } from "../api/goalProgress";
import { goalsApi } from "../api/goals";
import { hiringApi } from "../api/hiring";
import { issuesApi } from "../api/issues";
import {
  AgentPerformanceSection,
  BriefingHeader,
  CMOCampaignSection,
  CompanyHealthScoreCard,
  DepartmentImpactSection,
  EngineeringMetricsSection,
  ExecutiveSummary,
  ExpertiseMapSection,
  GoalsPendingCards,
  HeadcountCostCards,
  HumanOverrideSection,
  PermissionMatrixSection,
  RecentActivitySection,
  RiskSummarySection,
  SlaComplianceCard,
  TechDebtCard,
  WeeklyTrendsSection,
} from "../components/board-briefing";
import { CapacityPlanning } from "../components/CapacityPlanning";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { computeAgentPerformance } from "./AgentPerformance";

type BriefingPeriod = "7d" | "30d" | "this_month";

export function BoardBriefing() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [period, setPeriod] = useState<BriefingPeriod>("30d");

  useEffect(() => {
    setBreadcrumbs([{ label: "Board Briefing" }]);
  }, [setBreadcrumbs]);

  // -- Data fetching --
  const { data: headcount, isLoading: headcountLoading } = useQuery({
    queryKey: queryKeys.headcount(selectedCompanyId!),
    queryFn: () => agentsApi.headcount(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const { data: windowSpend } = useQuery({
    queryKey: queryKeys.usageWindowSpend(selectedCompanyId!),
    queryFn: () => costsApi.windowSpend(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const { data: goalsProgress } = useQuery({
    queryKey: ["goals", "progress", selectedCompanyId!],
    queryFn: () => goalProgressApi.batch(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const { data: allGoals } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const { data: hiringRequests } = useQuery({
    queryKey: queryKeys.hiring.list(selectedCompanyId!),
    queryFn: () => hiringApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const { data: approvals } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!, "pending"),
    queryFn: () => approvalsApi.list(selectedCompanyId!, "pending"),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: costsByAgent } = useQuery({
    queryKey: [...queryKeys.costs(selectedCompanyId!), "by-agent"],
    queryFn: () => costsApi.byAgent(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: slaData } = useQuery({
    queryKey: ["executive", "sla", selectedCompanyId!],
    queryFn: () => executiveApi.slaCompliance(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });

  const { data: techDebtData } = useQuery({
    queryKey: ["executive", "tech-debt", selectedCompanyId!],
    queryFn: () => executiveApi.techDebt(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });

  const { data: riskData } = useQuery({
    queryKey: ["executive", "risk-register", selectedCompanyId!],
    queryFn: () => executiveApi.riskRegister(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });

  const { data: healthScore } = useQuery({
    queryKey: ["executive", "health-score", selectedCompanyId!],
    queryFn: () => executiveApi.healthScore(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });

  const { data: permissionMatrix } = useQuery({
    queryKey: ["executive", "permission-matrix", selectedCompanyId!],
    queryFn: () => executiveApi.permissionMatrix(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });

  const { data: doraMetrics } = useQuery({
    queryKey: ["executive", "dora-metrics", selectedCompanyId!],
    queryFn: () => executiveApi.doraMetrics(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });

  const { data: departmentImpactData } = useQuery({
    queryKey: ["executive", "department-impact", selectedCompanyId!],
    queryFn: () => executiveApi.departmentImpact(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });

  const { data: humanOverrideData } = useQuery({
    queryKey: ["executive", "human-override-rate", selectedCompanyId!],
    queryFn: () => executiveApi.humanOverrideRate(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });

  const { data: expertiseMap } = useQuery({
    queryKey: queryKeys.channels.expertiseMap(selectedCompanyId!),
    queryFn: () => channelsApi.expertiseMap(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 120_000,
  });

  // -- Derived data --

  const weekSpendCents = useMemo(() => {
    if (!windowSpend) return 0;
    return windowSpend.filter((r) => r.window === "7d").reduce((sum, r) => sum + r.costCents, 0);
  }, [windowSpend]);

  const monthSpendCents = useMemo(() => {
    if (!windowSpend) return 0;
    return windowSpend.filter((r) => r.window === "30d").reduce((sum, r) => sum + r.costCents, 0);
  }, [windowSpend]);

  const lastWeekEstimate = useMemo(() => {
    if (monthSpendCents <= weekSpendCents) return 0;
    return Math.round((monthSpendCents - weekSpendCents) / 3);
  }, [monthSpendCents, weekSpendCents]);

  const spendTrend = weekSpendCents - lastWeekEstimate;
  const monthlyProjection = Math.round(weekSpendCents * 4.33);

  const goalStats = useMemo(() => {
    const progressList = goalsProgress ?? [];
    const goalsList = allGoals ?? [];
    const total = progressList.length;
    const completed = progressList.filter((g) => g.progressPercent === 100).length;
    const inProgress = progressList.filter((g) => g.progressPercent > 0 && g.progressPercent < 100).length;
    const atRisk = progressList.filter((g) => g.blockedIssues > 0).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    let onTrack = 0;
    let healthAtRisk = 0;
    let offTrack = 0;
    const topAtRisk: Array<{
      id: string;
      title: string;
      healthScore: number | null;
      healthStatus: string | null;
      ownerAgentId: string | null;
    }> = [];

    for (const g of goalsList) {
      if (g.healthStatus === "on_track") onTrack++;
      else if (g.healthStatus === "at_risk") {
        healthAtRisk++;
        topAtRisk.push(g);
      } else if (g.healthStatus === "off_track") {
        offTrack++;
        topAtRisk.push(g);
      }
    }

    topAtRisk.sort((a, b) => (a.healthScore ?? 0) - (b.healthScore ?? 0));

    return {
      total,
      completed,
      inProgress,
      atRisk,
      completionRate,
      onTrack,
      healthAtRisk,
      offTrack,
      topAtRisk: topAtRisk.slice(0, 5),
    };
  }, [goalsProgress, allGoals]);

  const pendingHiring = useMemo(
    () => (hiringRequests ?? []).filter((h) => h.status === "pending" || h.status === "pending_approval"),
    [hiringRequests],
  );

  const pendingApprovals = approvals ?? [];

  const perfRows = useMemo(
    () => computeAgentPerformance(agents ?? [], issues ?? [], costsByAgent ?? [], "30d"),
    [agents, issues, costsByAgent],
  );

  const topPerformers = perfRows.filter((r) => r.tasksDone > 0).slice(0, 3);
  const bottomPerformers = perfRows
    .filter((r) => r.tasksDone > 0)
    .slice(-3)
    .reverse();

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.identifier ?? i.id.slice(0, 8));
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    return map;
  }, [issues, agents]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [issues]);

  const recentActivity = useMemo(() => (activity ?? []).slice(0, 10), [activity]);

  const marketingDept = useMemo(
    () =>
      (departmentImpactData ?? []).find(
        (d) => d.department.toLowerCase().includes("market") || d.department.toLowerCase().includes("cmo"),
      ),
    [departmentImpactData],
  );

  const issueTrendWeeks = useMemo(() => {
    const now = Date.now();
    const weeks: Array<{ label: string; count: number }> = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = now - (i + 1) * 7 * 24 * 60 * 60 * 1000;
      const weekEnd = now - i * 7 * 24 * 60 * 60 * 1000;
      const label = new Date(weekEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const count = (issues ?? []).filter((iss) => {
        if (iss.status !== "done" || !iss.completedAt) return false;
        const t = new Date(iss.completedAt).getTime();
        return t >= weekStart && t < weekEnd;
      }).length;
      weeks.push({ label, count });
    }
    return weeks;
  }, [issues]);

  const spendTrendWeeks = useMemo(() => {
    const priorMonthly = monthSpendCents - weekSpendCents;
    const priorWeeklyAvg = priorMonthly > 0 ? Math.round(priorMonthly / 3) : 0;
    const weeks: Array<{ label: string; cost: number }> = [];
    const now = Date.now();
    for (let i = 7; i >= 1; i--) {
      const weekEnd = now - i * 7 * 24 * 60 * 60 * 1000;
      const label = new Date(weekEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      weeks.push({ label, cost: priorWeeklyAvg });
    }
    weeks.push({ label: "This week", cost: weekSpendCents });
    return weeks;
  }, [weekSpendCents, monthSpendCents]);

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={FileText} message="Select a company to view the board briefing." />;
  }

  if (headcountLoading) return <PageSkeleton variant="dashboard" />;

  const companyName = selectedCompany?.name ?? "Company";
  const totalAgents = headcount ? headcount.fte + headcount.contractor : 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <BriefingHeader dateStr={dateStr} companyName={companyName} period={period} onPeriodChange={setPeriod} />

      <ExecutiveSummary
        companyName={companyName}
        totalAgents={totalAgents}
        fte={headcount?.fte ?? 0}
        contractors={headcount?.contractor ?? 0}
        totalTasks={perfRows.reduce((s, r) => s + r.tasksDone, 0)}
        weekSpendCents={weekSpendCents}
        spendTrend={spendTrend}
        atRiskGoals={goalStats.atRisk}
        pendingHiringCount={pendingHiring.length}
        pendingApprovalsCount={pendingApprovals.length}
      />

      {healthScore && <CompanyHealthScoreCard healthScore={healthScore} />}

      <HeadcountCostCards
        headcount={headcount}
        weekSpendCents={weekSpendCents}
        lastWeekEstimate={lastWeekEstimate}
        spendTrend={spendTrend}
        monthlyProjection={monthlyProjection}
      />

      <GoalsPendingCards
        goalStats={goalStats}
        pendingHiringCount={pendingHiring.length}
        pendingApprovalsCount={pendingApprovals.length}
      />

      <AgentPerformanceSection perfRows={perfRows} topPerformers={topPerformers} bottomPerformers={bottomPerformers} />

      {/* SLA Compliance + Tech Debt */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SlaComplianceCard slaData={slaData} />
        <TechDebtCard techDebtData={techDebtData} />
      </div>

      {riskData && riskData.totalRisks > 0 && <RiskSummarySection riskData={riskData} />}

      {permissionMatrix && permissionMatrix.agents.length > 0 && permissionMatrix.permissions.length > 0 && (
        <PermissionMatrixSection permissionMatrix={permissionMatrix} />
      )}

      {doraMetrics && <EngineeringMetricsSection doraMetrics={doraMetrics} />}

      {humanOverrideData && <HumanOverrideSection humanOverrideData={humanOverrideData} />}

      {departmentImpactData && departmentImpactData.length > 0 && (
        <DepartmentImpactSection departmentImpactData={departmentImpactData} />
      )}

      {marketingDept && <CMOCampaignSection marketingDept={marketingDept} />}

      <WeeklyTrendsSection spendTrendWeeks={spendTrendWeeks} issueTrendWeeks={issueTrendWeeks} />

      {recentActivity.length > 0 && (
        <RecentActivitySection
          recentActivity={recentActivity}
          agentMap={agentMap}
          entityNameMap={entityNameMap}
          entityTitleMap={entityTitleMap}
        />
      )}

      {expertiseMap && expertiseMap.length > 0 && <ExpertiseMapSection expertiseMap={expertiseMap} />}

      {issues && agents && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Capacity Planning & Forecasting
          </h2>
          <CapacityPlanning issues={issues} agents={agents} />
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dashboardApi } from "../api/dashboard";
import { activityApi } from "../api/activity";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { heartbeatsApi } from "../api/heartbeats";
import { costsApi } from "../api/costs";
import { goalProgressApi } from "../api/goalProgress";
import { hiringApi } from "../api/hiring";
import { approvalsApi } from "../api/approvals";
import { announcementsApi } from "../api/announcements";
import { velocityApi } from "../api/velocity";
import { executiveApi } from "../api/executive";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { formatCents } from "../lib/utils";
import { Bot, DollarSign, PauseCircle, Swords, UserPlus, Users, CircleDot, ShieldCheck } from "lucide-react";
import { ActiveAgentsPanel } from "../components/ActiveAgentsPanel";
import { MetricCard } from "../components/MetricCard";
import { Link } from "@/lib/router";
import { PageSkeleton } from "../components/PageSkeleton";
import type { Agent, LiveEvent } from "@ironworksai/shared";
import { PluginSlotOutlet } from "@/plugins/slots";
import { computeAgentPerformance } from "./AgentPerformance";
import { WelcomeBanner } from "../components/WelcomeBanner";
import { ApiKeyOnboardingBanner } from "../components/ApiKeyOnboardingBanner";
import { GettingStartedChecklist } from "../components/GettingStartedChecklist";
import { usePageTitle } from "../hooks/usePageTitle";

/* ── Dashboard sub-components ── */
import { QuickActionFAB } from "../components/dashboard/QuickActionFAB";
import { QuickActionsGrid } from "../components/dashboard/QuickActionsGrid";
import { AnnouncementsSection } from "../components/dashboard/AnnouncementsSection";
import { AttentionRequiredSection } from "../components/dashboard/AttentionRequiredSection";
import { AlertsSection } from "../components/dashboard/AlertsSection";
import { SpendMetricsSection } from "../components/dashboard/SpendMetricsSection";
import { WorkforceImpactSection } from "../components/dashboard/WorkforceImpactSection";
import { DecisionsNeededSection } from "../components/dashboard/DecisionsNeededSection";
import { ProgressSection } from "../components/dashboard/ProgressSection";
import { VelocityDepartmentSection } from "../components/dashboard/VelocityDepartmentSection";
import { ActivitySection } from "../components/dashboard/ActivitySection";
import { LiveFeedPanel, type LiveFeedEvent } from "../components/dashboard/LiveFeedPanel";
import { QuickLinksWidget } from "../components/dashboard/QuickLinksWidget";
import { RecentDeliverablesWidget } from "../components/dashboard/RecentDeliverablesWidget";
import { isActivityEventMeaningful, aggregateActivityEvents } from "../components/dashboard/activityAggregation";

const MAX_LIVE_EVENTS = 50;

export function Dashboard() {
  usePageTitle("War Room");
  const { selectedCompanyId, companies } = useCompany();
  const navigate = useNavigate();
  const { openOnboarding, openHireAgent, openNewIssue, openNewGoal, openNewProject } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [animatedActivityIds, setAnimatedActivityIds] = useState<Set<string>>(new Set());
  const seenActivityIdsRef = useRef<Set<string>>(new Set());
  const hydratedActivityRef = useRef(false);
  const activityAnimationTimersRef = useRef<number[]>([]);

  /* ── Live Feed state ── */
  const [liveMode, setLiveMode] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveEvents, setLiveEvents] = useState<LiveFeedEvent[]>([]);
  const liveFeedBottomRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const toggleLiveMode = useCallback(() => {
    setLiveMode((prev) => !prev);
  }, []);

  /* Open / close SSE connection when liveMode or company changes */
  useEffect(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setLiveConnected(false);
    }
    if (!liveMode || !selectedCompanyId) return;

    const es = new EventSource(`/api/companies/${selectedCompanyId}/events`);
    eventSourceRef.current = es;
    es.onopen = () => { setLiveConnected(true); };
    es.onerror = () => { setLiveConnected(false); };

    function handleLiveEvent(sseType: string) {
      return (e: MessageEvent) => {
        try {
          const event = JSON.parse(e.data as string) as LiveEvent;
          const feedEntry: LiveFeedEvent = { id: `${Date.now()}-${Math.random()}`, sseType, receivedAt: new Date(), event };
          setLiveEvents((prev) => [...prev.slice(-(MAX_LIVE_EVENTS - 1)), feedEntry]);
        } catch { /* ignore */ }
      };
    }
    es.addEventListener("activity", handleLiveEvent("activity"));
    es.addEventListener("agent_run", handleLiveEvent("agent_run"));
    es.addEventListener("heartbeat_run_event", handleLiveEvent("heartbeat_run_event"));

    return () => { es.close(); eventSourceRef.current = null; setLiveConnected(false); };
  }, [liveMode, selectedCompanyId]);

  useEffect(() => {
    if (liveEvents.length > 0 && liveFeedBottomRef.current) {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      liveFeedBottomRef.current.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "nearest" });
    }
  }, [liveEvents]);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => { setBreadcrumbs([{ label: "War Room" }]); }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: windowSpend } = useQuery({
    queryKey: queryKeys.usageWindowSpend(selectedCompanyId!),
    queryFn: () => costsApi.windowSpend(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const { data: costsByAgent } = useQuery({
    queryKey: [...queryKeys.costs(selectedCompanyId!), "by-agent"],
    queryFn: () => costsApi.byAgent(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const { data: headcount } = useQuery({
    queryKey: queryKeys.headcount(selectedCompanyId!),
    queryFn: () => agentsApi.headcount(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const { data: goalsProgress } = useQuery({
    queryKey: ["goals", "progress", selectedCompanyId!],
    queryFn: () => goalProgressApi.batch(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const { data: hiringRequests } = useQuery({
    queryKey: queryKeys.hiring.list(selectedCompanyId!),
    queryFn: () => hiringApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const { data: pendingApprovalsList } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!, "pending"),
    queryFn: () => approvalsApi.list(selectedCompanyId!, "pending"),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const { data: announcements } = useQuery({
    queryKey: queryKeys.announcements.list(selectedCompanyId!),
    queryFn: () => announcementsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const { data: velocity } = useQuery({
    queryKey: ["velocity", selectedCompanyId!],
    queryFn: () => velocityApi.get(selectedCompanyId!, 12),
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });

  const queryClient = useQueryClient();

  const { data: smartAlerts } = useQuery({
    queryKey: ["alerts", selectedCompanyId!],
    queryFn: () => executiveApi.getAlerts(selectedCompanyId!, "medium"),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const resolveAlertMutation = useMutation({
    mutationFn: (alertId: string) => executiveApi.resolveAlert(selectedCompanyId!, alertId),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["alerts", selectedCompanyId!] }); },
  });

  /* ── Maps ── */
  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.identifier ?? i.id.slice(0, 8));
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    for (const p of projects ?? []) map.set(`project:${p.id}`, p.name);
    return map;
  }, [issues, agents, projects]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [issues]);

  /* ── Derived data ── */
  const filteredActivity = useMemo(
    () => (activity ?? []).filter(isActivityEventMeaningful).slice(0, 20),
    [activity],
  );

  const aggregatedActivity = useMemo(
    () => aggregateActivityEvents(filteredActivity, agentMap).slice(0, 12),
    [filteredActivity, agentMap],
  );

  const blockedIssues = useMemo(
    () => (issues ?? []).filter((i) => i.status === "blocked"),
    [issues],
  );

  const failedRuns = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return (runs ?? []).filter((r) => r.status === "failed" && new Date(r.createdAt).getTime() > cutoff);
  }, [runs]);

  const [dismissedAttention, setDismissedAttention] = useState<Set<string>>(new Set());
  const dismissItem = useCallback((id: string) => {
    setDismissedAttention((prev) => new Set([...prev, id]));
  }, []);
  const visibleBlockedIssues = blockedIssues.filter((i) => !dismissedAttention.has(`issue:${i.id}`));
  const visibleFailedRuns = failedRuns.filter((r) => !dismissedAttention.has(`run:${r.id}`));

  const todaySpendCents = useMemo(() => {
    if (!windowSpend) return 0;
    return windowSpend.filter((r) => r.window === "24h").reduce((sum, r) => sum + r.costCents, 0);
  }, [windowSpend]);

  const weekSpendCents = useMemo(() => {
    if (!windowSpend) return 0;
    return windowSpend.filter((r) => r.window === "7d").reduce((sum, r) => sum + r.costCents, 0);
  }, [windowSpend]);

  const dailyAvgCents = weekSpendCents > 0 ? Math.round(weekSpendCents / 7) : 0;
  const spendDeltaPercent = dailyAvgCents > 0
    ? Math.round(((todaySpendCents - dailyAvgCents) / dailyAvgCents) * 100)
    : 0;

  const agentPerfRows = useMemo(
    () => computeAgentPerformance(agents ?? [], issues ?? [], costsByAgent ?? [], "30d"),
    [agents, issues, costsByAgent],
  );
  const agentEfficiency = agentPerfRows.filter((r) => r.totalSpendCents > 0 || r.tasksDone > 0).slice(0, 6);

  const teamAvgCostPerTask = useMemo(() => {
    const withTasks = agentEfficiency.filter((a) => a.costPerTask !== null);
    if (withTasks.length === 0) return null;
    return withTasks.reduce((s, a) => s + a.costPerTask!, 0) / withTasks.length;
  }, [agentEfficiency]);

  const teamAvgCloseH = useMemo(() => {
    const withTime = agentEfficiency.filter((a) => a.avgCloseH !== null);
    if (withTime.length === 0) return null;
    return withTime.reduce((s, a) => s + a.avgCloseH!, 0) / withTime.length;
  }, [agentEfficiency]);

  const projectActivity = useMemo(() => {
    if (!issues || !projects) return [];
    const countByProject = new Map<string, number>();
    let noProject = 0;
    for (const issue of issues) {
      if (issue.status === "cancelled") continue;
      if (issue.projectId) countByProject.set(issue.projectId, (countByProject.get(issue.projectId) ?? 0) + 1);
      else noProject++;
    }
    const total = [...countByProject.values()].reduce((s, v) => s + v, 0) + noProject;
    if (total === 0) return [];
    return projects
      .filter((p) => countByProject.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, color: p.color ?? "#6366f1", count: countByProject.get(p.id)!, percent: Math.round((countByProject.get(p.id)! / total) * 100) }))
      .sort((a, b) => b.count - a.count);
  }, [issues, projects]);

  const totalProjectIssues = projectActivity.reduce((s, p) => s + p.count, 0);

  const departmentBreakdown = useMemo(() => {
    if (!agents) return [];
    const counts = new Map<string, number>();
    for (const a of agents) {
      if (a.status === "terminated") continue;
      const dept = (a as { department?: string | null }).department ?? "Unassigned";
      counts.set(dept, (counts.get(dept) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [agents]);

  const activeGoals = useMemo(
    () => (goalsProgress ?? []).filter((g) => g.status === "active" || g.status === "planned"),
    [goalsProgress],
  );

  const impactMetrics = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const doneThisWeek = (issues ?? []).filter((i) => i.status === "done" && i.completedAt && new Date(i.completedAt).getTime() > weekAgo).length;
    const humanHoursEquiv = doneThisWeek * 2;
    const costPerTask = doneThisWeek > 0 ? weekSpendCents / doneThisWeek : 0;
    const costPerHumanHour = humanHoursEquiv > 0 ? weekSpendCents / humanHoursEquiv : 0;
    return { doneThisWeek, humanHoursEquiv, costPerTask, costPerHumanHour };
  }, [issues, weekSpendCents]);

  const pendingHiringCount = useMemo(
    () => (hiringRequests ?? []).filter((r) => r.status === "pending" || r.status === "open").length,
    [hiringRequests],
  );
  const pendingApprovalsCount = (pendingApprovalsList ?? []).length;

  /* ── Activity animation ── */
  useEffect(() => {
    for (const timer of activityAnimationTimersRef.current) window.clearTimeout(timer);
    activityAnimationTimersRef.current = [];
    seenActivityIdsRef.current = new Set();
    hydratedActivityRef.current = false;
    setAnimatedActivityIds(new Set());
  }, [selectedCompanyId]);

  useEffect(() => {
    if (filteredActivity.length === 0) return;
    const seen = seenActivityIdsRef.current;
    const currentIds = filteredActivity.map((e) => e.id);
    if (!hydratedActivityRef.current) {
      for (const id of currentIds) seen.add(id);
      hydratedActivityRef.current = true;
      return;
    }
    const newIds = currentIds.filter((id) => !seen.has(id));
    if (newIds.length === 0) { for (const id of currentIds) seen.add(id); return; }
    setAnimatedActivityIds((prev) => { const next = new Set(prev); for (const id of newIds) next.add(id); return next; });
    for (const id of newIds) seen.add(id);
    const timer = window.setTimeout(() => {
      setAnimatedActivityIds((prev) => { const next = new Set(prev); for (const id of newIds) next.delete(id); return next; });
      activityAnimationTimersRef.current = activityAnimationTimersRef.current.filter((t) => t !== timer);
    }, 980);
    activityAnimationTimersRef.current.push(timer);
  }, [filteredActivity]);

  useEffect(() => () => { for (const t of activityAnimationTimersRef.current) window.clearTimeout(t); }, []);

  /* ── Empty states ── */
  if (!selectedCompanyId) {
    if (companies.length === 0) {
      return (
        <EmptyState
          icon={Swords}
          message="Welcome to Ironworks. Set up your first company and agent to get started."
          action="Get Started"
          onAction={openOnboarding}
        />
      );
    }
    return <EmptyState icon={Swords} message="Create or select a company to view the War Room." />;
  }

  if (isLoading && !data) return <PageSkeleton variant="dashboard" />;

  const hasNoAgents = agents !== undefined && agents.length === 0;

  return (
    <div className="space-y-8">
      <QuickActionFAB
        onCreateIssue={() => openNewIssue()}
        onInvokeAgent={() => navigate("/agents")}
        onRunPlaybook={() => navigate("/playbooks")}
      />
      <WelcomeBanner />
      <ApiKeyOnboardingBanner />
      <GettingStartedChecklist
        hasCompany={!!selectedCompanyId}
        hasProvider={!!(agents && agents.length > 0)}
        hasAgents={!!(agents && agents.length > 0)}
        hasTasks={!!(issues && issues.length > 0)}
      />
      {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}

      <AnnouncementsSection announcements={announcements ?? []} />

      {hasNoAgents && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-950/60">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
            <p className="text-sm text-amber-900 dark:text-amber-100">You have no agents.</p>
          </div>
          <button
            onClick={() => openOnboarding({ initialStep: 3, companyId: selectedCompanyId! })}
            className="text-sm font-medium text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 underline underline-offset-2 shrink-0"
          >
            Create one here
          </button>
        </div>
      )}

      {/* 1. AGENTS */}
      <ActiveAgentsPanel companyId={selectedCompanyId!} />

      {data && (
        <>
          {/* Budget incident banner */}
          {data.budgets.activeIncidents > 0 && (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-red-500/20 bg-[linear-gradient(180deg,rgba(255,80,80,0.12),rgba(255,255,255,0.02))] px-4 py-3">
              <div className="flex items-start gap-2.5">
                <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                <div>
                  <p className="text-sm font-medium text-red-50">
                    {data.budgets.activeIncidents} active budget incident{data.budgets.activeIncidents === 1 ? "" : "s"}
                  </p>
                  <p className="text-sm text-red-100/70">
                    {data.budgets.pausedAgents} agents paused - {data.budgets.pausedProjects} projects paused - {data.budgets.pendingApprovals} pending budget approvals
                  </p>
                </div>
              </div>
              <Link to="/costs" className="text-sm underline underline-offset-2 text-red-100">Open budgets</Link>
            </div>
          )}

          {/* 2. STATS ROW */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {headcount && (
              <MetricCard
                icon={Users}
                value={headcount.fte + headcount.contractor}
                label="Headcount"
                to="/agents"
                accentColor="violet"
                description={
                  <span className="flex items-center gap-2">
                    <span>{headcount.fte} Full-Time, {headcount.contractor} Contractors</span>
                    <button
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); openHireAgent(); }}
                      title="Hire agent"
                    >
                      <UserPlus className="h-3 w-3" /> Hire
                    </button>
                  </span>
                }
              />
            )}
            <MetricCard
              icon={Bot}
              value={data.agents.active + data.agents.running + data.agents.paused + data.agents.error}
              label="Agents Enabled"
              to="/agents"
              accentColor="emerald"
              description={<span>{data.agents.running} running, {data.agents.paused} paused, {data.agents.error} errors</span>}
            />
            <MetricCard
              icon={CircleDot}
              value={data.tasks.inProgress}
              label="Tasks Active"
              to="/issues"
              accentColor="blue"
              description={<span>{data.tasks.open} open, {data.tasks.blocked} blocked</span>}
            />
            <MetricCard
              icon={DollarSign}
              value={formatCents(data.costs.monthSpendCents)}
              label="Month Spend"
              to="/costs"
              accentColor="amber"
              description={<span>{data.costs.monthBudgetCents > 0 ? `${data.costs.monthUtilizationPercent}% of ${formatCents(data.costs.monthBudgetCents)} budget` : "Unlimited budget"}</span>}
            />
            <MetricCard
              icon={ShieldCheck}
              value={data.pendingApprovals + data.budgets.pendingApprovals}
              label="Pending Approvals"
              to="/approvals"
              accentColor="red"
              description={<span>{data.budgets.pendingApprovals > 0 ? `${data.budgets.pendingApprovals} budget overrides awaiting board review` : "Awaiting board review"}</span>}
            />
          </div>

          {/* QUICK ACTIONS */}
          <QuickActionsGrid
            onCreateIssue={openNewIssue}
            onCreateGoal={openNewGoal}
            onCreateProject={openNewProject}
          />

          {/* 3. ATTENTION REQUIRED */}
          <AttentionRequiredSection
            visibleBlockedIssues={visibleBlockedIssues}
            visibleFailedRuns={visibleFailedRuns}
            agentMap={agentMap}
            onDismiss={dismissItem}
          />

          {/* ALERTS */}
          <AlertsSection
            alerts={smartAlerts ?? []}
            onResolve={(alertId) => resolveAlertMutation.mutate(alertId)}
            isResolving={resolveAlertMutation.isPending}
          />

          {/* 4. METRICS ROW */}
          <SpendMetricsSection
            todaySpendCents={todaySpendCents}
            dailyAvgCents={dailyAvgCents}
            spendDeltaPercent={spendDeltaPercent}
            weekSpendCents={weekSpendCents}
            monthSpendCents={data.costs.monthSpendCents}
            agentEfficiency={agentEfficiency}
            teamAvgCostPerTask={teamAvgCostPerTask}
            teamAvgCloseH={teamAvgCloseH}
            projectActivity={projectActivity}
            totalProjectIssues={totalProjectIssues}
          />

          {/* 4b. AI WORKFORCE IMPACT */}
          <WorkforceImpactSection
            impactMetrics={impactMetrics}
            weekSpendCents={weekSpendCents}
            agentCount={headcount ? headcount.fte + headcount.contractor : agents?.length ?? 0}
          />

          {/* 4c. DECISIONS NEEDED */}
          <DecisionsNeededSection
            pendingHiringCount={pendingHiringCount}
            pendingApprovalsCount={pendingApprovalsCount}
          />

          {/* 5. PROGRESS ROW */}
          <ProgressSection
            activeGoals={activeGoals}
            issues={issues ?? []}
          />

          {/* 5b. VELOCITY + DEPARTMENT */}
          <VelocityDepartmentSection
            velocity={velocity}
            departmentBreakdown={departmentBreakdown}
          />

          <PluginSlotOutlet
            slotTypes={["dashboardWidget"]}
            context={{ companyId: selectedCompanyId }}
            className="grid gap-4 md:grid-cols-2"
            itemClassName="rounded-lg border bg-card p-4 shadow-sm"
          />

          {/* Quick Links + Recent Deliverables */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <QuickLinksWidget />
            <RecentDeliverablesWidget issues={issues ?? []} agents={agents ?? []} />
          </div>

          {/* 6. RECENT ACTIVITY */}
          <ActivitySection
            aggregatedActivity={aggregatedActivity}
            agentMap={agentMap}
            entityNameMap={entityNameMap}
            entityTitleMap={entityTitleMap}
            animatedActivityIds={animatedActivityIds}
            liveMode={liveMode}
            liveConnected={liveConnected}
            onToggleLiveMode={toggleLiveMode}
          />

          {/* 7. LIVE FEED */}
          {liveMode && (
            <LiveFeedPanel
              liveConnected={liveConnected}
              liveEvents={liveEvents}
              agentMap={agentMap}
              liveFeedBottomRef={liveFeedBottomRef}
              onClear={() => setLiveEvents([])}
            />
          )}
        </>
      )}
    </div>
  );
}

import { Link } from "@/lib/router";
import { ChartCard, RunActivityChart, PriorityChart, IssueStatusChart, SuccessRateChart } from "../ActivityCharts";
import { StatusBadge } from "../StatusBadge";
import { EntityRow } from "../EntityRow";
import type {
  AgentDetail as AgentDetailRecord,
  HeartbeatRun,
  AgentRuntimeState,
} from "@ironworksai/shared";
import {
  LatestRunCard,
  CostsSection,
  OnboardingChecklist,
  ModelStrategyCard,
  EmploymentCard,
} from "./DashboardCards";
import {
  UnderperformerBanner,
  CurrentTaskSpotlight,
  PerformanceHistoryChart,
  KnowledgeMap,
  AgentJournal,
  DecisionLog,
  CommunicationStyleBadge,
  AgentScheduleInfo,
  SuccessionWarning,
} from "./DashboardInsights";

export function AgentDashboard({
  agent,
  runs,
  assignedIssues,
  runtimeState,
  agentId,
  agentRouteId,
}: {
  agent: AgentDetailRecord;
  runs: HeartbeatRun[];
  assignedIssues: { id: string; title: string; status: string; priority: string; identifier?: string | null; createdAt: Date; completedAt?: Date | string | null }[];
  runtimeState?: AgentRuntimeState;
  agentId: string;
  agentRouteId: string;
}) {
  return (
    <div className="space-y-8">
      {/* Underperformer Banner */}
      <UnderperformerBanner agent={agent} runs={runs} issues={assignedIssues} />

      {/* Current Task Spotlight */}
      <CurrentTaskSpotlight issues={assignedIssues} agentRouteId={agentRouteId} />

      {/* Onboarding Status - only shown for newly hired agents */}
      <OnboardingChecklist agent={agent} assignedIssues={assignedIssues} runs={runs} />

      {/* Employment */}
      <EmploymentCard agent={agent} companyId={agent.companyId} />

      {/* Communication Style & Schedule */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border p-4 space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Communication Style</h4>
          <CommunicationStyleBadge role={agent.role} />
        </div>
        <div className="rounded-lg border border-border p-4 space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Schedule</h4>
          <AgentScheduleInfo agent={agent} runs={runs} />
        </div>
      </div>

      {/* Succession Warning */}
      <SuccessionWarning agentName={agent.name} issues={assignedIssues} />

      {/* Model Strategy */}
      <ModelStrategyCard agent={agent} />

      {/* Latest Run */}
      <LatestRunCard runs={runs} agentId={agentRouteId} />

      {/* Charts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ChartCard title="Run Activity" subtitle="Last 14 days">
          <RunActivityChart runs={runs} />
        </ChartCard>
        <ChartCard title="Issues by Priority" subtitle="Last 14 days">
          <PriorityChart issues={assignedIssues} />
        </ChartCard>
        <ChartCard title="Issues by Status" subtitle="Last 14 days">
          <IssueStatusChart issues={assignedIssues} />
        </ChartCard>
        <ChartCard title="Success Rate" subtitle="Last 14 days">
          <SuccessRateChart runs={runs} />
        </ChartCard>
      </div>

      {/* Recent Issues */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Recent Issues</h3>
          <Link
            to={`/issues?participantAgentId=${agentId}`}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            See All &rarr;
          </Link>
        </div>
        {assignedIssues.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent issues.</p>
        ) : (
          <div className="border border-border rounded-lg">
            {assignedIssues.slice(0, 10).map((issue) => (
              <EntityRow
                key={issue.id}
                identifier={issue.identifier ?? issue.id.slice(0, 8)}
                title={issue.title}
                to={`/issues/${issue.identifier ?? issue.id}`}
                trailing={<StatusBadge status={issue.status} />}
              />
            ))}
            {assignedIssues.length > 10 && (
              <div className="px-3 py-2 text-xs text-muted-foreground text-center border-t border-border">
                +{assignedIssues.length - 10} more issues
              </div>
            )}
          </div>
        )}
      </div>

      {/* Performance History Chart */}
      <PerformanceHistoryChart
        runs={runs}
        issues={assignedIssues}
        companyId={agent.companyId}
        agentId={agentId}
      />

      {/* Knowledge Map */}
      <KnowledgeMap companyId={agent.companyId} agentId={agentId} />

      {/* Agent Journal */}
      <AgentJournal companyId={agent.companyId} agentId={agentId} />

      {/* Decision Log */}
      <DecisionLog companyId={agent.companyId} agentId={agentId} />

      {/* Costs */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Costs</h3>
        <CostsSection runtimeState={runtimeState} runs={runs} />
      </div>
    </div>
  );
}

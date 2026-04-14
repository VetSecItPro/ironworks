import { useMemo } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { agentMemoryApi } from "../../api/agentMemory";
import { activityApi } from "../../api/activity";
import { queryKeys } from "../../lib/queryKeys";
import { formatDate, relativeTime } from "../../lib/utils";
import { Clock, AlertTriangle, BookOpen, MessageSquare, TrendingDown, Zap } from "lucide-react";
import type {
  AgentDetail as AgentDetailRecord,
  HeartbeatRun,
} from "@ironworksai/shared";

/* -- Underperformer Callout Banner -- */

export function UnderperformerBanner({ agent, runs, issues }: {
  agent: AgentDetailRecord;
  runs: HeartbeatRun[];
  issues: Array<{ status: string }>;
}) {
  const recentRuns = runs.filter((r) => {
    const age = Date.now() - new Date(r.createdAt).getTime();
    return age < 7 * 24 * 60 * 60 * 1000;
  });
  const failedCount = recentRuns.filter((r) => r.status === "failed").length;
  const doneCount = issues.filter((i) => i.status === "done").length;
  const totalResolved = issues.filter((i) => i.status === "done" || i.status === "cancelled").length;
  const completionRate = totalResolved > 0 ? Math.round((doneCount / totalResolved) * 100) : 100;

  const failureRate = recentRuns.length > 0 ? (failedCount / recentRuns.length) * 100 : 0;
  if (failureRate <= 40 && completionRate >= 50) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/[0.04] px-4 py-3">
      <TrendingDown className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-red-50">Performance concern detected</p>
        <p className="text-xs text-red-100/70 mt-0.5">
          {failureRate > 40 && `${Math.round(failureRate)}% run failure rate this week. `}
          {completionRate < 50 && `${completionRate}% task completion rate. `}
          Consider reviewing instructions or switching models.
        </p>
      </div>
    </div>
  );
}

/* -- Current Task Spotlight -- */

export function CurrentTaskSpotlight({ issues, agentRouteId }: {
  issues: Array<{ id: string; title: string; status: string; identifier?: string | null }>;
  agentRouteId: string;
}) {
  const inProgress = issues.filter((i) => i.status === "in_progress");
  if (inProgress.length === 0) return null;
  const current = inProgress[0];
  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.04] p-4">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="h-3.5 w-3.5 text-blue-400" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-400">Current Task</span>
      </div>
      <Link
        to={`/issues/${current.identifier ?? current.id}`}
        className="text-sm font-medium hover:underline no-underline text-inherit"
      >
        {current.identifier && <span className="font-mono text-muted-foreground mr-1.5">{current.identifier}</span>}
        {current.title}
      </Link>
      {inProgress.length > 1 && (
        <p className="text-[11px] text-muted-foreground mt-1">+{inProgress.length - 1} more in progress</p>
      )}
    </div>
  );
}

/* -- Performance History Chart (30-day tasks/errors/cost) -- */

export function PerformanceHistoryChart({ runs, issues, companyId, agentId }: {
  runs: HeartbeatRun[];
  issues: Array<{ status: string; completedAt?: Date | string | null; createdAt: Date | string }>;
  companyId: string;
  agentId: string;
}) {
  const days = 30;
  const now = Date.now();
  const buckets = Array.from({ length: days }, (_, i) => {
    const dayStart = now - (days - 1 - i) * 86400000;
    const dayEnd = dayStart + 86400000;
    const dayRuns = runs.filter((r) => {
      const t = new Date(r.createdAt).getTime();
      return t >= dayStart && t < dayEnd;
    });
    const dayTasks = issues.filter((i) => {
      if (!i.completedAt) return false;
      const t = new Date(i.completedAt).getTime();
      return t >= dayStart && t < dayEnd;
    });
    return {
      tasks: dayTasks.length,
      errors: dayRuns.filter((r) => r.status === "failed").length,
      runs: dayRuns.length,
    };
  });

  const maxVal = Math.max(...buckets.map((b) => Math.max(b.tasks, b.errors, b.runs)), 1);
  const w = 360;
  const h = 80;

  const taskPoints = buckets.map((b, i) => `${(i / (days - 1)) * w},${h - (b.tasks / maxVal) * h}`).join(" ");
  const errorPoints = buckets.map((b, i) => `${(i / (days - 1)) * w},${h - (b.errors / maxVal) * h}`).join(" ");

  return (
    <div className="rounded-lg border border-border p-4 space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">30-Day Performance</h4>
      <svg viewBox={`0 0 ${w} ${h + 16}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        <polyline points={taskPoints} fill="none" className="stroke-emerald-500" strokeWidth="1.5" />
        <polyline points={errorPoints} fill="none" className="stroke-red-500" strokeWidth="1.5" strokeDasharray="3 2" />
      </svg>
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-emerald-500" />Tasks completed</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-red-500" />Errors</span>
      </div>
    </div>
  );
}

/* -- Knowledge Map (memory tag cloud) -- */

export function KnowledgeMap({ companyId, agentId }: { companyId: string; agentId: string }) {
  const { data: memory } = useQuery({
    queryKey: queryKeys.agentMemory.list(companyId, agentId),
    queryFn: () => agentMemoryApi.list(companyId, agentId),
    enabled: !!companyId && !!agentId,
    staleTime: 60_000,
  });

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of memory ?? []) {
      const cat = m.category || "uncategorized";
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [memory]);

  if (categories.length === 0) return null;
  const maxCount = Math.max(...categories.map((c) => c.count), 1);

  return (
    <div className="rounded-lg border border-border p-4 space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Knowledge Map</h4>
      <div className="flex flex-wrap gap-1.5">
        {categories.slice(0, 20).map((cat) => {
          const size = 10 + (cat.count / maxCount) * 6;
          return (
            <span
              key={cat.name}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 transition-colors hover:bg-accent"
              style={{ fontSize: `${size}px` }}
            >
              <span className="font-medium">{cat.name.replace(/_/g, " ")}</span>
              <span className="text-muted-foreground/80 tabular-nums">{cat.count}</span>
            </span>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">{(memory ?? []).length} total memory entries</p>
    </div>
  );
}

/* -- Agent Journal (daily summary from activity) -- */

export function AgentJournal({ companyId, agentId }: { companyId: string; agentId: string }) {
  const { data: activity } = useQuery({
    queryKey: [...queryKeys.activity(companyId), "agent-journal", agentId],
    queryFn: () => activityApi.list(companyId),
    enabled: !!companyId && !!agentId,
    staleTime: 60_000,
  });

  const dailySummaries = useMemo(() => {
    const agentEvents = (activity ?? []).filter((e) => e.actorId === agentId && e.actorType === "agent");
    const byDay = new Map<string, { date: string; actions: Map<string, number>; total: number }>();
    for (const e of agentEvents) {
      const day = new Date(e.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (!byDay.has(day)) byDay.set(day, { date: day, actions: new Map(), total: 0 });
      const entry = byDay.get(day)!;
      const action = e.action.replace(/[._]/g, " ");
      entry.actions.set(action, (entry.actions.get(action) ?? 0) + 1);
      entry.total++;
    }
    return Array.from(byDay.values()).slice(0, 7);
  }, [activity, agentId]);

  if (dailySummaries.length === 0) return null;

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <BookOpen className="h-3.5 w-3.5" />
        Agent Journal
      </h4>
      <div className="space-y-2">
        {dailySummaries.map((day) => (
          <div key={day.date} className="text-sm">
            <span className="font-medium">{day.date}</span>
            <span className="text-muted-foreground ml-2">
              {Array.from(day.actions.entries()).map(([action, count]) =>
                `${count} ${action}${count !== 1 ? "s" : ""}`
              ).join(", ")}
            </span>
            <span className="text-[10px] text-muted-foreground/80 ml-1">({day.total} total)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -- Decision Log (agent.decision activity entries) -- */

export function DecisionLog({ companyId, agentId }: { companyId: string; agentId: string }) {
  const { data: activity } = useQuery({
    queryKey: [...queryKeys.activity(companyId), "decisions", agentId],
    queryFn: () => activityApi.list(companyId, { agentId, action: "agent.decision", limit: 20 }),
    enabled: !!companyId && !!agentId,
    staleTime: 60_000,
  });

  const decisions = useMemo(() => {
    return (activity ?? []).map((e) => {
      const details = (e.details ?? {}) as Record<string, unknown>;
      return {
        id: e.id,
        createdAt: e.createdAt,
        decision: String(details.decision ?? ""),
        reasoning: details.reasoning ? String(details.reasoning) : null,
        alternatives: Array.isArray(details.alternativesConsidered)
          ? (details.alternativesConsidered as unknown[]).map(String)
          : null,
        issueId: details.issueId ? String(details.issueId) : null,
        issueTitle: details.issueTitle ? String(details.issueTitle) : null,
      };
    }).filter((d) => d.decision.length > 0);
  }, [activity]);

  if (decisions.length === 0) return null;

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5" />
        Decision Log
      </h4>
      <div className="space-y-3">
        {decisions.map((d) => (
          <div key={d.id} className="border border-border rounded-md p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{formatDate(d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt))}</span>
              {d.issueTitle && (
                <>
                  <span className="text-muted-foreground/40">|</span>
                  {d.issueId ? (
                    <Link to={`/issues/${d.issueId}`} className="hover:underline text-inherit">
                      {d.issueTitle}
                    </Link>
                  ) : (
                    <span>{d.issueTitle}</span>
                  )}
                </>
              )}
            </div>
            <p className="text-sm">{d.decision}</p>
            {d.reasoning && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Why:</span> {d.reasoning}
              </p>
            )}
            {d.alternatives && d.alternatives.length > 0 && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Alternatives:</span> {d.alternatives.join(", ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* -- Communication Style Badge -- */

const ROLE_COMM_STYLES: Record<string, { label: string; color: string }> = {
  ceo: { label: "Business", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  cto: { label: "Technical", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  cfo: { label: "Concise", color: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30" },
  cmo: { label: "Verbose", color: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/30" },
  engineer: { label: "Technical", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  designer: { label: "Verbose", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30" },
  marketer: { label: "Verbose", color: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/30" },
  director: { label: "Business", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  accountant: { label: "Concise", color: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30" },
  analyst: { label: "Technical", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  researcher: { label: "Verbose", color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30" },
};

export function CommunicationStyleBadge({ role }: { role: string }) {
  const style = ROLE_COMM_STYLES[role] ?? { label: "Concise", color: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${style.color}`}>
      {style.label}
    </span>
  );
}

/* -- Agent Schedule -- */

export function AgentScheduleInfo({ agent, runs }: { agent: AgentDetailRecord; runs: HeartbeatRun[] }) {
  const runtimeConfig = (agent.runtimeConfig ?? {}) as Record<string, unknown>;
  const heartbeatInterval = runtimeConfig.heartbeatInterval as number | undefined;
  const scheduleCron = runtimeConfig.schedule as string | undefined;

  const lastRun = [...runs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const nextRunEstimate = lastRun && heartbeatInterval ? new Date(new Date(lastRun.createdAt).getTime() + heartbeatInterval * 60 * 1000) : null;

  return (
    <div className="space-y-1.5 text-sm">
      {heartbeatInterval ? (
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Every {heartbeatInterval}min heartbeat</span>
        </div>
      ) : scheduleCron ? (
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-xs">{scheduleCron}</span>
        </div>
      ) : (
        <span className="text-muted-foreground">On-demand only</span>
      )}
      {lastRun && <div className="text-xs text-muted-foreground">Last run: {relativeTime(lastRun.createdAt)}</div>}
      {nextRunEstimate && nextRunEstimate.getTime() > Date.now() && (
        <div className="text-xs text-muted-foreground">Next estimated: {relativeTime(nextRunEstimate)}</div>
      )}
    </div>
  );
}

/* -- Succession Warning -- */

export function SuccessionWarning({ agentName, issues }: { agentName: string; issues: { id: string; status: string }[] }) {
  const openIssues = issues.filter((i) => i.status !== "done" && i.status !== "cancelled");
  if (openIssues.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-3">
      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="font-medium text-amber-600 dark:text-amber-400">Succession Impact</p>
        <p className="text-muted-foreground mt-0.5">
          If {agentName} is removed, <strong>{openIssues.length}</strong> open mission{openIssues.length !== 1 ? "s" : ""} would be
          unassigned.
        </p>
      </div>
    </div>
  );
}

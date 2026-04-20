import type { Issue } from "@ironworksai/shared";
import type { AgentPerfRow } from "./ratingUtils";

/* ── Workload Distribution ── */

export function WorkloadDistribution({ rows, issues }: { rows: AgentPerfRow[]; issues: Issue[] }) {
  const maxActive = Math.max(
    ...rows.map(
      (r) => r.tasksInProgress + issues.filter((i) => i.assigneeAgentId === r.agentId && i.status === "todo").length,
    ),
    1,
  );

  const enriched = rows
    .map((r) => {
      const todo = issues.filter((i) => i.assigneeAgentId === r.agentId && i.status === "todo").length;
      const active = r.tasksInProgress + todo;
      return { ...r, todo, active };
    })
    .sort((a, b) => b.active - a.active);

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workload Distribution</h4>
      <p className="text-sm text-muted-foreground">
        Active tasks per agent - identify overloaded or idle team members.
      </p>
      <div className="space-y-2.5">
        {enriched.map((r) => (
          <div key={r.agentId} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="truncate">{r.name}</span>
              <span className="text-muted-foreground shrink-0">
                {r.tasksInProgress} active · {r.todo} queued
              </span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-muted">
              {r.tasksInProgress > 0 && (
                <div
                  className="bg-blue-500 transition-[width] duration-300"
                  style={{ width: `${(r.tasksInProgress / maxActive) * 100}%` }}
                />
              )}
              {r.todo > 0 && (
                <div
                  className="bg-blue-500/30 transition-[width] duration-300"
                  style={{ width: `${(r.todo / maxActive) * 100}%` }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-blue-500" /> In Progress
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-blue-500/30" /> Queued (Todo)
        </span>
      </div>
    </div>
  );
}

/* ── Agent Pipeline ── */

export function AgentPipeline({ rows, issues }: { rows: AgentPerfRow[]; issues: Issue[] }) {
  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent Pipeline</h4>
      <p className="text-sm text-muted-foreground">Task funnel per agent - from backlog to done.</p>
      <div className="space-y-2">
        {rows
          .filter((r) => r.tasksDone > 0 || r.tasksInProgress > 0)
          .map((r) => {
            const backlog = issues.filter((i) => i.assigneeAgentId === r.agentId && i.status === "backlog").length;
            const todo = issues.filter((i) => i.assigneeAgentId === r.agentId && i.status === "todo").length;
            const inProgress = r.tasksInProgress;
            const inReview = issues.filter((i) => i.assigneeAgentId === r.agentId && i.status === "in_review").length;
            const done = r.tasksDone;
            const total = backlog + todo + inProgress + inReview + done;
            if (total === 0) return null;

            return (
              <div key={r.agentId} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate">{r.name}</span>
                  <span className="text-muted-foreground">{total} total</span>
                </div>
                <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
                  {done > 0 && <div className="bg-emerald-500" style={{ width: `${(done / total) * 100}%` }} />}
                  {inReview > 0 && <div className="bg-violet-500" style={{ width: `${(inReview / total) * 100}%` }} />}
                  {inProgress > 0 && (
                    <div className="bg-blue-500" style={{ width: `${(inProgress / total) * 100}%` }} />
                  )}
                  {todo > 0 && <div className="bg-amber-500" style={{ width: `${(todo / total) * 100}%` }} />}
                  {backlog > 0 && (
                    <div className="bg-muted-foreground/30" style={{ width: `${(backlog / total) * 100}%` }} />
                  )}
                </div>
              </div>
            );
          })}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground pt-1">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Done
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-violet-500" /> Review
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-blue-500" /> Active
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-amber-500" /> Todo
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-muted-foreground/30" /> Backlog
        </span>
      </div>
    </div>
  );
}

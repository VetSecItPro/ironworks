import type { Agent, HeartbeatRun, Issue } from "@ironworksai/shared";
import { AlertTriangle, X } from "lucide-react";
import { Link } from "@/lib/router";

export function AttentionRequiredSection({
  visibleBlockedIssues,
  visibleFailedRuns,
  agentMap,
  onDismiss,
}: {
  visibleBlockedIssues: Issue[];
  visibleFailedRuns: HeartbeatRun[];
  agentMap: Map<string, Agent>;
  onDismiss: (id: string) => void;
}) {
  if (visibleBlockedIssues.length === 0 && visibleFailedRuns.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-5 space-y-3">
      <Link
        to="/inbox"
        className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2 text-red-400 border-b border-red-500/10 pb-2 no-underline hover:text-red-300 transition-colors"
      >
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Attention Required
        <span className="inline-flex items-center justify-center rounded-full bg-red-500/20 text-red-300 text-[10px] font-bold min-w-[18px] px-1.5 py-0.5 ml-1">
          {visibleBlockedIssues.length + visibleFailedRuns.length}
        </span>
      </Link>
      <div className="space-y-2">
        {visibleBlockedIssues.slice(0, 5).map((issue) => (
          <div
            key={issue.id}
            className="flex items-center gap-1 rounded-lg border-l-[3px] border-l-red-500 border border-red-500/15 bg-red-500/[0.04] pr-1"
          >
            <Link
              to={`/issues/${issue.identifier ?? issue.id}`}
              className="flex items-center justify-between gap-2 flex-1 min-w-0 px-3 py-2.5 text-sm no-underline text-inherit hover:bg-red-500/10 transition-colors rounded-l-lg"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-red-500"
                  aria-hidden="true"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                    <polygon points="5,1 9,9 1,9" />
                  </svg>
                </span>
                <span className="font-mono text-sm text-muted-foreground shrink-0">
                  {issue.identifier ?? issue.id.slice(0, 8)}
                </span>
                <span className="truncate">{issue.title}</span>
              </div>
              <span className="text-xs text-red-400 font-medium shrink-0">Blocked</span>
            </Link>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDismiss(`issue:${issue.id}`);
              }}
              className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground/70 hover:text-red-400 transition-colors shrink-0"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {visibleFailedRuns.slice(0, 3).map((run) => (
          <div
            key={run.id}
            className="flex items-center gap-1 rounded-lg border-l-[3px] border-l-amber-500 border border-amber-500/15 bg-amber-500/[0.04] pr-1"
          >
            <Link
              to={`/agents/${run.agentId}/runs/${run.id}`}
              className="flex items-center justify-between gap-2 flex-1 min-w-0 px-3 py-2.5 text-sm no-underline text-inherit hover:bg-amber-500/10 transition-colors rounded-l-lg"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-amber-500"
                  aria-hidden="true"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" />
                    <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" />
                  </svg>
                </span>
                <span className="truncate">Run failed - {agentMap.get(run.agentId)?.name ?? "Agent"}</span>
              </div>
              <span className="text-xs text-amber-400 font-medium shrink-0">View run</span>
            </Link>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDismiss(`run:${run.id}`);
              }}
              className="p-1.5 rounded-md hover:bg-amber-500/10 text-muted-foreground/70 hover:text-amber-400 transition-colors shrink-0"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

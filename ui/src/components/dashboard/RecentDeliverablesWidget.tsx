import { useMemo } from "react";
import { Link } from "@/lib/router";
import type { Agent, Issue } from "@ironworksai/shared";
import { cn } from "../../lib/utils";

export function RecentDeliverablesWidget({ issues, agents }: { issues: Issue[]; agents: Agent[] }) {
  const agentName = (id: string | null) => { if (!id) return "Unassigned"; return agents.find((a) => a.id === id)?.name ?? "Unknown"; };
  const deliverables = useMemo(() => issues.filter((i) => i.status === "in_review" || (i.status === "done" && i.completedAt)).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5), [issues]);

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <Link to="/deliverables" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors no-underline">Recent Deliverables</Link>
      {deliverables.length === 0 ? (
        <p className="text-sm text-muted-foreground">No deliverables awaiting review.</p>
      ) : (
        <div className="space-y-2">
          {deliverables.map((issue) => (
            <Link key={issue.id} to={`/issues/${issue.identifier ?? issue.id}`} className="flex items-center gap-2 rounded-md p-2 hover:bg-accent/50 transition-colors no-underline text-inherit">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{issue.title}</p>
                <p className="text-xs text-muted-foreground">{agentName(issue.assigneeAgentId)} - {issue.status === "in_review" ? "In Review" : "Completed"}</p>
              </div>
              <span className={cn("shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium", issue.status === "in_review" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>{issue.status === "in_review" ? "Review" : "Done"}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import { Link } from "@/lib/router";
import { LiveRunWidget } from "../LiveRunWidget";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "../../lib/timeAgo";
import type { RoutineRunSummary } from "@ironworksai/shared";

export function RunsTab({
  hasLiveRun,
  activeIssueId,
  companyId,
  runs,
}: {
  hasLiveRun: boolean;
  activeIssueId: string | undefined;
  companyId: string | undefined;
  runs: RoutineRunSummary[];
}) {
  return (
    <div className="space-y-4">
      {hasLiveRun && activeIssueId && companyId && (
        <LiveRunWidget issueId={activeIssueId} companyId={companyId} />
      )}
      {runs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No runs yet.</p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {runs.map((run) => (
            <div key={run.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="outline" className="shrink-0">{run.source}</Badge>
                <Badge variant={run.status === "failed" ? "destructive" : "secondary"} className="shrink-0">
                  {run.status.replaceAll("_", " ")}
                </Badge>
                {run.trigger && (
                  <span className="text-muted-foreground truncate">{run.trigger.label ?? run.trigger.kind}</span>
                )}
                {run.linkedIssue && (
                  <Link to={`/issues/${run.linkedIssue.identifier ?? run.linkedIssue.id}`} className="text-muted-foreground hover:underline truncate">
                    {run.linkedIssue.identifier ?? run.linkedIssue.id.slice(0, 8)}
                  </Link>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0 ml-2">{timeAgo(run.triggeredAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

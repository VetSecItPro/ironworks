import { relativeTime, formatTokens } from "@/lib/utils";
import { Identity } from "@/components/Identity";
import { formatAction } from "./issue-detail-utils";
import type { IssueCostSummary } from "./issue-detail-utils";
import type { ActivityEvent, Agent } from "@ironworksai/shared";

function ActorIdentity({ evt, agentMap }: { evt: ActivityEvent; agentMap: Map<string, Agent> }) {
  const id = evt.actorId;
  if (evt.actorType === "agent") {
    const agent = agentMap.get(id);
    return <Identity name={agent?.name ?? id.slice(0, 8)} size="sm" />;
  }
  if (evt.actorType === "system") return <Identity name="System" size="sm" />;
  if (evt.actorType === "user") return <Identity name="Board" size="sm" />;
  return <Identity name={id || "Unknown"} size="sm" />;
}

interface IssueActivityTabProps {
  activity: ActivityEvent[] | undefined;
  linkedRunsCount: number;
  issueCostSummary: IssueCostSummary;
  agentMap: Map<string, Agent>;
}

export function IssueActivityTab({ activity, linkedRunsCount, issueCostSummary, agentMap }: IssueActivityTabProps) {
  return (
    <>
      {linkedRunsCount > 0 && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-border">
          <div className="text-sm font-medium text-muted-foreground mb-1">Cost Summary</div>
          {!issueCostSummary.hasCost && !issueCostSummary.hasTokens ? (
            <div className="text-xs text-muted-foreground">No cost data yet.</div>
          ) : (
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground tabular-nums">
              {issueCostSummary.hasCost && (
                <span className="font-medium text-foreground">
                  ${issueCostSummary.cost.toFixed(4)}
                </span>
              )}
              {issueCostSummary.hasTokens && (
                <span>
                  Tokens {formatTokens(issueCostSummary.totalTokens)}
                  {issueCostSummary.cached > 0
                    ? ` (in ${formatTokens(issueCostSummary.input)}, out ${formatTokens(issueCostSummary.output)}, cached ${formatTokens(issueCostSummary.cached)})`
                    : ` (in ${formatTokens(issueCostSummary.input)}, out ${formatTokens(issueCostSummary.output)})`}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {!activity || activity.length === 0 ? (
        <p className="text-xs text-muted-foreground">No activity yet.</p>
      ) : (
        <div className="space-y-1.5">
          {activity.slice(0, 20).map((evt) => (
            <div key={evt.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ActorIdentity evt={evt} agentMap={agentMap} />
              <span>{formatAction(evt.action, evt.details)}</span>
              <span className="ml-auto shrink-0">{relativeTime(evt.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

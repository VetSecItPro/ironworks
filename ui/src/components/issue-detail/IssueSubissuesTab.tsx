import { Link } from "@/lib/router";
import { StatusIcon } from "@/components/StatusIcon";
import { PriorityIcon } from "@/components/PriorityIcon";
import { Identity } from "@/components/Identity";
import type { Agent } from "@ironworksai/shared";

interface ChildIssue {
  id: string;
  identifier?: string | null;
  title: string;
  status: string;
  priority: string;
  assigneeAgentId?: string | null;
}

interface IssueSubissuesTabProps {
  childIssues: ChildIssue[];
  agentMap: Map<string, Agent>;
  locationState: unknown;
}

export function IssueSubissuesTab({ childIssues, agentMap, locationState }: IssueSubissuesTabProps) {
  if (childIssues.length === 0) {
    return <p className="text-xs text-muted-foreground">No sub-issues.</p>;
  }

  return (
    <div className="border border-border rounded-lg divide-y divide-border">
      {childIssues.map((child) => (
        <Link
          key={child.id}
          to={`/issues/${child.identifier ?? child.id}`}
          state={locationState}
          className="flex items-center justify-between px-3 py-2 text-sm hover:bg-accent/20 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <StatusIcon status={child.status} />
            <PriorityIcon priority={child.priority} />
            <span className="font-mono text-muted-foreground shrink-0">
              {child.identifier ?? child.id.slice(0, 8)}
            </span>
            <span className="truncate">{child.title}</span>
          </div>
          {child.assigneeAgentId && (() => {
            const name = agentMap.get(child.assigneeAgentId)?.name;
            return name
              ? <Identity name={name} size="sm" />
              : <span className="text-muted-foreground font-mono">{child.assigneeAgentId.slice(0, 8)}</span>;
          })()}
        </Link>
      ))}
    </div>
  );
}

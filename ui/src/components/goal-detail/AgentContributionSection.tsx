import { useMemo } from "react";
import { Users } from "lucide-react";
import type { Issue, Agent } from "@ironworksai/shared";

export function AgentContributionSection({
  issues,
  agentMap,
}: {
  issues: Issue[];
  agentMap: Map<string, Agent>;
}) {
  const contributions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const issue of issues) {
      if (issue.status === "done" && issue.assigneeAgentId) {
        counts.set(issue.assigneeAgentId, (counts.get(issue.assigneeAgentId) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([agentId, count]) => ({
        agentId,
        name: agentMap.get(agentId)?.name ?? agentId.slice(0, 8),
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [issues, agentMap]);

  if (contributions.length === 0) return null;

  const maxCount = contributions[0].count;

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" />
        Agent Contributions
      </h4>
      <div className="space-y-2">
        {contributions.map((c) => (
          <div key={c.agentId} className="flex items-center gap-2">
            <span className="text-xs w-24 truncate shrink-0">{c.name}</span>
            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${(c.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums w-6 text-right">{c.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

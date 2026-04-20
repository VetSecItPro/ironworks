import type { ActivityEvent, Agent } from "@ironworksai/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { activityApi } from "../../api/activity";
import { agentsApi } from "../../api/agents";
import { issuesApi } from "../../api/issues";
import { queryKeys } from "../../lib/queryKeys";
import { ActivityRow } from "../ActivityRow";

export function ProjectActivityTab({ projectId, companyId }: { projectId: string; companyId: string }) {
  const { data: activity, isLoading } = useQuery({
    queryKey: [...queryKeys.activity(companyId), "project", projectId],
    queryFn: () => activityApi.list(companyId, { entityType: "project", entityId: projectId }),
    enabled: !!companyId && !!projectId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    return map;
  }, [agents]);

  // Also fetch all project-related issue activity
  const { data: issueActivity } = useQuery({
    queryKey: [...queryKeys.issues.listByProject(companyId, projectId), "activity"],
    queryFn: async () => {
      const issues = await issuesApi.list(companyId, { projectId });
      const allActivity: ActivityEvent[] = [];
      // Get activity for each issue in this project (via company activity filtered)
      const companyActivity = await activityApi.list(companyId);
      const projectIssueIds = new Set(issues.map((i) => i.id));
      for (const evt of companyActivity) {
        if (evt.entityType === "issue" && projectIssueIds.has(evt.entityId)) {
          allActivity.push(evt);
        }
        if (evt.entityType === "project" && evt.entityId === projectId) {
          allActivity.push(evt);
        }
      }
      // Build name maps from issues
      for (const i of issues) {
        entityNameMap.set(`issue:${i.id}`, i.identifier ?? i.id.slice(0, 8));
      }
      return allActivity.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    enabled: !!companyId && !!projectId,
  });

  const combinedActivity = useMemo(() => {
    const seen = new Set<string>();
    const merged: ActivityEvent[] = [];
    for (const evt of [...(activity ?? []), ...(issueActivity ?? [])]) {
      if (!seen.has(evt.id)) {
        seen.add(evt.id);
        merged.push(evt);
      }
    }
    return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [activity, issueActivity]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-10 rounded-md" />
        ))}
      </div>
    );
  }

  if (combinedActivity.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No activity recorded for this project yet.</p>;
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
      {combinedActivity.slice(0, 50).map((evt) => (
        <ActivityRow key={evt.id} event={evt} agentMap={agentMap} entityNameMap={entityNameMap} />
      ))}
    </div>
  );
}

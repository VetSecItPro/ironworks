import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { agentsApi } from "../../api/agents";
import { goalProgressApi } from "../../api/goalProgress";
import { goalsApi } from "../../api/goals";
import { heartbeatsApi } from "../../api/heartbeats";
import { issuesApi } from "../../api/issues";
import { queryKeys } from "../../lib/queryKeys";
import { IssuesList } from "../IssuesList";
import type { KanbanGoalInfo } from "../KanbanBoard";

export function ProjectIssuesList({
  projectId,
  companyId,
  goalIds,
}: {
  projectId: string;
  companyId: string;
  goalIds?: string[];
}) {
  const queryClient = useQueryClient();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(companyId),
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId),
    enabled: !!companyId,
    refetchInterval: 5000,
  });

  const liveIssueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of liveRuns ?? []) {
      if (run.issueId) ids.add(run.issueId);
    }
    return ids;
  }, [liveRuns]);

  const {
    data: issues,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.issues.listByProject(companyId, projectId),
    queryFn: () => issuesApi.list(companyId, { projectId }),
    enabled: !!companyId,
  });

  // Goal info for Kanban board header
  const primaryGoalId = goalIds?.[0] ?? null;
  const { data: primaryGoal } = useQuery({
    queryKey: queryKeys.goals.detail(primaryGoalId!),
    queryFn: () => goalsApi.get(primaryGoalId!),
    enabled: !!primaryGoalId,
    staleTime: 30_000,
  });
  const { data: goalProgress } = useQuery({
    queryKey: ["goals", "progress-detail", primaryGoalId],
    queryFn: () => goalProgressApi.detail(primaryGoalId!),
    enabled: !!primaryGoalId,
    staleTime: 30_000,
  });

  const goalInfo: KanbanGoalInfo | null = primaryGoal
    ? {
        title: primaryGoal.title,
        healthStatus: primaryGoal.healthStatus ?? null,
        progressPercent: goalProgress?.progressPercent ?? 0,
      }
    : null;

  const updateIssue = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
    },
  });

  return (
    <IssuesList
      issues={issues ?? []}
      isLoading={isLoading}
      error={error as Error | null}
      agents={agents}
      liveIssueIds={liveIssueIds}
      projectId={projectId}
      viewStateKey={`ironworks:project-view:${projectId}`}
      onUpdateIssue={(id, data) => updateIssue.mutate({ id, data })}
      goalInfo={goalInfo}
    />
  );
}

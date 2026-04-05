import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/queryKeys";
import { dashboardApi } from "../api/dashboard";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { goalsApi } from "../api/goals";
import { routinesApi } from "../api/routines";

/**
 * Prefetch critical data so that navigating between top-level pages feels
 * instant. Runs once when a company is selected and keeps caches warm.
 */
export function usePrefetch(companyId: string | null | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!companyId) return;

    const STALE = 60_000;

    // Prefetch dashboard — ensures switching back to War Room is instant
    queryClient.prefetchQuery({
      queryKey: queryKeys.dashboard(companyId),
      queryFn: () => dashboardApi.summary(companyId),
      staleTime: STALE,
    });

    // Prefetch agents list (used by sidebar, dropdowns, org chart)
    queryClient.prefetchQuery({
      queryKey: queryKeys.agents.list(companyId),
      queryFn: () => agentsApi.list(companyId),
      staleTime: STALE,
    });

    // Prefetch issues list (used by sidebar badge, issues page)
    queryClient.prefetchQuery({
      queryKey: queryKeys.issues.list(companyId),
      queryFn: () => issuesApi.list(companyId),
      staleTime: STALE,
    });

    // Prefetch projects list
    queryClient.prefetchQuery({
      queryKey: queryKeys.projects.list(companyId),
      queryFn: () => projectsApi.list(companyId),
      staleTime: STALE,
    });

    // Prefetch goals list (used by Goals page, Dashboard progress panel)
    queryClient.prefetchQuery({
      queryKey: queryKeys.goals.list(companyId),
      queryFn: () => goalsApi.list(companyId),
      staleTime: STALE,
    });

    // Prefetch routines list (used by Routines page, sidebar)
    queryClient.prefetchQuery({
      queryKey: queryKeys.routines.list(companyId),
      queryFn: () => routinesApi.list(companyId),
      staleTime: STALE,
    });
  }, [companyId, queryClient]);
}

/**
 * Returns an onMouseEnter handler that prefetches detail data for
 * an issue or agent when the user hovers over a link.
 */
export function usePrefetchOnHover() {
  const queryClient = useQueryClient();
  const STALE = 30_000;

  const prefetchIssue = useCallback(
    (issueId: string) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.issues.detail(issueId),
        queryFn: () => issuesApi.get(issueId),
        staleTime: STALE,
      });
    },
    [queryClient],
  );

  const prefetchAgent = useCallback(
    (agentId: string, companyId?: string) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.agents.detail(agentId),
        queryFn: () => agentsApi.get(agentId, companyId),
        staleTime: STALE,
      });
    },
    [queryClient],
  );

  return { prefetchIssue, prefetchAgent };
}

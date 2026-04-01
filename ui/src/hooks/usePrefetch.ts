import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/queryKeys";
import { dashboardApi } from "../api/dashboard";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";

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
  }, [companyId, queryClient]);
}

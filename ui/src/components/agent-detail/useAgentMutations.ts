import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import { trackFeatureUsed } from "../../lib/analytics";
import { agentsApi, type AgentPermissionUpdate } from "../../api/agents";
import { budgetsApi } from "../../api/budgets";
import { queryKeys } from "../../lib/queryKeys";
import type { HeartbeatRun } from "@ironworksai/shared";

interface UseAgentMutationsArgs {
  routeAgentRef: string;
  agentLookupRef: string;
  canonicalAgentRef: string;
  resolvedCompanyId: string | null;
  agent: {
    id: string;
    name: string;
    role: string;
    title: string | null;
    reportsTo: string | null;
    adapterType: string;
    adapterConfig: Record<string, unknown>;
    runtimeConfig: Record<string, unknown>;
    urlKey: string;
  } | null;
}

export function useAgentMutations({
  routeAgentRef,
  agentLookupRef,
  canonicalAgentRef,
  resolvedCompanyId,
  agent,
}: UseAgentMutationsArgs) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState<string | null>(null);

  const agentAction = useMutation({
    mutationFn: async (action: "invoke" | "pause" | "resume" | "terminate") => {
      if (!agentLookupRef) return Promise.reject(new Error("No agent reference"));
      switch (action) {
        case "invoke": return agentsApi.invoke(agentLookupRef, resolvedCompanyId ?? undefined);
        case "pause": return agentsApi.pause(agentLookupRef, resolvedCompanyId ?? undefined);
        case "resume": return agentsApi.resume(agentLookupRef, resolvedCompanyId ?? undefined);
        case "terminate": return agentsApi.terminate(agentLookupRef, resolvedCompanyId ?? undefined);
      }
    },
    onSuccess: (data, action) => {
      if (action === "invoke") trackFeatureUsed("invoke_agent");
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(routeAgentRef) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentLookupRef) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.runtimeState(agentLookupRef) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.taskSessions(agentLookupRef) });
      if (resolvedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(resolvedCompanyId) });
        if (agent?.id) {
          queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(resolvedCompanyId, agent.id) });
        }
      }
      if (action === "invoke" && data && typeof data === "object" && "id" in data) {
        navigate(`/agents/${canonicalAgentRef}/runs/${(data as HeartbeatRun).id}`);
      }
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Action failed");
    },
  });

  const cloneAgent = useMutation({
    mutationFn: async () => {
      if (!agent || !resolvedCompanyId) throw new Error("No agent to clone");
      const cloned = await agentsApi.create(resolvedCompanyId, {
        name: `${agent.name} (Copy)`,
        role: agent.role,
        title: agent.title ?? undefined,
        reportsTo: agent.reportsTo ?? undefined,
        adapterType: agent.adapterType,
        adapterConfig: agent.adapterConfig ?? {},
        runtimeConfig: agent.runtimeConfig ?? {},
      });
      const skillSync = (agent.adapterConfig as Record<string, unknown> | null)?.ironworksSkillSync as { desiredSkills?: string[] } | undefined;
      if (skillSync?.desiredSkills?.length) {
        try {
          await agentsApi.syncSkills(cloned.id, skillSync.desiredSkills, resolvedCompanyId);
        } catch { /* non-fatal */ }
      }
      return cloned;
    },
    onSuccess: (cloned) => {
      setActionError(null);
      if (resolvedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(resolvedCompanyId) });
      }
      navigate(`/agents/${cloned.urlKey ?? cloned.id}`);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Clone failed");
    },
  });

  const budgetMutation = useMutation({
    mutationFn: (amount: number) =>
      budgetsApi.upsertPolicy(resolvedCompanyId!, {
        scopeType: "agent",
        scopeId: agent?.id ?? routeAgentRef,
        amount,
        windowKind: "calendar_month_utc",
      }),
    onSuccess: () => {
      if (!resolvedCompanyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.overview(resolvedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(routeAgentRef) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentLookupRef) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(resolvedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(resolvedCompanyId) });
    },
  });

  const updateIcon = useMutation({
    mutationFn: (icon: string) => agentsApi.update(agentLookupRef, { icon }, resolvedCompanyId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(routeAgentRef) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentLookupRef) });
      if (resolvedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(resolvedCompanyId) });
      }
    },
  });

  const resetTaskSession = useMutation({
    mutationFn: (taskKey: string | null) =>
      agentsApi.resetSession(agentLookupRef, taskKey, resolvedCompanyId ?? undefined),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.runtimeState(agentLookupRef) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.taskSessions(agentLookupRef) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to reset session");
    },
  });

  const updatePermissions = useMutation({
    mutationFn: (permissions: AgentPermissionUpdate) =>
      agentsApi.updatePermissions(agentLookupRef, permissions, resolvedCompanyId ?? undefined),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(routeAgentRef) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentLookupRef) });
      if (resolvedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(resolvedCompanyId) });
      }
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to update permissions");
    },
  });

  return {
    actionError,
    agentAction,
    cloneAgent,
    budgetMutation,
    updateIcon,
    resetTaskSession,
    updatePermissions,
  };
}

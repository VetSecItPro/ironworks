import type { HeartbeatRun, JoinRequest } from "@ironworksai/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import { accessApi } from "../../api/access";
import { agentsApi } from "../../api/agents";
import { approvalsApi } from "../../api/approvals";
import { issuesApi } from "../../api/issues";
import { queryKeys } from "../../lib/queryKeys";
import { syncReadStateToServer } from "./inboxHelpers";

interface UseInboxMutationsParams {
  selectedCompanyId: string | null;
  navigate: NavigateFunction;
  markItemRead: (key: string) => void;
}

export function useInboxMutations({ selectedCompanyId, navigate, markItemRead }: UseInboxMutationsParams) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [retryingRunIds, setRetryingRunIds] = useState<Set<string>>(new Set());
  const [fadingOutIssues, setFadingOutIssues] = useState<Set<string>>(new Set());
  const [archivingIssueIds, setArchivingIssueIds] = useState<Set<string>>(new Set());
  const [fadingNonIssueItems, setFadingNonIssueItems] = useState<Set<string>>(new Set());
  const [archivingNonIssueIds, setArchivingNonIssueIds] = useState<Set<string>>(new Set());
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(new Set());

  const invalidateInboxIssueQueries = () => {
    if (!selectedCompanyId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.listMineByMe(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.listTouchedByMe(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.listUnreadTouchedByMe(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId) });
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.approve(id),
    onSuccess: (_approval, id) => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      navigate(`/approvals/${id}?resolved=approved`);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to approve");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.reject(id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to reject");
    },
  });

  const approveJoinMutation = useMutation({
    mutationFn: (joinRequest: JoinRequest) => accessApi.approveJoinRequest(selectedCompanyId!, joinRequest.id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to approve join request");
    },
  });

  const rejectJoinMutation = useMutation({
    mutationFn: (joinRequest: JoinRequest) => accessApi.rejectJoinRequest(selectedCompanyId!, joinRequest.id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to reject join request");
    },
  });

  const retryRunMutation = useMutation({
    mutationFn: async (run: HeartbeatRun) => {
      const payload: Record<string, unknown> = {};
      const context = run.contextSnapshot as Record<string, unknown> | null;
      if (context) {
        if (typeof context.issueId === "string" && context.issueId) payload.issueId = context.issueId;
        if (typeof context.taskId === "string" && context.taskId) payload.taskId = context.taskId;
        if (typeof context.taskKey === "string" && context.taskKey) payload.taskKey = context.taskKey;
      }
      const result = await agentsApi.wakeup(run.agentId, {
        source: "on_demand",
        triggerDetail: "manual",
        reason: "retry_failed_run",
        payload,
      });
      if (!("id" in result)) {
        throw new Error("Retry was skipped because the agent is not currently invokable.");
      }
      return { newRun: result, originalRun: run };
    },
    onMutate: (run) => {
      setRetryingRunIds((prev) => new Set(prev).add(run.id));
    },
    onSuccess: ({ newRun, originalRun }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(originalRun.companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(originalRun.companyId, originalRun.agentId) });
      navigate(`/agents/${originalRun.agentId}/runs/${newRun.id}`);
    },
    onSettled: (_data, _error, run) => {
      if (!run) return;
      setRetryingRunIds((prev) => {
        const next = new Set(prev);
        next.delete(run.id);
        return next;
      });
    },
  });

  const archiveIssueMutation = useMutation({
    mutationFn: (id: string) => issuesApi.archiveFromInbox(id),
    onMutate: (id) => {
      setActionError(null);
      const el = document.querySelector(`[data-inbox-issue="${id}"]`);
      if (el) {
        (el as HTMLElement).style.transition = "opacity 300ms ease, transform 300ms ease, max-height 300ms ease";
        (el as HTMLElement).style.opacity = "0";
        (el as HTMLElement).style.transform = "translateX(100%)";
        (el as HTMLElement).style.maxHeight = "0";
        (el as HTMLElement).style.overflow = "hidden";
      }
      setArchivingIssueIds((prev) => new Set(prev).add(id));
    },
    onSuccess: () => {
      invalidateInboxIssueQueries();
    },
    onError: (err, id) => {
      setActionError(err instanceof Error ? err.message : "Failed to archive mission");
      setArchivingIssueIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    onSettled: (_data, error, id) => {
      if (error) return;
      window.setTimeout(() => {
        setArchivingIssueIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 500);
    },
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: (ids: string[]) => issuesApi.bulkArchiveFromInbox(selectedCompanyId!, ids),
    onMutate: (ids) => {
      setActionError(null);
      setArchivingIssueIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
    },
    onSuccess: () => {
      setSelectedIssueIds(new Set());
      invalidateInboxIssueQueries();
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to archive selected missions");
      setArchivingIssueIds(new Set());
    },
    onSettled: (_data, error, ids) => {
      if (error) return;
      window.setTimeout(() => {
        setArchivingIssueIds((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.delete(id);
          return next;
        });
      }, 500);
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => {
      syncReadStateToServer(id).catch((err: unknown) => {
        console.error("Failed to sync read state", err instanceof Error ? err.message : err);
      });
      return issuesApi.markRead(id);
    },
    onMutate: (id) => {
      setFadingOutIssues((prev) => new Set(prev).add(id));
    },
    onSuccess: () => {
      invalidateInboxIssueQueries();
    },
    onSettled: (_data, _error, id) => {
      setTimeout(() => {
        setFadingOutIssues((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 300);
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async (issueIds: string[]) => {
      await Promise.all(issueIds.map((issueId) => issuesApi.markRead(issueId)));
    },
    onMutate: (issueIds) => {
      setFadingOutIssues((prev) => {
        const next = new Set(prev);
        for (const issueId of issueIds) next.add(issueId);
        return next;
      });
    },
    onSuccess: () => {
      invalidateInboxIssueQueries();
    },
    onSettled: (_data, _error, issueIds) => {
      setTimeout(() => {
        setFadingOutIssues((prev) => {
          const next = new Set(prev);
          for (const issueId of issueIds) next.delete(issueId);
          return next;
        });
      }, 300);
    },
  });

  const handleMarkNonIssueRead = (key: string) => {
    setFadingNonIssueItems((prev) => new Set(prev).add(key));
    markItemRead(key);
    setTimeout(() => {
      setFadingNonIssueItems((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 300);
  };

  const handleArchiveNonIssue = (key: string, dismiss: (key: string) => void) => {
    setArchivingNonIssueIds((prev) => new Set(prev).add(key));
    setTimeout(() => {
      dismiss(key);
      setArchivingNonIssueIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 200);
  };

  return {
    // Error
    actionError,
    // Mutations
    approveMutation,
    rejectMutation,
    approveJoinMutation,
    rejectJoinMutation,
    retryRunMutation,
    archiveIssueMutation,
    bulkArchiveMutation,
    markReadMutation,
    markAllReadMutation,
    // State
    retryingRunIds,
    fadingOutIssues,
    archivingIssueIds,
    fadingNonIssueItems,
    archivingNonIssueIds,
    selectedIssueIds,
    setSelectedIssueIds,
    // Handlers
    handleMarkNonIssueRead,
    handleArchiveNonIssue,
  };
}

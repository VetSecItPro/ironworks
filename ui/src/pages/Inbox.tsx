import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "../hooks/usePageTitle";
import { approvalsApi } from "../api/approvals";
import { accessApi } from "../api/access";
import { ApiError } from "../api/client";
import { dashboardApi } from "../api/dashboard";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { createIssueDetailLocationState } from "../lib/issueDetailBreadcrumb";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Separator } from "@/components/ui/separator";
import { Inbox as InboxIcon } from "lucide-react";
import {
  getApprovalsForTab,
  getInboxWorkItems,
  getLatestFailedRunsByAgent,
  getRecentTouchedIssues,
  saveLastInboxTab,
  shouldShowInboxSection,
  type InboxApprovalFilter,
  type InboxTab,
} from "../lib/inbox";
import { useDismissedInboxItems, useReadInboxItems } from "../hooks/useInboxBadge";
import { isSnoozed, loadSnoozed, snoozeItem, type SnoozeEntry } from "../components/inbox/inboxSnoozeUtils";
import { readIssueIdFromRun, syncReadStateToServer, INBOX_ISSUE_STATUSES } from "../components/inbox/inboxHelpers";
import { InboxToolbar } from "../components/inbox/InboxToolbar";
import { InboxWorkItemList } from "../components/inbox/InboxWorkItemList";
import { InboxAlerts } from "../components/inbox/InboxAlerts";
import { SmartSuggestionsBanner } from "../components/inbox/SmartSuggestionsBanner";
import type { InboxCategoryFilter, SectionKey } from "../components/inbox/inboxTypes";
import type { JoinRequest, HeartbeatRun, Issue } from "@ironworksai/shared";

export function Inbox() {
  usePageTitle("Inbox");
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [allCategoryFilter, setAllCategoryFilter] = useState<InboxCategoryFilter>("everything");
  const [allApprovalFilter, setAllApprovalFilter] = useState<InboxApprovalFilter>("all");
  const [groupByAgent, setGroupByAgent] = useState(false);
  const [snoozedItems, setSnoozedItems] = useState<Record<string, SnoozeEntry>>(loadSnoozed);
  const { dismissed, dismiss } = useDismissedInboxItems();
  const { readItems, markRead: markItemRead } = useReadInboxItems();

  const handleSnooze = useCallback((key: string, ms: number) => {
    snoozeItem(key, ms);
    setSnoozedItems(loadSnoozed());
  }, []);

  const pathSegment = location.pathname.split("/").pop() ?? "mine";
  const tab: InboxTab =
    pathSegment === "mine" || pathSegment === "recent" || pathSegment === "all" || pathSegment === "unread"
      ? pathSegment
      : "mine";
  const issueLinkState = useMemo(
    () =>
      createIssueDetailLocationState(
        "Inbox",
        `${location.pathname}${location.search}${location.hash}`,
      ),
    [location.pathname, location.search, location.hash],
  );

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Inbox" }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    saveLastInboxTab(tab);
    setSelectedIssueIds(new Set());
  }, [tab]);

  const {
    data: approvals,
    isLoading: isApprovalsLoading,
    error: approvalsError,
  } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!),
    queryFn: () => approvalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const {
    data: joinRequests = [],
    isLoading: isJoinRequestsLoading,
  } = useQuery({
    queryKey: queryKeys.access.joinRequests(selectedCompanyId!),
    queryFn: async () => {
      try {
        return await accessApi.listJoinRequests(selectedCompanyId!, "pending_approval");
      } catch (err) {
        if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
          return [];
        }
        throw err;
      }
    },
    enabled: !!selectedCompanyId,
    retry: false,
  });

  const { data: dashboard, isLoading: isDashboardLoading } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues, isLoading: isIssuesLoading } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const {
    data: mineIssuesRaw = [],
    isLoading: isMineIssuesLoading,
  } = useQuery({
    queryKey: queryKeys.issues.listMineByMe(selectedCompanyId!),
    queryFn: () =>
      issuesApi.list(selectedCompanyId!, {
        touchedByUserId: "me",
        inboxArchivedByUserId: "me",
        status: INBOX_ISSUE_STATUSES,
      }),
    enabled: !!selectedCompanyId,
  });
  const {
    data: touchedIssuesRaw = [],
    isLoading: isTouchedIssuesLoading,
  } = useQuery({
    queryKey: queryKeys.issues.listTouchedByMe(selectedCompanyId!),
    queryFn: () =>
      issuesApi.list(selectedCompanyId!, {
        touchedByUserId: "me",
        status: INBOX_ISSUE_STATUSES,
      }),
    enabled: !!selectedCompanyId,
  });

  const { data: heartbeatRuns, isLoading: isRunsLoading } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const mineIssues = useMemo(() => getRecentTouchedIssues(mineIssuesRaw), [mineIssuesRaw]);
  const touchedIssues = useMemo(() => getRecentTouchedIssues(touchedIssuesRaw), [touchedIssuesRaw]);
  const unreadTouchedIssues = useMemo(
    () => touchedIssues.filter((issue) => issue.isUnreadForMe),
    [touchedIssues],
  );
  const issuesToRender = useMemo(
    () => {
      if (tab === "mine") return mineIssues;
      if (tab === "unread") return unreadTouchedIssues;
      return touchedIssues;
    },
    [tab, mineIssues, touchedIssues, unreadTouchedIssues],
  );

  const agentById = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of agents ?? []) map.set(agent.id, agent.name);
    return map;
  }, [agents]);

  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of issues ?? []) map.set(issue.id, issue);
    return map;
  }, [issues]);

  const failedRuns = useMemo(
    () => getLatestFailedRunsByAgent(heartbeatRuns ?? []).filter((r) => !dismissed.has(`run:${r.id}`)),
    [heartbeatRuns, dismissed],
  );
  const liveIssueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of heartbeatRuns ?? []) {
      if (run.status !== "running" && run.status !== "queued") continue;
      const issueId = readIssueIdFromRun(run);
      if (issueId) ids.add(issueId);
    }
    return ids;
  }, [heartbeatRuns]);

  const approvalsToRender = useMemo(() => {
    let filtered = getApprovalsForTab(approvals ?? [], tab, allApprovalFilter);
    if (tab === "mine") {
      filtered = filtered.filter((a) => !dismissed.has(`approval:${a.id}`));
    }
    return filtered;
  }, [approvals, tab, allApprovalFilter, dismissed]);
  const showJoinRequestsCategory =
    allCategoryFilter === "everything" || allCategoryFilter === "join_requests";
  const showTouchedCategory =
    allCategoryFilter === "everything" || allCategoryFilter === "issues_i_touched";
  const showApprovalsCategory =
    allCategoryFilter === "everything" || allCategoryFilter === "approvals";
  const showFailedRunsCategory =
    allCategoryFilter === "everything" || allCategoryFilter === "failed_runs";
  const showAlertsCategory = allCategoryFilter === "everything" || allCategoryFilter === "alerts";
  const failedRunsForTab = useMemo(() => {
    if (tab === "all" && !showFailedRunsCategory) return [];
    return failedRuns;
  }, [failedRuns, tab, showFailedRunsCategory]);

  const joinRequestsForTab = useMemo(() => {
    if (tab === "all" && !showJoinRequestsCategory) return [];
    if (tab === "mine") return joinRequests.filter((jr) => !dismissed.has(`join:${jr.id}`));
    return joinRequests;
  }, [joinRequests, tab, showJoinRequestsCategory, dismissed]);

  const workItemsRaw = useMemo(
    () =>
      getInboxWorkItems({
        issues: tab === "all" && !showTouchedCategory ? [] : issuesToRender,
        approvals: tab === "all" && !showApprovalsCategory ? [] : approvalsToRender,
        failedRuns: failedRunsForTab,
        joinRequests: joinRequestsForTab,
      }),
    [approvalsToRender, issuesToRender, showApprovalsCategory, showTouchedCategory, tab, failedRunsForTab, joinRequestsForTab],
  );

  // Filter out snoozed items
  const workItemsToRender = useMemo(() => {
    return workItemsRaw.filter((item) => {
      let key: string;
      if (item.kind === "approval") key = `approval:${item.approval.id}`;
      else if (item.kind === "failed_run") key = `run:${item.run.id}`;
      else if (item.kind === "join_request") key = `join:${item.joinRequest.id}`;
      else key = `issue:${item.issue.id}`;
      return !isSnoozed(snoozedItems, key);
    });
  }, [workItemsRaw, snoozedItems]);

  // Group by agent helper
  const groupedByAgent = useMemo(() => {
    if (!groupByAgent) return null;
    const groups = new Map<string, typeof workItemsToRender>();
    for (const item of workItemsToRender) {
      let agentId: string | null = null;
      if (item.kind === "failed_run") agentId = item.run.agentId;
      else if (item.kind === "issue") agentId = item.issue.assigneeAgentId ?? null;
      else if (item.kind === "approval") agentId = item.approval.requestedByAgentId ?? null;
      const groupKey = agentId ?? "__unassigned__";
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push(item);
    }
    return groups;
  }, [groupByAgent, workItemsToRender]);

  const agentName = (id: string | null) => {
    if (!id) return null;
    return agentById.get(id) ?? null;
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
    mutationFn: (joinRequest: JoinRequest) =>
      accessApi.approveJoinRequest(selectedCompanyId!, joinRequest.id),
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
    mutationFn: (joinRequest: JoinRequest) =>
      accessApi.rejectJoinRequest(selectedCompanyId!, joinRequest.id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to reject join request");
    },
  });

  const [retryingRunIds, setRetryingRunIds] = useState<Set<string>>(new Set());

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
      setActionError(err instanceof Error ? err.message : "Failed to archive issue");
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
      setActionError(err instanceof Error ? err.message : "Failed to archive selected issues");
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

  const handleArchiveNonIssue = (key: string) => {
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

  const nonIssueUnreadState = (key: string) => {
    if (tab !== "mine") return null;
    const isRead = readItems.has(key);
    const isFading = fadingNonIssueItems.has(key);
    if (isFading) return "fading" as const;
    if (!isRead) return "visible" as const;
    return "hidden" as const;
  };

  if (!selectedCompanyId) {
    return <EmptyState icon={InboxIcon} message="Select a company to view inbox." />;
  }

  const hasRunFailures = failedRuns.length > 0;
  const showAggregateAgentError = !!dashboard && dashboard.agents.error > 0 && !hasRunFailures && !dismissed.has("alert:agent-errors");
  const showBudgetAlert =
    !!dashboard &&
    dashboard.costs.monthBudgetCents > 0 &&
    dashboard.costs.monthUtilizationPercent >= 80 &&
    !dismissed.has("alert:budget");
  const hasAlerts = showAggregateAgentError || showBudgetAlert;
  const showWorkItemsSection = workItemsToRender.length > 0;
  const showAlertsSection = shouldShowInboxSection({
    tab,
    hasItems: hasAlerts,
    showOnMine: hasAlerts,
    showOnRecent: hasAlerts,
    showOnUnread: hasAlerts,
    showOnAll: showAlertsCategory && hasAlerts,
  });

  const visibleSections = [
    showAlertsSection ? "alerts" : null,
    showWorkItemsSection ? "work_items" : null,
  ].filter((key): key is SectionKey => key !== null);

  const allLoaded =
    !isJoinRequestsLoading &&
    !isApprovalsLoading &&
    !isDashboardLoading &&
    !isIssuesLoading &&
    !isMineIssuesLoading &&
    !isTouchedIssuesLoading &&
    !isRunsLoading;

  const showSeparatorBefore = (key: SectionKey) => visibleSections.indexOf(key) > 0;
  const markAllReadIssues = (tab === "mine" ? mineIssues : unreadTouchedIssues)
    .filter((issue) => issue.isUnreadForMe && !fadingOutIssues.has(issue.id) && !archivingIssueIds.has(issue.id));
  const unreadIssueIds = markAllReadIssues.map((issue) => issue.id);
  const canMarkAllRead = unreadIssueIds.length > 0;

  const selectableIssueIds = useMemo(
    () =>
      tab === "mine"
        ? issuesToRender
            .filter((issue) => !archivingIssueIds.has(issue.id))
            .map((issue) => issue.id)
        : [],
    [tab, issuesToRender, archivingIssueIds],
  );
  const allSelected =
    selectableIssueIds.length > 0 && selectableIssueIds.every((id) => selectedIssueIds.has(id));
  const someSelected = selectedIssueIds.size > 0;

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIssueIds(new Set());
    } else {
      setSelectedIssueIds(new Set(selectableIssueIds));
    }
  };
  const handleToggleIssue = (id: string) => {
    setSelectedIssueIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <InboxToolbar
        tab={tab}
        onTabChange={(value) => navigate(`/inbox/${value}`)}
        canMarkAllRead={canMarkAllRead}
        isMarkingAllRead={markAllReadMutation.isPending}
        onMarkAllRead={() => markAllReadMutation.mutate(unreadIssueIds)}
        selectableIssueIds={selectableIssueIds}
        selectedIssueIds={selectedIssueIds}
        allSelected={allSelected}
        someSelected={someSelected}
        onSelectAll={handleSelectAll}
        isBulkArchiving={bulkArchiveMutation.isPending}
        onBulkArchive={() => bulkArchiveMutation.mutate([...selectedIssueIds])}
        groupByAgent={groupByAgent}
        onToggleGroupByAgent={() => setGroupByAgent(!groupByAgent)}
        allCategoryFilter={allCategoryFilter}
        onCategoryFilterChange={setAllCategoryFilter}
        allApprovalFilter={allApprovalFilter}
        onApprovalFilterChange={setAllApprovalFilter}
        showApprovalsCategory={showApprovalsCategory}
      />

      {/* Smart Suggestions Banner */}
      {tab === "mine" && (() => {
        const doneIssues = issuesToRender.filter((i) => i.status === "done" && !archivingIssueIds.has(i.id));
        const resolvedApprovals = approvalsToRender.filter((a) => a.status === "approved" || a.status === "rejected");
        const autoResolvableCount = doneIssues.length + resolvedApprovals.length;
        return (
          <SmartSuggestionsBanner
            autoResolvableCount={autoResolvableCount}
            isPending={bulkArchiveMutation.isPending}
            onAutoResolve={() => {
              const ids = doneIssues.map((i) => i.id);
              if (ids.length > 0) bulkArchiveMutation.mutate(ids);
              for (const a of resolvedApprovals) {
                dismiss(`approval:${a.id}`);
              }
            }}
          />
        );
      })()}

      {approvalsError && <p role="alert" className="text-sm text-destructive">{approvalsError.message}</p>}
      {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}

      {!allLoaded && visibleSections.length === 0 && (
        <PageSkeleton variant="inbox" />
      )}

      {allLoaded && visibleSections.length === 0 && (
        <EmptyState
          icon={InboxIcon}
          message={
            tab === "mine"
              ? "Inbox zero."
              : tab === "unread"
              ? "No new inbox items."
              : tab === "recent"
                ? "No recent inbox items."
                : "No inbox items match these filters."
          }
        />
      )}

      {showWorkItemsSection && (
        <>
          {showSeparatorBefore("work_items") && <Separator />}
          <InboxWorkItemList
            workItemsToRender={workItemsToRender}
            groupedByAgent={groupedByAgent}
            agentName={agentName}
            tab={tab}
            issueLinkState={issueLinkState}
            issueById={issueById}
            liveIssueIds={liveIssueIds}
            fadingOutIssues={fadingOutIssues}
            archivingIssueIds={archivingIssueIds}
            selectedIssueIds={selectedIssueIds}
            archiveIssueMutation={archiveIssueMutation}
            markReadMutation={markReadMutation}
            archivingNonIssueIds={archivingNonIssueIds}
            retryingRunIds={retryingRunIds}
            approveMutation={approveMutation}
            rejectMutation={rejectMutation}
            approveJoinMutation={approveJoinMutation}
            rejectJoinMutation={rejectJoinMutation}
            nonIssueUnreadState={nonIssueUnreadState}
            handleMarkNonIssueRead={handleMarkNonIssueRead}
            handleArchiveNonIssue={handleArchiveNonIssue}
            handleSnooze={handleSnooze}
            handleToggleIssue={handleToggleIssue}
            onApproveMutate={(id) => approveMutation.mutate(id)}
            onRejectMutate={(id) => rejectMutation.mutate(id)}
            onApproveJoinMutate={(jr) => approveJoinMutation.mutate(jr)}
            onRejectJoinMutate={(jr) => rejectJoinMutation.mutate(jr)}
            onDismiss={dismiss}
            onRetryRun={(run) => retryRunMutation.mutate(run)}
            onArchiveIssue={(id) => archiveIssueMutation.mutate(id)}
            onMarkReadIssue={(id) => markReadMutation.mutate(id)}
          />
        </>
      )}

      {showAlertsSection && dashboard && (
        <>
          {showSeparatorBefore("alerts") && <Separator />}
          <InboxAlerts
            dashboard={dashboard}
            showAggregateAgentError={showAggregateAgentError}
            showBudgetAlert={showBudgetAlert}
            onDismiss={dismiss}
          />
        </>
      )}
    </div>
  );
}

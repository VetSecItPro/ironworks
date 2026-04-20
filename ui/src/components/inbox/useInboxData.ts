import type { Issue } from "@ironworksai/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { accessApi } from "../../api/access";
import { agentsApi } from "../../api/agents";
import { approvalsApi } from "../../api/approvals";
import { ApiError } from "../../api/client";
import { dashboardApi } from "../../api/dashboard";
import { heartbeatsApi } from "../../api/heartbeats";
import { issuesApi } from "../../api/issues";
import {
  getApprovalsForTab,
  getInboxWorkItems,
  getLatestFailedRunsByAgent,
  getRecentTouchedIssues,
  type InboxApprovalFilter,
  type InboxTab,
} from "../../lib/inbox";
import { queryKeys } from "../../lib/queryKeys";
import { INBOX_ISSUE_STATUSES, readIssueIdFromRun } from "./inboxHelpers";
import { isSnoozed, type SnoozeEntry } from "./inboxSnoozeUtils";
import type { InboxCategoryFilter } from "./inboxTypes";

interface UseInboxDataParams {
  selectedCompanyId: string | null;
  tab: InboxTab;
  allCategoryFilter: InboxCategoryFilter;
  allApprovalFilter: InboxApprovalFilter;
  dismissed: Set<string>;
  snoozedItems: Record<string, SnoozeEntry>;
}

export function useInboxData({
  selectedCompanyId,
  tab,
  allCategoryFilter,
  allApprovalFilter,
  dismissed,
  snoozedItems,
}: UseInboxDataParams) {
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const {
    data: approvals,
    isLoading: isApprovalsLoading,
    error: approvalsError,
  } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!),
    queryFn: () => approvalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: joinRequests = [], isLoading: isJoinRequestsLoading } = useQuery({
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

  const { data: mineIssuesRaw = [], isLoading: isMineIssuesLoading } = useQuery({
    queryKey: queryKeys.issues.listMineByMe(selectedCompanyId!),
    queryFn: () =>
      issuesApi.list(selectedCompanyId!, {
        touchedByUserId: "me",
        inboxArchivedByUserId: "me",
        status: INBOX_ISSUE_STATUSES,
      }),
    enabled: !!selectedCompanyId,
  });

  const { data: touchedIssuesRaw = [], isLoading: isTouchedIssuesLoading } = useQuery({
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
  const unreadTouchedIssues = useMemo(() => touchedIssues.filter((issue) => issue.isUnreadForMe), [touchedIssues]);
  const issuesToRender = useMemo(() => {
    if (tab === "mine") return mineIssues;
    if (tab === "unread") return unreadTouchedIssues;
    return touchedIssues;
  }, [tab, mineIssues, touchedIssues, unreadTouchedIssues]);

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

  const showJoinRequestsCategory = allCategoryFilter === "everything" || allCategoryFilter === "join_requests";
  const showTouchedCategory = allCategoryFilter === "everything" || allCategoryFilter === "issues_i_touched";
  const showApprovalsCategory = allCategoryFilter === "everything" || allCategoryFilter === "approvals";
  const showFailedRunsCategory = allCategoryFilter === "everything" || allCategoryFilter === "failed_runs";
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
    [
      approvalsToRender,
      issuesToRender,
      showApprovalsCategory,
      showTouchedCategory,
      tab,
      failedRunsForTab,
      joinRequestsForTab,
    ],
  );

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

  const groupedByAgent = useMemo(() => {
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
  }, [workItemsToRender]);

  const agentName = (id: string | null) => {
    if (!id) return null;
    return agentById.get(id) ?? null;
  };

  const allLoaded =
    !isJoinRequestsLoading &&
    !isApprovalsLoading &&
    !isDashboardLoading &&
    !isIssuesLoading &&
    !isMineIssuesLoading &&
    !isTouchedIssuesLoading &&
    !isRunsLoading;

  return {
    // Raw data
    dashboard,
    approvalsError,
    approvalsToRender,
    // Issues
    mineIssues,
    unreadTouchedIssues,
    issuesToRender,
    issueById,
    liveIssueIds,
    // Runs
    failedRuns,
    // Work items
    workItemsToRender,
    groupedByAgent,
    // Helpers
    agentName,
    showApprovalsCategory,
    showAlertsCategory,
    // Loading
    allLoaded,
  };
}

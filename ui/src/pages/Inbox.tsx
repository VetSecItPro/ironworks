import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "@/lib/router";
import { usePageTitle } from "../hooks/usePageTitle";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { createIssueDetailLocationState } from "../lib/issueDetailBreadcrumb";
import { saveLastInboxTab, shouldShowInboxSection, type InboxApprovalFilter, type InboxTab } from "../lib/inbox";
import { useDismissedInboxItems, useReadInboxItems } from "../hooks/useInboxBadge";
import { loadSnoozed, snoozeItem, type SnoozeEntry } from "../components/inbox/inboxSnoozeUtils";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Separator } from "@/components/ui/separator";
import { Inbox as InboxIcon } from "lucide-react";
import { InboxToolbar } from "../components/inbox/InboxToolbar";
import { InboxWorkItemList } from "../components/inbox/InboxWorkItemList";
import { InboxAlerts } from "../components/inbox/InboxAlerts";
import { SmartSuggestionsBanner } from "../components/inbox/SmartSuggestionsBanner";
import { useInboxData } from "../components/inbox/useInboxData";
import { useInboxMutations } from "../components/inbox/useInboxMutations";
import type { InboxCategoryFilter, SectionKey } from "../components/inbox/inboxTypes";

export function Inbox() {
  usePageTitle("Inbox");
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const location = useLocation();
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

  useEffect(() => {
    setBreadcrumbs([{ label: "Inbox" }]);
  }, [setBreadcrumbs]);

  const mutations = useInboxMutations({ selectedCompanyId, navigate, markItemRead });

  useEffect(() => {
    saveLastInboxTab(tab);
    mutations.setSelectedIssueIds(new Set());
  }, [tab]);

  const data = useInboxData({
    selectedCompanyId,
    tab,
    allCategoryFilter,
    allApprovalFilter,
    dismissed,
    snoozedItems,
  });

  const nonIssueUnreadState = (key: string) => {
    if (tab !== "mine") return null;
    const isRead = readItems.has(key);
    const isFading = mutations.fadingNonIssueItems.has(key);
    if (isFading) return "fading" as const;
    if (!isRead) return "visible" as const;
    return "hidden" as const;
  };

  if (!selectedCompanyId) {
    return <EmptyState icon={InboxIcon} message="Select a company to view inbox." />;
  }

  const hasRunFailures = data.failedRuns.length > 0;
  const showAggregateAgentError = !!data.dashboard && data.dashboard.agents.error > 0 && !hasRunFailures && !dismissed.has("alert:agent-errors");
  const showBudgetAlert =
    !!data.dashboard &&
    data.dashboard.costs.monthBudgetCents > 0 &&
    data.dashboard.costs.monthUtilizationPercent >= 80 &&
    !dismissed.has("alert:budget");
  const hasAlerts = showAggregateAgentError || showBudgetAlert;
  const showWorkItemsSection = data.workItemsToRender.length > 0;
  const showAlertsSection = shouldShowInboxSection({
    tab,
    hasItems: hasAlerts,
    showOnMine: hasAlerts,
    showOnRecent: hasAlerts,
    showOnUnread: hasAlerts,
    showOnAll: data.showAlertsCategory && hasAlerts,
  });

  const visibleSections = [
    showAlertsSection ? "alerts" : null,
    showWorkItemsSection ? "work_items" : null,
  ].filter((key): key is SectionKey => key !== null);

  const showSeparatorBefore = (key: SectionKey) => visibleSections.indexOf(key) > 0;
  const markAllReadIssues = (tab === "mine" ? data.mineIssues : data.unreadTouchedIssues)
    .filter((issue) => issue.isUnreadForMe && !mutations.fadingOutIssues.has(issue.id) && !mutations.archivingIssueIds.has(issue.id));
  const unreadIssueIds = markAllReadIssues.map((issue) => issue.id);
  const canMarkAllRead = unreadIssueIds.length > 0;

  const selectableIssueIds = useMemo(
    () =>
      tab === "mine"
        ? data.issuesToRender
            .filter((issue) => !mutations.archivingIssueIds.has(issue.id))
            .map((issue) => issue.id)
        : [],
    [tab, data.issuesToRender, mutations.archivingIssueIds],
  );
  const allSelected =
    selectableIssueIds.length > 0 && selectableIssueIds.every((id) => mutations.selectedIssueIds.has(id));
  const someSelected = mutations.selectedIssueIds.size > 0;

  const handleSelectAll = () => {
    if (allSelected) {
      mutations.setSelectedIssueIds(new Set());
    } else {
      mutations.setSelectedIssueIds(new Set(selectableIssueIds));
    }
  };
  const handleToggleIssue = (id: string) => {
    mutations.setSelectedIssueIds((prev) => {
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
        isMarkingAllRead={mutations.markAllReadMutation.isPending}
        onMarkAllRead={() => mutations.markAllReadMutation.mutate(unreadIssueIds)}
        selectableIssueIds={selectableIssueIds}
        selectedIssueIds={mutations.selectedIssueIds}
        allSelected={allSelected}
        someSelected={someSelected}
        onSelectAll={handleSelectAll}
        isBulkArchiving={mutations.bulkArchiveMutation.isPending}
        onBulkArchive={() => mutations.bulkArchiveMutation.mutate([...mutations.selectedIssueIds])}
        groupByAgent={groupByAgent}
        onToggleGroupByAgent={() => setGroupByAgent(!groupByAgent)}
        allCategoryFilter={allCategoryFilter}
        onCategoryFilterChange={setAllCategoryFilter}
        allApprovalFilter={allApprovalFilter}
        onApprovalFilterChange={setAllApprovalFilter}
        showApprovalsCategory={data.showApprovalsCategory}
      />

      {/* Smart Suggestions Banner */}
      {tab === "mine" && (() => {
        const doneIssues = data.issuesToRender.filter((i) => i.status === "done" && !mutations.archivingIssueIds.has(i.id));
        const resolvedApprovals = data.approvalsToRender.filter((a) => a.status === "approved" || a.status === "rejected");
        const autoResolvableCount = doneIssues.length + resolvedApprovals.length;
        return (
          <SmartSuggestionsBanner
            autoResolvableCount={autoResolvableCount}
            isPending={mutations.bulkArchiveMutation.isPending}
            onAutoResolve={() => {
              const ids = doneIssues.map((i) => i.id);
              if (ids.length > 0) mutations.bulkArchiveMutation.mutate(ids);
              for (const a of resolvedApprovals) {
                dismiss(`approval:${a.id}`);
              }
            }}
          />
        );
      })()}

      {data.approvalsError && <p role="alert" className="text-sm text-destructive">{data.approvalsError.message}</p>}
      {mutations.actionError && <p role="alert" className="text-sm text-destructive">{mutations.actionError}</p>}

      {!data.allLoaded && visibleSections.length === 0 && (
        <PageSkeleton variant="inbox" />
      )}

      {data.allLoaded && visibleSections.length === 0 && (
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
            workItemsToRender={data.workItemsToRender}
            groupedByAgent={groupByAgent ? data.groupedByAgent : null}
            agentName={data.agentName}
            tab={tab}
            issueLinkState={issueLinkState}
            issueById={data.issueById}
            liveIssueIds={data.liveIssueIds}
            fadingOutIssues={mutations.fadingOutIssues}
            archivingIssueIds={mutations.archivingIssueIds}
            selectedIssueIds={mutations.selectedIssueIds}
            archiveIssueMutation={mutations.archiveIssueMutation}
            markReadMutation={mutations.markReadMutation}
            archivingNonIssueIds={mutations.archivingNonIssueIds}
            retryingRunIds={mutations.retryingRunIds}
            approveMutation={mutations.approveMutation}
            rejectMutation={mutations.rejectMutation}
            approveJoinMutation={mutations.approveJoinMutation}
            rejectJoinMutation={mutations.rejectJoinMutation}
            nonIssueUnreadState={nonIssueUnreadState}
            handleMarkNonIssueRead={mutations.handleMarkNonIssueRead}
            handleArchiveNonIssue={(key) => mutations.handleArchiveNonIssue(key, dismiss)}
            handleSnooze={handleSnooze}
            handleToggleIssue={handleToggleIssue}
            onApproveMutate={(id) => mutations.approveMutation.mutate(id)}
            onRejectMutate={(id) => mutations.rejectMutation.mutate(id)}
            onApproveJoinMutate={(jr) => mutations.approveJoinMutation.mutate(jr)}
            onRejectJoinMutate={(jr) => mutations.rejectJoinMutation.mutate(jr)}
            onDismiss={dismiss}
            onRetryRun={(run) => mutations.retryRunMutation.mutate(run)}
            onArchiveIssue={(id) => mutations.archiveIssueMutation.mutate(id)}
            onMarkReadIssue={(id) => mutations.markReadMutation.mutate(id)}
          />
        </>
      )}

      {showAlertsSection && data.dashboard && (
        <>
          {showSeparatorBefore("alerts") && <Separator />}
          <InboxAlerts
            dashboard={data.dashboard}
            showAggregateAgentError={showAggregateAgentError}
            showBudgetAlert={showBudgetAlert}
            onDismiss={dismiss}
          />
        </>
      )}
    </div>
  );
}

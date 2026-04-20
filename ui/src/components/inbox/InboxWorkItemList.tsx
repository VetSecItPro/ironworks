import type { HeartbeatRun, Issue } from "@ironworksai/shared";
import { Checkbox } from "@/components/ui/checkbox";
import type { InboxWorkItem } from "../../lib/inbox";
import { timeAgo } from "../../lib/timeAgo";
import { cn } from "../../lib/utils";
import { IssueRow } from "../IssueRow";
import { StatusIcon } from "../StatusIcon";
import { SwipeToArchive } from "../SwipeToArchive";
import { ApprovalInboxRow } from "./ApprovalInboxRow";
import { FailedRunInboxRow } from "./FailedRunInboxRow";
import { getSeverityBorderClass } from "./inboxHelpers";
import type { NonIssueUnreadState } from "./inboxTypes";
import { JoinRequestInboxRow } from "./JoinRequestInboxRow";

interface InboxWorkItemListProps {
  workItemsToRender: InboxWorkItem[];
  groupedByAgent: Map<string, InboxWorkItem[]> | null;
  agentName: (id: string | null) => string | null;
  tab: string;
  issueLinkState: unknown;
  // Issue state
  issueById: Map<string, Issue>;
  liveIssueIds: Set<string>;
  fadingOutIssues: Set<string>;
  archivingIssueIds: Set<string>;
  selectedIssueIds: Set<string>;
  archiveIssueMutation: { isPending: boolean };
  markReadMutation: { isPending: boolean };
  // Non-issue state
  archivingNonIssueIds: Set<string>;
  retryingRunIds: Set<string>;
  approveMutation: { isPending: boolean };
  rejectMutation: { isPending: boolean };
  approveJoinMutation: { isPending: boolean };
  rejectJoinMutation: { isPending: boolean };
  // Handlers
  nonIssueUnreadState: (key: string) => NonIssueUnreadState;
  handleMarkNonIssueRead: (key: string) => void;
  handleArchiveNonIssue: (key: string) => void;
  handleSnooze: (key: string, ms: number) => void;
  handleToggleIssue: (id: string) => void;
  onApproveMutate: (id: string) => void;
  onRejectMutate: (id: string) => void;
  onApproveJoinMutate: (joinRequest: import("@ironworksai/shared").JoinRequest) => void;
  onRejectJoinMutate: (joinRequest: import("@ironworksai/shared").JoinRequest) => void;
  onDismiss: (key: string) => void;
  onRetryRun: (run: HeartbeatRun) => void;
  onArchiveIssue: (id: string) => void;
  onMarkReadIssue: (id: string) => void;
}

export function InboxWorkItemList({
  workItemsToRender,
  groupedByAgent,
  agentName,
  tab,
  issueLinkState,
  issueById,
  liveIssueIds,
  fadingOutIssues,
  archivingIssueIds,
  selectedIssueIds,
  archiveIssueMutation,
  markReadMutation: _markReadMutation,
  archivingNonIssueIds,
  retryingRunIds,
  approveMutation,
  rejectMutation,
  approveJoinMutation,
  rejectJoinMutation,
  nonIssueUnreadState,
  handleMarkNonIssueRead,
  handleArchiveNonIssue,
  handleSnooze,
  handleToggleIssue,
  onApproveMutate,
  onRejectMutate,
  onApproveJoinMutate,
  onRejectJoinMutate,
  onDismiss,
  onRetryRun,
  onArchiveIssue,
  onMarkReadIssue,
}: InboxWorkItemListProps) {
  const isMineTab = tab === "mine";

  function renderWorkItem(item: InboxWorkItem) {
    if (item.kind === "approval") {
      const approvalKey = `approval:${item.approval.id}`;
      const isArchiving = archivingNonIssueIds.has(approvalKey);
      const row = (
        <ApprovalInboxRow
          key={approvalKey}
          approval={item.approval}
          requesterName={agentName(item.approval.requestedByAgentId)}
          onApprove={() => onApproveMutate(item.approval.id)}
          onReject={() => onRejectMutate(item.approval.id)}
          isPending={approveMutation.isPending || rejectMutation.isPending}
          unreadState={nonIssueUnreadState(approvalKey)}
          onMarkRead={() => handleMarkNonIssueRead(approvalKey)}
          onArchive={isMineTab ? () => handleArchiveNonIssue(approvalKey) : undefined}
          archiveDisabled={isArchiving}
          onSnooze={handleSnooze}
          snoozeKey={approvalKey}
          className={
            isArchiving
              ? "pointer-events-none -translate-x-4 scale-[0.98] opacity-0 transition-all duration-200 ease-out"
              : "transition-all duration-200 ease-out"
          }
        />
      );
      return isMineTab ? (
        <SwipeToArchive key={approvalKey} disabled={isArchiving} onArchive={() => handleArchiveNonIssue(approvalKey)}>
          {row}
        </SwipeToArchive>
      ) : (
        row
      );
    }

    if (item.kind === "failed_run") {
      const runKey = `run:${item.run.id}`;
      const isArchiving = archivingNonIssueIds.has(runKey);
      const row = (
        <FailedRunInboxRow
          key={runKey}
          run={item.run}
          issueById={issueById}
          agentName={agentName(item.run.agentId)}
          issueLinkState={issueLinkState}
          onDismiss={() => onDismiss(runKey)}
          onRetry={() => onRetryRun(item.run)}
          isRetrying={retryingRunIds.has(item.run.id)}
          unreadState={nonIssueUnreadState(runKey)}
          onMarkRead={() => handleMarkNonIssueRead(runKey)}
          onArchive={isMineTab ? () => handleArchiveNonIssue(runKey) : undefined}
          archiveDisabled={isArchiving}
          onSnooze={handleSnooze}
          snoozeKey={runKey}
          className={
            isArchiving
              ? "pointer-events-none -translate-x-4 scale-[0.98] opacity-0 transition-all duration-200 ease-out"
              : "transition-all duration-200 ease-out"
          }
        />
      );
      return isMineTab ? (
        <SwipeToArchive key={runKey} disabled={isArchiving} onArchive={() => handleArchiveNonIssue(runKey)}>
          {row}
        </SwipeToArchive>
      ) : (
        row
      );
    }

    if (item.kind === "join_request") {
      const joinKey = `join:${item.joinRequest.id}`;
      const isArchiving = archivingNonIssueIds.has(joinKey);
      const row = (
        <JoinRequestInboxRow
          key={joinKey}
          joinRequest={item.joinRequest}
          onApprove={() => onApproveJoinMutate(item.joinRequest)}
          onReject={() => onRejectJoinMutate(item.joinRequest)}
          isPending={approveJoinMutation.isPending || rejectJoinMutation.isPending}
          unreadState={nonIssueUnreadState(joinKey)}
          onMarkRead={() => handleMarkNonIssueRead(joinKey)}
          onArchive={isMineTab ? () => handleArchiveNonIssue(joinKey) : undefined}
          archiveDisabled={isArchiving}
          onSnooze={handleSnooze}
          snoozeKey={joinKey}
          className={
            isArchiving
              ? "pointer-events-none -translate-x-4 scale-[0.98] opacity-0 transition-all duration-200 ease-out"
              : "transition-all duration-200 ease-out"
          }
        />
      );
      return isMineTab ? (
        <SwipeToArchive key={joinKey} disabled={isArchiving} onArchive={() => handleArchiveNonIssue(joinKey)}>
          {row}
        </SwipeToArchive>
      ) : (
        row
      );
    }

    const issue = item.issue;
    const issueSnoozeKey = `issue:${issue.id}`;
    const isUnread = issue.isUnreadForMe && !fadingOutIssues.has(issue.id);
    const isFading = fadingOutIssues.has(issue.id);
    const isArchiving = archivingIssueIds.has(issue.id);
    const isSelected = selectedIssueIds.has(issue.id);
    const row = (
      <IssueRow
        key={issueSnoozeKey}
        issue={issue}
        issueLinkState={issueLinkState}
        className={cn(
          isArchiving
            ? "pointer-events-none -translate-x-4 scale-[0.98] opacity-0 transition-all duration-200 ease-out"
            : "transition-all duration-200 ease-out",
          isSelected && "list-item-selected",
          getSeverityBorderClass({ kind: "issue", status: issue.status }),
        )}
        desktopMetaLeading={
          <>
            <span className="hidden shrink-0 sm:inline-flex">
              <StatusIcon status={issue.status} />
            </span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {issue.identifier ?? issue.id.slice(0, 8)}
            </span>
            {liveIssueIds.has(issue.id) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 sm:gap-1.5 sm:px-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                </span>
                <span className="hidden text-[11px] font-medium text-blue-600 dark:text-blue-400 sm:inline">Live</span>
              </span>
            )}
          </>
        }
        mobileMeta={
          issue.lastExternalCommentAt
            ? `commented ${timeAgo(issue.lastExternalCommentAt)}`
            : `updated ${timeAgo(issue.updatedAt)}`
        }
        unreadState={isUnread ? "visible" : isFading ? "fading" : "hidden"}
        onMarkRead={() => onMarkReadIssue(issue.id)}
        onArchive={isMineTab ? () => onArchiveIssue(issue.id) : undefined}
        archiveDisabled={isArchiving || archiveIssueMutation.isPending}
        trailingMeta={
          issue.lastExternalCommentAt
            ? `commented ${timeAgo(issue.lastExternalCommentAt)}`
            : `updated ${timeAgo(issue.updatedAt)}`
        }
      />
    );

    const wrappedRow = isMineTab ? (
      <SwipeToArchive
        key={issueSnoozeKey}
        disabled={isArchiving || archiveIssueMutation.isPending}
        onArchive={() => onArchiveIssue(issue.id)}
      >
        {row}
      </SwipeToArchive>
    ) : (
      row
    );

    return isMineTab ? (
      <div key={`issue-sel:${issue.id}`} className="group/sel relative">
        {wrappedRow}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleToggleIssue(issue.id);
          }}
          className={cn(
            "absolute left-0 top-0 hidden h-full w-7 items-center justify-center sm:flex",
            isSelected ? "opacity-100" : "opacity-0 group-hover/sel:opacity-100",
          )}
          aria-label={isSelected ? "Deselect issue" : "Select issue"}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => handleToggleIssue(issue.id)}
            className="h-3.5 w-3.5 pointer-events-none"
            aria-hidden="true"
          />
        </button>
      </div>
    ) : (
      wrappedRow
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {
        (groupedByAgent && groupedByAgent.size > 0
          ? Array.from(groupedByAgent.entries()).map(([groupKey, groupItems]) => (
              <div key={groupKey}>
                <div className="bg-muted/40 px-4 py-1.5 text-xs font-medium text-muted-foreground border-b border-border">
                  {groupKey === "__unassigned__" ? "Unassigned" : (agentName(groupKey) ?? groupKey.slice(0, 8))}
                </div>
                {groupItems.map((item) => renderWorkItem(item))}
              </div>
            ))
          : workItemsToRender.map((item) => renderWorkItem(item))) as React.ReactNode
      }
    </div>
  );
}

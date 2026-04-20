import type { Approval } from "@ironworksai/shared";
import { X } from "lucide-react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router";
import { ACTIONABLE_APPROVAL_STATUSES } from "../../lib/inbox";
import { timeAgo } from "../../lib/timeAgo";
import { cn } from "../../lib/utils";
import { approvalLabel, defaultTypeIcon, typeIcon } from "../ApprovalPayload";
import { approvalStatusLabel, getSeverityBorderClass } from "./inboxHelpers";
import type { NonIssueUnreadState } from "./inboxTypes";
import { SnoozeButton } from "./SnoozeButton";

export const ApprovalInboxRow = memo(function ApprovalInboxRow({
  approval,
  requesterName,
  onApprove,
  onReject,
  isPending,
  unreadState = null,
  onMarkRead,
  onArchive,
  archiveDisabled,
  className,
  onSnooze,
  snoozeKey,
}: {
  approval: Approval;
  requesterName: string | null;
  onApprove: () => void;
  onReject: () => void;
  isPending: boolean;
  unreadState?: NonIssueUnreadState;
  onMarkRead?: () => void;
  onArchive?: () => void;
  archiveDisabled?: boolean;
  className?: string;
  onSnooze?: (key: string, ms: number) => void;
  snoozeKey?: string;
}) {
  const Icon = typeIcon[approval.type] ?? defaultTypeIcon;
  const label = approvalLabel(approval.type, approval.payload as Record<string, unknown> | null);
  const showResolutionButtons =
    approval.type !== "budget_override_required" && ACTIONABLE_APPROVAL_STATUSES.has(approval.status);
  const showUnreadSlot = unreadState !== null;
  const showUnreadDot = unreadState === "visible" || unreadState === "fading";

  return (
    <div
      className={cn(
        "group border-b border-border px-2 py-2.5 last:border-b-0 sm:px-1 sm:pr-3 sm:py-2",
        getSeverityBorderClass({ kind: "approval" }),
        className,
      )}
    >
      <div className="flex items-start gap-2 sm:items-center">
        {showUnreadSlot ? (
          <span className="hidden sm:inline-flex h-4 w-4 shrink-0 items-center justify-center self-center">
            {showUnreadDot ? (
              <button
                type="button"
                onClick={onMarkRead}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-blue-500/20"
                aria-label="Mark as read"
              >
                <span
                  className={cn(
                    "block h-2 w-2 rounded-full bg-blue-600 transition-opacity duration-300 dark:bg-blue-400",
                    unreadState === "fading" ? "opacity-0" : "opacity-100",
                  )}
                />
              </button>
            ) : onArchive ? (
              <button
                type="button"
                onClick={onArchive}
                disabled={archiveDisabled}
                className="inline-flex h-4 w-4 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-30"
                aria-label="Dismiss from inbox"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="inline-flex h-4 w-4" aria-hidden="true" />
            )}
          </span>
        ) : null}
        <Link
          to={`/approvals/${approval.id}`}
          className="flex min-w-0 flex-1 items-start gap-2 no-underline text-inherit transition-colors hover:bg-accent/50"
        >
          {!showUnreadSlot && <span className="hidden h-2 w-2 shrink-0 sm:inline-flex" aria-hidden="true" />}
          <span className="hidden h-3.5 w-3.5 shrink-0 sm:inline-flex" aria-hidden="true" />
          <span className="mt-0.5 shrink-0 rounded-md bg-muted p-1.5 sm:mt-0">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-sm font-medium sm:truncate sm:line-clamp-none">{label}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="capitalize">{approvalStatusLabel(approval.status)}</span>
              {requesterName ? <span>requested by {requesterName}</span> : null}
              <span>updated {timeAgo(approval.updatedAt)}</span>
            </span>
          </span>
        </Link>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {showResolutionButtons ? (
            <>
              <Button
                size="sm"
                className="h-8 bg-green-600 dark:bg-green-700 px-3 text-white hover:bg-green-500 dark:hover:bg-green-600"
                onClick={onApprove}
                disabled={isPending}
              >
                Approve
              </Button>
              <Button variant="destructive" size="sm" className="h-8 px-3" onClick={onReject} disabled={isPending}>
                Reject
              </Button>
            </>
          ) : null}
          {onSnooze && snoozeKey && <SnoozeButton itemKey={snoozeKey} onSnooze={onSnooze} />}
        </div>
      </div>
      {showResolutionButtons ? (
        <div className="mt-3 flex gap-2 sm:hidden">
          <Button
            size="sm"
            className="h-8 bg-green-600 dark:bg-green-700 px-3 text-white hover:bg-green-500 dark:hover:bg-green-600"
            onClick={onApprove}
            disabled={isPending}
          >
            Approve
          </Button>
          <Button variant="destructive" size="sm" className="h-8 px-3" onClick={onReject} disabled={isPending}>
            Reject
          </Button>
        </div>
      ) : null}
    </div>
  );
});

/**
 * Inbox domain types
 *
 * Types shared between the Inbox page, inbox sub-components,
 * and the sidebar badge logic.
 */

import type { Approval, HeartbeatRun, Issue, JoinRequest } from "@ironworksai/shared";

export type InboxTab = "mine" | "recent" | "unread" | "all";
export type InboxApprovalFilter = "all" | "actionable" | "resolved";

export type InboxWorkItem =
  | { kind: "issue"; timestamp: number; issue: Issue }
  | { kind: "approval"; timestamp: number; approval: Approval }
  | { kind: "failed_run"; timestamp: number; run: HeartbeatRun }
  | { kind: "join_request"; timestamp: number; joinRequest: JoinRequest };

export interface InboxBadgeData {
  inbox: number;
  approvals: number;
  failedRuns: number;
  joinRequests: number;
  mineIssues: number;
  alerts: number;
}

export type InboxCategoryFilter =
  | "everything"
  | "issues_i_touched"
  | "join_requests"
  | "approvals"
  | "failed_runs"
  | "alerts";

export type SectionKey = "work_items" | "alerts";

export type NonIssueUnreadState = "visible" | "fading" | "hidden" | null;

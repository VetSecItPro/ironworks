// Shared local types for inbox components

export type InboxCategoryFilter =
  | "everything"
  | "issues_i_touched"
  | "join_requests"
  | "approvals"
  | "failed_runs"
  | "alerts";

export type SectionKey = "work_items" | "alerts";

export type NonIssueUnreadState = "visible" | "fading" | "hidden" | null;

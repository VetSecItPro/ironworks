import type { Approval, HeartbeatRun } from "@ironworksai/shared";

// Severity border colors
export function getSeverityBorderClass(item: { kind: string; status?: string }): string {
  if (item.kind === "failed_run") return "border-l-[3px] border-l-red-500";
  if (item.kind === "join_request") return "border-l-[3px] border-l-blue-500";
  if (item.kind === "approval") return "border-l-[3px] border-l-amber-500";
  if (item.kind === "issue") {
    const status = item.status ?? "";
    if (status === "blocked") return "border-l-[3px] border-l-red-500";
    if (status === "in_progress" || status === "in_review") return "border-l-[3px] border-l-amber-500";
    if (status === "done") return "border-l-[3px] border-l-green-500";
    return "border-l-[3px] border-l-blue-500";
  }
  return "border-l-[3px] border-l-blue-500";
}

export function firstNonEmptyLine(value: string | null | undefined): string | null {
  if (!value) return null;
  const line = value
    .split("\n")
    .map((chunk) => chunk.trim())
    .find(Boolean);
  return line ?? null;
}

export function runFailureMessage(run: HeartbeatRun): string {
  return firstNonEmptyLine(run.error) ?? firstNonEmptyLine(run.stderrExcerpt) ?? "Run exited with an error.";
}

export function approvalStatusLabel(status: Approval["status"]): string {
  return status.replaceAll("_", " ");
}

export function readIssueIdFromRun(run: HeartbeatRun): string | null {
  const context = run.contextSnapshot;
  if (!context) return null;

  const issueId = context["issueId"];
  if (typeof issueId === "string" && issueId.length > 0) return issueId;

  const taskId = context["taskId"];
  if (typeof taskId === "string" && taskId.length > 0) return taskId;

  return null;
}

export const INBOX_ISSUE_STATUSES = "backlog,todo,in_progress,in_review,blocked,done";

// Server-side read state sync
export async function syncReadStateToServer(issueId: string): Promise<void> {
  try {
    await fetch(`/api/issues/${issueId}/read`, { method: "POST" });
  } catch {
    // Server unavailable - localStorage fallback already handles this
  }
}

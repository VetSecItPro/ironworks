export const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  review: { label: "Pending Review", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" },
  delivered: { label: "Delivered", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  revision_requested: { label: "Revision Requested", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
};

export const DOC_TYPE_LABELS: Record<string, string> = {
  "weekly-report": "Weekly Report",
  "monthly-report": "Monthly Report",
  "board-packet": "Board Packet",
  "post-mortem": "Post-Mortem",
  "decision": "Decision",
  "meeting-minutes": "Meeting Minutes",
  "client-update": "Client Update",
  "retrospective": "Retrospective",
};

export function formatDeliverableDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

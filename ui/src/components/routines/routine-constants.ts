import { AlertTriangle } from "lucide-react";

export const concurrencyPolicies = ["coalesce_if_active", "always_enqueue", "skip_if_active"];
export const catchUpPolicies = ["skip_missed", "enqueue_missed_with_cap"];
export const concurrencyPolicyDescriptions: Record<string, string> = {
  coalesce_if_active: "If a run is already active, keep just one follow-up run queued.",
  always_enqueue: "Queue every trigger occurrence, even if the routine is already running.",
  skip_if_active: "Drop new trigger occurrences while a run is still active.",
};
export const catchUpPolicyDescriptions: Record<string, string> = {
  skip_missed: "Ignore windows that were missed while the scheduler or routine was paused.",
  enqueue_missed_with_cap: "Catch up missed schedule windows in capped batches after recovery.",
};

export function autoResizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

export function formatLastRunTimestamp(value: Date | string | null | undefined) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export function nextRoutineStatus(currentStatus: string, enabled: boolean) {
  if (currentStatus === "archived" && enabled) return "active";
  return enabled ? "active" : "paused";
}

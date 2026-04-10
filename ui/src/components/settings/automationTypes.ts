export type Trigger =
  | "issue_created"
  | "status_changed"
  | "agent_failed"
  | "budget_threshold_reached";

export type Action =
  | "assign_agent"
  | "change_status"
  | "send_notification"
  | "create_issue";

export interface AutomationRule {
  id: string;
  name: string;
  trigger: Trigger;
  triggerValue: string;
  action: Action;
  actionValue: string;
  enabled: boolean;
  createdAt: string;
}

export const TRIGGER_OPTIONS: { value: Trigger; label: string; hint: string }[] = [
  {
    value: "issue_created",
    label: "Issue created",
    hint: "Fires when any new issue is created",
  },
  {
    value: "status_changed",
    label: "Status changed",
    hint: "Fires when an issue status changes to a specified value",
  },
  {
    value: "agent_failed",
    label: "Agent failed",
    hint: "Fires when an agent run ends in an error state",
  },
  {
    value: "budget_threshold_reached",
    label: "Budget threshold reached",
    hint: "Fires when spending exceeds a dollar amount",
  },
];

export const ACTION_OPTIONS: { value: Action; label: string; hint: string }[] = [
  {
    value: "assign_agent",
    label: "Assign agent",
    hint: "Auto-assign an agent to the triggering issue",
  },
  {
    value: "change_status",
    label: "Change status",
    hint: "Update the issue status automatically",
  },
  {
    value: "send_notification",
    label: "Send notification",
    hint: "Send an inbox notification to all team members",
  },
  {
    value: "create_issue",
    label: "Create issue",
    hint: "Create a follow-up issue automatically",
  },
];

export const TRIGGER_VALUE_LABELS: Record<Trigger, string> = {
  issue_created: "Project filter (optional)",
  status_changed: "Target status (e.g. in_progress, done)",
  agent_failed: "Agent name filter (optional)",
  budget_threshold_reached: "Threshold in dollars (e.g. 50)",
};

export const ACTION_VALUE_LABELS: Record<Action, string> = {
  assign_agent: "Agent name to assign",
  change_status: "New status value",
  send_notification: "Notification message",
  create_issue: "Issue title",
};

export const STORAGE_KEY = "ironworks:automation-rules";

export function loadRules(): AutomationRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRules(rules: AutomationRule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

export function generateId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

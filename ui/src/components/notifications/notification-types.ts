export interface AppNotification {
  id: string;
  type: "mention" | "approval" | "agent_failure" | "task_complete" | "budget_alert" | "comment" | "system";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  href?: string;
  /** Entity ID for mute-per-entity */
  entityId?: string;
  entityType?: "agent" | "project" | "channel" | "issue";
}

export type DigestFrequency = "realtime" | "hourly" | "daily";

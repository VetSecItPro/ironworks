export interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: string;
}

export interface DeliveryLogEntry {
  id: string;
  webhookId: string;
  event: string;
  status: number;
  duration: number;
  timestamp: string;
  payload: string;
}

export const AVAILABLE_EVENTS = [
  { id: "issue.created", label: "Issue Created" },
  { id: "issue.updated", label: "Issue Updated" },
  { id: "issue.completed", label: "Issue Completed" },
  { id: "issue.cancelled", label: "Issue Cancelled" },
  { id: "agent.created", label: "Agent Created" },
  { id: "agent.failed", label: "Agent Failed" },
  { id: "agent.paused", label: "Agent Paused" },
  { id: "run.started", label: "Run Started" },
  { id: "run.completed", label: "Run Completed" },
  { id: "run.failed", label: "Run Failed" },
  { id: "approval.requested", label: "Approval Requested" },
  { id: "approval.approved", label: "Approval Approved" },
  { id: "approval.rejected", label: "Approval Rejected" },
  { id: "goal.completed", label: "Goal Completed" },
  { id: "deliverable.submitted", label: "Deliverable Submitted" },
];

export const INITIAL_WEBHOOKS: WebhookConfig[] = [
  {
    id: "wh-1",
    url: "https://api.example.com/webhooks/ironworks",
    events: ["issue.created", "issue.completed", "agent.failed"],
    secret: "whsec_abc123def456",
    active: true,
    createdAt: "2026-03-28T10:00:00Z",
  },
];

export const MOCK_DELIVERIES: DeliveryLogEntry[] = [
  { id: "del-1", webhookId: "wh-1", event: "issue.completed", status: 200, duration: 142, timestamp: "2026-04-05T14:32:00Z", payload: '{"event":"issue.completed","issueId":"ISS-42"}' },
  { id: "del-2", webhookId: "wh-1", event: "issue.created", status: 200, duration: 98, timestamp: "2026-04-05T14:15:00Z", payload: '{"event":"issue.created","issueId":"ISS-43"}' },
  { id: "del-3", webhookId: "wh-1", event: "agent.failed", status: 500, duration: 3012, timestamp: "2026-04-05T13:50:00Z", payload: '{"event":"agent.failed","agentId":"agent-7"}' },
  { id: "del-4", webhookId: "wh-1", event: "issue.created", status: 200, duration: 112, timestamp: "2026-04-05T12:20:00Z", payload: '{"event":"issue.created","issueId":"ISS-41"}' },
  { id: "del-5", webhookId: "wh-1", event: "run.completed", status: 0, duration: 30000, timestamp: "2026-04-05T11:00:00Z", payload: '{"event":"run.completed","runId":"run-99"}' },
];

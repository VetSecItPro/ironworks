import { useState, useMemo } from "react";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Plus,
  RefreshCw,
  Trash2,
  Webhook,
  X,
} from "lucide-react";

/**
 * Webhooks & Integrations UI
 * - Outbound webhook configuration: URL, event selector, secret
 * - Webhook delivery log: mock table with recent deliveries
 * - Add/remove webhooks
 */

const AVAILABLE_EVENTS = [
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

interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: string;
}

interface DeliveryLogEntry {
  id: string;
  webhookId: string;
  event: string;
  status: number;
  duration: number;
  timestamp: string;
  payload: string;
}

// Initial mock data
const INITIAL_WEBHOOKS: WebhookConfig[] = [
  {
    id: "wh-1",
    url: "https://api.example.com/webhooks/ironworks",
    events: ["issue.created", "issue.completed", "agent.failed"],
    secret: "whsec_abc123def456",
    active: true,
    createdAt: "2026-03-28T10:00:00Z",
  },
];

const MOCK_DELIVERIES: DeliveryLogEntry[] = [
  {
    id: "del-1",
    webhookId: "wh-1",
    event: "issue.completed",
    status: 200,
    duration: 142,
    timestamp: "2026-04-05T14:32:00Z",
    payload: '{"event":"issue.completed","issueId":"ISS-42"}',
  },
  {
    id: "del-2",
    webhookId: "wh-1",
    event: "issue.created",
    status: 200,
    duration: 98,
    timestamp: "2026-04-05T14:15:00Z",
    payload: '{"event":"issue.created","issueId":"ISS-43"}',
  },
  {
    id: "del-3",
    webhookId: "wh-1",
    event: "agent.failed",
    status: 500,
    duration: 3012,
    timestamp: "2026-04-05T13:50:00Z",
    payload: '{"event":"agent.failed","agentId":"agent-7"}',
  },
  {
    id: "del-4",
    webhookId: "wh-1",
    event: "issue.created",
    status: 200,
    duration: 112,
    timestamp: "2026-04-05T12:20:00Z",
    payload: '{"event":"issue.created","issueId":"ISS-41"}',
  },
  {
    id: "del-5",
    webhookId: "wh-1",
    event: "run.completed",
    status: 0,
    duration: 30000,
    timestamp: "2026-04-05T11:00:00Z",
    payload: '{"event":"run.completed","runId":"run-99"}',
  },
];

function generateId() {
  return `wh-${Date.now().toString(36)}`;
}

export function WebhooksSettings() {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>(INITIAL_WEBHOOKS);
  const [showAdd, setShowAdd] = useState(false);
  const [showDeleteId, setShowDeleteId] = useState<string | null>(null);
  const [showDeliveryLog, setShowDeliveryLog] = useState<string | null>(null);

  // New webhook form state
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [newSecret, setNewSecret] = useState("");
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});

  function addWebhook() {
    if (!newUrl.trim()) return;
    const webhook: WebhookConfig = {
      id: generateId(),
      url: newUrl.trim(),
      events: newEvents.length > 0 ? newEvents : ["issue.created"],
      secret: newSecret.trim() || `whsec_${Date.now().toString(36)}`,
      active: true,
      createdAt: new Date().toISOString(),
    };
    setWebhooks((prev) => [...prev, webhook]);
    setShowAdd(false);
    setNewUrl("");
    setNewEvents([]);
    setNewSecret("");
  }

  function removeWebhook(id: string) {
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
    setShowDeleteId(null);
  }

  function toggleWebhook(id: string) {
    setWebhooks((prev) =>
      prev.map((w) => (w.id === id ? { ...w, active: !w.active } : w)),
    );
  }

  function toggleEvent(eventId: string) {
    setNewEvents((prev) =>
      prev.includes(eventId)
        ? prev.filter((e) => e !== eventId)
        : [...prev, eventId],
    );
  }

  const deliveries = useMemo(
    () =>
      showDeliveryLog
        ? MOCK_DELIVERIES.filter((d) => d.webhookId === showDeliveryLog)
        : [],
    [showDeliveryLog],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Webhook className="h-4 w-4" />
            Outbound Webhooks
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Send real-time notifications to external services when events occur.
          </p>
        </div>
        <Button size="sm" className="h-7 text-xs" onClick={() => setShowAdd(true)}>
          <Plus className="h-3 w-3 mr-1" />
          Add Webhook
        </Button>
      </div>

      {/* Webhook list */}
      {webhooks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Globe className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No webhooks configured.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add a webhook to start receiving event notifications.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <div
              key={wh.id}
              className={cn(
                "rounded-lg border p-4 transition-colors",
                wh.active ? "border-border bg-card" : "border-border/50 bg-muted/20 opacity-70",
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full mt-2 shrink-0",
                    wh.active ? "bg-emerald-500" : "bg-muted-foreground/40",
                  )}
                />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono truncate">{wh.url}</span>
                  </div>

                  {/* Events */}
                  <div className="flex flex-wrap gap-1">
                    {wh.events.map((evt) => (
                      <span
                        key={evt}
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium"
                      >
                        {evt}
                      </span>
                    ))}
                  </div>

                  {/* Secret */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Secret:</span>
                    <code className="font-mono text-[10px] bg-muted/40 px-1.5 py-0.5 rounded">
                      {showSecret[wh.id] ? wh.secret : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
                    </code>
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setShowSecret((prev) => ({ ...prev, [wh.id]: !prev[wh.id] }))
                      }
                    >
                      {showSecret[wh.id] ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setShowDeliveryLog(wh.id)}
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    Log
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => toggleWebhook(wh.id)}
                  >
                    {wh.active ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive"
                    onClick={() => setShowDeleteId(wh.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Webhook Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Webhook</DialogTitle>
            <DialogDescription>
              Configure an outbound webhook to receive event notifications.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Endpoint URL
              </label>
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://api.example.com/webhooks"
                className="text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Signing Secret (optional)
              </label>
              <Input
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
                placeholder="Auto-generated if empty"
                className="text-sm font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Events
              </label>
              <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                {AVAILABLE_EVENTS.map((evt) => (
                  <button
                    key={evt.id}
                    onClick={() => toggleEvent(evt.id)}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left transition-colors",
                      newEvents.includes(evt.id)
                        ? "bg-primary/10 text-primary"
                        : "bg-muted/30 text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    <div
                      className={cn(
                        "w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center",
                        newEvents.includes(evt.id)
                          ? "border-primary bg-primary"
                          : "border-border",
                      )}
                    >
                      {newEvents.includes(evt.id) && (
                        <Check className="h-2.5 w-2.5 text-primary-foreground" />
                      )}
                    </div>
                    {evt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button disabled={!newUrl.trim()} onClick={addWebhook}>
              Add Webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!showDeleteId} onOpenChange={() => setShowDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Webhook?</DialogTitle>
            <DialogDescription>
              This webhook will stop receiving event notifications. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => showDeleteId && removeWebhook(showDeleteId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivery Log Dialog */}
      <Dialog open={!!showDeliveryLog} onOpenChange={() => setShowDeliveryLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Delivery Log</DialogTitle>
            <DialogDescription>
              Recent webhook deliveries and their response status.
            </DialogDescription>
          </DialogHeader>

          {deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No deliveries recorded yet.
            </p>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Event</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Duration</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {deliveries.map((d) => (
                    <tr key={d.id} className="hover:bg-accent/20">
                      <td className="px-3 py-2 font-mono">{d.event}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium",
                            d.status >= 200 && d.status < 300
                              ? "bg-emerald-500/10 text-emerald-500"
                              : d.status >= 500
                                ? "bg-red-500/10 text-red-500"
                                : d.status === 0
                                  ? "bg-amber-500/10 text-amber-500"
                                  : "bg-muted text-muted-foreground",
                          )}
                        >
                          {d.status === 0 ? (
                            <>
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Timeout
                            </>
                          ) : d.status >= 200 && d.status < 300 ? (
                            <>
                              <Check className="h-2.5 w-2.5" />
                              {d.status}
                            </>
                          ) : (
                            <>
                              <X className="h-2.5 w-2.5" />
                              {d.status}
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                        {d.duration >= 1000
                          ? `${(d.duration / 1000).toFixed(1)}s`
                          : `${d.duration}ms`}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {new Date(d.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import {
  ActivitySquare,
  AlertTriangle,
  CalendarClock,
  CheckCircle,
  Clock,
  Cpu,
  ShieldAlert,
  Webhook,
  XCircle,
} from "lucide-react";
import type { PluginDashboardData, PluginHealthCheckResult } from "@/api/plugins";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// ---------------------------------------------------------------------------
// Dashboard helper components and formatting utilities
// ---------------------------------------------------------------------------

/**
 * Format an uptime value (in milliseconds) to a human-readable string.
 */
function formatUptime(uptimeMs: number | null): string {
  if (uptimeMs == null) return "\u2014";
  const totalSeconds = Math.floor(uptimeMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ${totalSeconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/**
 * Format a duration in milliseconds to a compact display string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Format an ISO timestamp to a relative time string (e.g., "2m ago").
 */
function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Format a unix timestamp (ms since epoch) to a locale string.
 */
function formatTimestamp(epochMs: number): string {
  return new Date(epochMs).toLocaleString();
}

/**
 * Status indicator dot for job run statuses.
 */
function JobStatusDot({ status }: { status: string }) {
  const colorClass =
    status === "success" || status === "succeeded"
      ? "bg-green-500"
      : status === "failed"
        ? "bg-red-500"
        : status === "running"
          ? "bg-blue-500 animate-pulse"
          : status === "cancelled"
            ? "bg-gray-400"
            : "bg-amber-500"; // queued, pending
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${colorClass}`} title={status} />;
}

/**
 * Status indicator dot for webhook delivery statuses.
 */
function DeliveryStatusDot({ status }: { status: string }) {
  const colorClass =
    status === "processed" || status === "success"
      ? "bg-green-500"
      : status === "failed"
        ? "bg-red-500"
        : status === "received"
          ? "bg-blue-500"
          : "bg-amber-500"; // pending
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${colorClass}`} title={status} />;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogEntry {
  id: string;
  level: string;
  message: string;
  createdAt: string;
}

interface PluginStatusTabProps {
  dashboardData: PluginDashboardData | undefined;
  healthData: PluginHealthCheckResult | undefined;
  healthLoading: boolean;
  recentLogs: LogEntry[] | undefined;
  plugin: {
    id: string;
    pluginKey: string;
    packageName: string;
    version: string;
    status: string;
    lastError: string | null;
    manifestJson: {
      version?: string;
      capabilities?: string[];
    };
  };
  statusVariant: "default" | "destructive" | "secondary";
  displayStatus: string;
}

export function PluginStatusTab({
  dashboardData,
  healthData,
  healthLoading,
  recentLogs,
  plugin,
  statusVariant,
  displayStatus,
}: PluginStatusTabProps) {
  const pluginCapabilities = plugin.manifestJson.capabilities ?? [];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-1.5">
              <Cpu className="h-4 w-4" />
              Runtime Dashboard
            </CardTitle>
            <CardDescription>Worker process, scheduled jobs, and webhook deliveries</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {dashboardData ? (
              <>
                <div>
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                    Worker Process
                  </h3>
                  {dashboardData.worker ? (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status</span>
                        <Badge variant={dashboardData.worker.status === "running" ? "default" : "secondary"}>
                          {dashboardData.worker.status}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">PID</span>
                        <span className="font-mono text-xs">{dashboardData.worker.pid ?? "\u2014"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Uptime</span>
                        <span className="text-xs">{formatUptime(dashboardData.worker.uptime)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pending RPCs</span>
                        <span className="text-xs">{dashboardData.worker.pendingRequests}</span>
                      </div>
                      {dashboardData.worker.totalCrashes > 0 && (
                        <>
                          <div className="flex justify-between col-span-2">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 text-amber-500" />
                              Crashes
                            </span>
                            <span className="text-xs">
                              {dashboardData.worker.consecutiveCrashes} consecutive /{" "}
                              {dashboardData.worker.totalCrashes} total
                            </span>
                          </div>
                          {dashboardData.worker.lastCrashAt && (
                            <div className="flex justify-between col-span-2">
                              <span className="text-muted-foreground">Last Crash</span>
                              <span className="text-xs">{formatTimestamp(dashboardData.worker.lastCrashAt)}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No worker process registered.</p>
                  )}
                </div>

                <Separator />

                <div>
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                    Recent Job Runs
                  </h3>
                  {dashboardData.recentJobRuns.length > 0 ? (
                    <div className="space-y-2">
                      {dashboardData.recentJobRuns.map((run) => (
                        <div
                          key={run.id}
                          className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-sm"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <JobStatusDot status={run.status} />
                            <span className="truncate font-mono text-xs" title={run.jobKey ?? run.jobId}>
                              {run.jobKey ?? run.jobId.slice(0, 8)}
                            </span>
                            <Badge variant="outline" className="px-1 py-0 text-[10px]">
                              {run.trigger}
                            </Badge>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                            {run.durationMs != null ? <span>{formatDuration(run.durationMs)}</span> : null}
                            <span title={run.createdAt}>{formatRelativeTime(run.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No job runs recorded yet.</p>
                  )}
                </div>

                <Separator />

                <div>
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                    <Webhook className="h-3.5 w-3.5 text-muted-foreground" />
                    Recent Webhook Deliveries
                  </h3>
                  {dashboardData.recentWebhookDeliveries.length > 0 ? (
                    <div className="space-y-2">
                      {dashboardData.recentWebhookDeliveries.map((delivery) => (
                        <div
                          key={delivery.id}
                          className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-sm"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <DeliveryStatusDot status={delivery.status} />
                            <span className="truncate font-mono text-xs" title={delivery.webhookKey}>
                              {delivery.webhookKey}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                            {delivery.durationMs != null ? <span>{formatDuration(delivery.durationMs)}</span> : null}
                            <span title={delivery.createdAt}>{formatRelativeTime(delivery.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No webhook deliveries recorded yet.</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 border-t border-border/50 pt-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Last checked: {new Date(dashboardData.checkedAt).toLocaleTimeString()}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Runtime diagnostics are unavailable right now.</p>
            )}
          </CardContent>
        </Card>

        {recentLogs && recentLogs.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-1.5">
                <ActivitySquare className="h-4 w-4" />
                Recent Logs
              </CardTitle>
              <CardDescription>Last {recentLogs.length} log entries</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-64 space-y-1 overflow-y-auto font-mono text-xs">
                {recentLogs.map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex gap-2 py-0.5 ${
                      entry.level === "error"
                        ? "text-destructive"
                        : entry.level === "warn"
                          ? "text-yellow-600 dark:text-yellow-400"
                          : entry.level === "debug"
                            ? "text-muted-foreground/80"
                            : "text-muted-foreground"
                    }`}
                  >
                    <span className="shrink-0 text-muted-foreground/70">
                      {new Date(entry.createdAt).toLocaleTimeString()}
                    </span>
                    <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">
                      {entry.level}
                    </Badge>
                    <span className="truncate" title={entry.message}>
                      {entry.message}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-1.5">
              <ActivitySquare className="h-4 w-4" />
              Health Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <p className="text-sm text-muted-foreground">Checking health...</p>
            ) : healthData ? (
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Overall</span>
                  <Badge variant={healthData.healthy ? "default" : "destructive"}>{healthData.status}</Badge>
                </div>

                {healthData.checks.length > 0 ? (
                  <div className="space-y-2 border-t border-border/50 pt-2">
                    {healthData.checks.map((check, i) => (
                      <div key={i} className="flex items-start justify-between gap-2">
                        <span className="truncate text-muted-foreground" title={check.name}>
                          {check.name}
                        </span>
                        {check.passed ? (
                          <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                {healthData.lastError ? (
                  <div className="break-words rounded border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">
                    {healthData.lastError}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Lifecycle</span>
                  <Badge variant={statusVariant}>{displayStatus}</Badge>
                </div>
                <p>Health checks run once the plugin is ready.</p>
                {plugin.lastError ? (
                  <div className="break-words rounded border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">
                    {plugin.lastError}
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex justify-between gap-3">
              <span>Plugin ID</span>
              <span className="font-mono text-xs text-right">{plugin.id}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Plugin Key</span>
              <span className="font-mono text-xs text-right">{plugin.pluginKey}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>NPM Package</span>
              <span className="max-w-[170px] truncate text-right text-xs" title={plugin.packageName}>
                {plugin.packageName}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Version</span>
              <span className="text-right text-foreground">v{plugin.manifestJson.version ?? plugin.version}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4" />
              Permissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pluginCapabilities.length > 0 ? (
              <ul className="space-y-2 text-sm text-muted-foreground">
                {pluginCapabilities.map((cap) => (
                  <li key={cap} className="rounded-md bg-muted/40 px-2.5 py-2 font-mono text-xs text-foreground/85">
                    {cap}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground italic">No special permissions requested.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

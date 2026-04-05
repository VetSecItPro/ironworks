import { useEffect, useState } from "react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Cpu,
  Database,
  Globe,
  Plug,
  Server,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";

/* ------------------------------------------------------------------ */
/*  Types & mock data                                                  */
/* ------------------------------------------------------------------ */

type HealthStatus = "healthy" | "degraded" | "down";

interface SystemComponent {
  name: string;
  status: HealthStatus;
  latencyMs: number | null;
  description: string;
  icon: React.ElementType;
  lastChecked: Date;
}

interface PerformanceMetric {
  label: string;
  p50: number;
  p95: number;
  unit: string;
}

interface AgentRuntimeStats {
  runningAgents: number;
  totalAgents: number;
  queueDepth: number;
  errorRate: number;
  avgTaskDurationMs: number;
}

function randomBetween(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

function generateMockComponents(): SystemComponent[] {
  const now = new Date();
  return [
    {
      name: "API Gateway",
      status: "healthy",
      latencyMs: randomBetween(12, 45),
      description: "REST API and WebSocket endpoints",
      icon: Globe,
      lastChecked: now,
    },
    {
      name: "Database",
      status: "healthy",
      latencyMs: randomBetween(3, 18),
      description: "PostgreSQL primary and read replicas",
      icon: Database,
      lastChecked: now,
    },
    {
      name: "Agent Runtime",
      status: "healthy",
      latencyMs: randomBetween(20, 80),
      description: "Task execution engine and queue processor",
      icon: Cpu,
      lastChecked: now,
    },
    {
      name: "Integrations",
      status: Math.random() > 0.85 ? "degraded" : "healthy",
      latencyMs: randomBetween(50, 200),
      description: "GitHub, Slack, external webhooks",
      icon: Plug,
      lastChecked: now,
    },
  ];
}

function generateMockMetrics(): PerformanceMetric[] {
  return [
    { label: "API Response Time", p50: randomBetween(18, 35), p95: randomBetween(85, 180), unit: "ms" },
    { label: "Database Query Time", p50: randomBetween(2, 8), p95: randomBetween(15, 45), unit: "ms" },
    { label: "WebSocket Latency", p50: randomBetween(5, 12), p95: randomBetween(25, 60), unit: "ms" },
    { label: "Asset Upload Time", p50: randomBetween(120, 300), p95: randomBetween(500, 1200), unit: "ms" },
  ];
}

function generateMockAgentStats(): AgentRuntimeStats {
  return {
    runningAgents: randomBetween(2, 8),
    totalAgents: randomBetween(10, 20),
    queueDepth: randomBetween(0, 12),
    errorRate: parseFloat((Math.random() * 3).toFixed(1)),
    avgTaskDurationMs: randomBetween(15000, 90000),
  };
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<HealthStatus, { color: string; bg: string; icon: React.ElementType; label: string }> = {
  healthy: { color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/40", icon: CheckCircle2, label: "Healthy" },
  degraded: { color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-100 dark:bg-yellow-900/40", icon: AlertTriangle, label: "Degraded" },
  down: { color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/40", icon: XCircle, label: "Down" },
};

function StatusIndicator({ status }: { status: HealthStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", cfg.color)}>
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}

function ComponentCard({ component }: { component: SystemComponent }) {
  const Icon = component.icon;
  const cfg = STATUS_CONFIG[component.status];
  return (
    <div className={cn("rounded-lg border border-border p-4", cfg.bg)}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className={cn("rounded-md p-1.5 bg-background border border-border")}>
            <Icon className="h-4 w-4 text-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{component.name}</h3>
            <p className="text-xs text-muted-foreground">{component.description}</p>
          </div>
        </div>
        <StatusIndicator status={component.status} />
      </div>
      {component.latencyMs != null && (
        <div className="mt-3 text-xs text-muted-foreground">
          Latency: <span className="font-medium text-foreground">{component.latencyMs}ms</span>
        </div>
      )}
    </div>
  );
}

function MetricRow({ metric }: { metric: PerformanceMetric }) {
  const p95Warning = metric.unit === "ms" && metric.p95 > 500;
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm">{metric.label}</span>
      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted-foreground">
          p50: <span className="font-medium text-foreground">{metric.p50}{metric.unit}</span>
        </span>
        <span className={cn("text-muted-foreground", p95Warning && "text-yellow-600 dark:text-yellow-400")}>
          p95: <span className="font-medium">{metric.p95}{metric.unit}</span>
        </span>
      </div>
    </div>
  );
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remainder = s % 60;
  return remainder > 0 ? `${m}m ${remainder}s` : `${m}m`;
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export function PlatformHealth() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const [components, setComponents] = useState<SystemComponent[]>(() => generateMockComponents());
  const [metrics, setMetrics] = useState<PerformanceMetric[]>(() => generateMockMetrics());
  const [agentStats, setAgentStats] = useState<AgentRuntimeStats>(() => generateMockAgentStats());
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Platform Health" }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  function refresh() {
    setRefreshing(true);
    setTimeout(() => {
      setComponents(generateMockComponents());
      setMetrics(generateMockMetrics());
      setAgentStats(generateMockAgentStats());
      setLastRefresh(new Date());
      setRefreshing(false);
    }, 600);
  }

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, []);

  const overallStatus: HealthStatus = components.some((c) => c.status === "down")
    ? "down"
    : components.some((c) => c.status === "degraded")
      ? "degraded"
      : "healthy";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Platform Health</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            System status, performance metrics, and agent runtime health.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Last checked: {lastRefresh.toLocaleTimeString()}
          </span>
          <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overall status banner */}
      <div className={cn(
        "rounded-lg border p-4 flex items-center gap-3",
        overallStatus === "healthy" && "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30",
        overallStatus === "degraded" && "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30",
        overallStatus === "down" && "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30",
      )}>
        <Server className={cn(
          "h-5 w-5",
          STATUS_CONFIG[overallStatus].color,
        )} />
        <div>
          <span className={cn("text-sm font-semibold", STATUS_CONFIG[overallStatus].color)}>
            {overallStatus === "healthy"
              ? "All Systems Operational"
              : overallStatus === "degraded"
                ? "Partial System Degradation"
                : "System Outage Detected"}
          </span>
          <p className="text-xs text-muted-foreground mt-0.5">
            {components.filter((c) => c.status === "healthy").length} of {components.length} components healthy
          </p>
        </div>
      </div>

      {/* System components grid */}
      <div>
        <h2 className="text-sm font-semibold mb-3">System Components</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {components.map((c) => (
            <ComponentCard key={c.name} component={c} />
          ))}
        </div>
      </div>

      {/* Performance metrics */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Performance Metrics</h2>
        </div>
        <div className="divide-y-0">
          {metrics.map((m) => (
            <MetricRow key={m.label} metric={m} />
          ))}
        </div>
      </div>

      {/* Agent runtime health */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Agent Runtime Health</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Running Agents</p>
            <p className="text-xl font-semibold mt-0.5">
              {agentStats.runningAgents}
              <span className="text-xs font-normal text-muted-foreground ml-1">/ {agentStats.totalAgents}</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Queue Depth</p>
            <p className={cn(
              "text-xl font-semibold mt-0.5",
              agentStats.queueDepth > 8 && "text-yellow-600 dark:text-yellow-400",
            )}>
              {agentStats.queueDepth}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Error Rate</p>
            <p className={cn(
              "text-xl font-semibold mt-0.5",
              agentStats.errorRate > 2 && "text-red-600 dark:text-red-400",
            )}>
              {agentStats.errorRate}%
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg Task Duration</p>
            <p className="text-xl font-semibold mt-0.5">{formatDuration(agentStats.avgTaskDurationMs)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

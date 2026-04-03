import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { adminApi } from "@/api/admin";
import { cn, formatCents } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  Building2,
  Database,
  HardDrive,
  RefreshCw,
  Server,
  Timer,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

function UsageCard({
  label,
  used,
  total,
  unit,
  icon: Icon,
}: {
  label: string;
  used: number;
  total: number;
  unit: string;
  icon: React.ElementType;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  const textColor = pct >= 90 ? "text-red-400" : pct >= 70 ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </h4>
        <Icon className="h-4 w-4 text-muted-foreground/50" />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("text-2xl font-bold tabular-nums", textColor)}>{pct}%</span>
        <span className="text-xs text-muted-foreground">
          {used.toFixed(1)} / {total.toFixed(1)} {unit}
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  valueClass,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-border px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", valueClass)}>
            {value}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </div>
        <Icon className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-1" />
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function AdminMonitoring() {
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "IronWorks Admin" }, { label: "Monitoring" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "monitoring"],
    queryFn: () => adminApi.getMonitoring(),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const successRatePct = data ? Math.round(data.successRate24h * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Platform Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Server health, agent run statistics, and error log
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-1.5"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-400">
          Failed to load monitoring data: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border h-28 animate-pulse bg-muted/30" />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Server metrics */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Server Health
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
              <UsageCard
                label="CPU Usage"
                used={data.cpuUsagePercent}
                total={100}
                unit="%"
                icon={Server}
              />
              <UsageCard
                label="Memory"
                used={data.memoryUsedMb / 1024}
                total={data.memoryTotalMb / 1024}
                unit="GB"
                icon={HardDrive}
              />
              <UsageCard
                label="Disk"
                used={data.diskUsedGb}
                total={data.diskTotalGb}
                unit="GB"
                icon={Database}
              />
              <StatCard
                label="Process Uptime"
                value={formatUptime(data.uptimeSeconds)}
                icon={Timer}
                valueClass="text-emerald-400"
              />
            </div>
          </div>

          {/* DB + agent run stats */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Database &amp; Agent Runs
            </h2>
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-2">
              <StatCard label="DB Size" value={`${data.dbSizeMb.toFixed(0)} MB`} icon={Database} />
              <StatCard label="Runs Today" value={data.runsToday} icon={Activity} />
              <StatCard
                label="Success Rate (24h)"
                value={`${successRatePct}%`}
                icon={Zap}
                valueClass={
                  successRatePct >= 95
                    ? "text-emerald-400"
                    : successRatePct >= 85
                      ? "text-amber-400"
                      : "text-red-400"
                }
              />
              <StatCard label="Currently Running" value={data.currentlyRunning} icon={Activity} />
              <StatCard label="Queued" value={data.queued} icon={Timer} />
            </div>
          </div>

          {/* Top companies by spend */}
          {data.topCompaniesBySpend.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Top Companies by Spend (MTD)
              </h2>
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Company
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Agents
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        MTD Spend
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topCompaniesBySpend.map((c) => (
                      <tr
                        key={c.companyId}
                        className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium">{c.companyName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">
                          {c.agentCount}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {formatCents(c.spendCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recent errors */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
              Recent Agent Errors
            </h2>
            {data.recentErrors.length === 0 ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-3 text-sm text-emerald-400">
                No recent agent errors — all clear.
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Timestamp
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Company
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Agent
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Error
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                          Code
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentErrors.map((err) => (
                        <tr
                          key={err.id}
                          className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors"
                        >
                          <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                            {new Date(err.timestamp).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm">{err.companyName}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm">{err.agentName}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-red-400 font-mono max-w-[300px] truncate block">
                              {err.errorMessage.slice(0, 200)}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            {err.errorCode ? (
                              <span className="text-xs font-mono text-muted-foreground">
                                {err.errorCode}
                              </span>
                            ) : err.exitCode != null ? (
                              <span className="text-xs font-mono text-muted-foreground">
                                exit {err.exitCode}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

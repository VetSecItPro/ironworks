import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { adminApi, type AdminAuditEntry } from "@/api/admin";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  Download,
  RefreshCw,
  ScrollText,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ACTION_COLORS: Record<string, string> = {
  "company.paused": "text-amber-400",
  "company.resumed": "text-emerald-400",
  "company.deleted": "text-red-400",
  "company.tier_changed": "text-blue-400",
  "company.emergency_pause_all": "text-red-400",
  "user.disabled": "text-red-400",
  "user.enabled": "text-emerald-400",
  "user.promoted_admin": "text-purple-400",
  "user.demoted_admin": "text-amber-400",
  "agent.force_paused": "text-amber-400",
  "agent.force_terminated": "text-red-400",
  "agent.hired": "text-emerald-400",
  "agent.terminated": "text-red-400",
  "approval.approved": "text-emerald-400",
  "approval.rejected": "text-red-400",
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  company: "Company",
  user: "User",
  agent: "Agent",
  subscription: "Subscription",
};

/** Group actions into categories for filtering. */
const ACTION_CATEGORIES: Record<string, { label: string; actions: string[] }> = {
  agent_actions: {
    label: "Agent Actions",
    actions: [
      "agent.force_paused",
      "agent.force_terminated",
      "agent.hired",
      "agent.terminated",
    ],
  },
  hiring: {
    label: "Hiring",
    actions: [
      "agent.hired",
      "agent.terminated",
      "agent.force_terminated",
    ],
  },
  approvals: {
    label: "Approvals",
    actions: [
      "approval.approved",
      "approval.rejected",
    ],
  },
  system: {
    label: "System",
    actions: [
      "company.paused",
      "company.resumed",
      "company.deleted",
      "company.tier_changed",
      "company.emergency_pause_all",
      "user.disabled",
      "user.enabled",
      "user.promoted_admin",
      "user.demoted_admin",
    ],
  },
};

function ActionBadge({ action }: { action: string }) {
  const color = ACTION_COLORS[action] ?? "text-muted-foreground";
  return (
    <span className={cn("font-mono text-xs", color)}>{action}</span>
  );
}

function AuditRow({ entry }: { entry: AdminAuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = entry.details && Object.keys(entry.details).length > 0;

  return (
    <>
      <tr
        className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        style={{ cursor: hasDetails ? "pointer" : "default" }}
      >
        <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {new Date(entry.createdAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
          })}
        </td>
        <td className="px-4 py-3">
          <div className="space-y-0.5">
            <span className="text-sm font-medium">{entry.userEmail || entry.userId}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <ActionBadge action={entry.action} />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {TARGET_TYPE_LABELS[entry.targetType] ?? entry.targetType}
            </span>
            <span className="font-mono text-xs text-foreground/70">{entry.targetId.slice(0, 8)}</span>
          </div>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">
          {entry.ipAddress ? (
            <span className="font-mono text-xs text-muted-foreground">{entry.ipAddress}</span>
          ) : (
            <span className="text-muted-foreground/40">-</span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {hasDetails ? (
            <span className="inline-flex items-center gap-0.5 underline underline-offset-2 cursor-pointer">
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {expanded ? "Hide" : "Details"}
            </span>
          ) : null}
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr className="border-b border-border bg-muted/10">
          <td colSpan={6} className="px-4 py-3">
            <pre className="text-xs font-mono text-muted-foreground overflow-auto max-h-48 whitespace-pre-wrap">
              {JSON.stringify(entry.details, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

const KNOWN_ACTIONS = [
  "company.paused",
  "company.resumed",
  "company.deleted",
  "company.tier_changed",
  "company.emergency_pause_all",
  "user.disabled",
  "user.enabled",
  "user.promoted_admin",
  "user.demoted_admin",
  "agent.force_paused",
  "agent.force_terminated",
  "agent.hired",
  "agent.terminated",
  "approval.approved",
  "approval.rejected",
];

export default function AdminAuditLog() {
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "IronWorks Admin" }, { label: "Audit Log" }]);
  }, [setBreadcrumbs]);

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "audit-log"],
    queryFn: () => adminApi.getAuditLog(200),
    staleTime: 30_000,
  });

  // Extract unique agents mentioned in target for agent filter
  const agentTargets = useMemo(() => {
    if (!data) return [];
    const seen = new Map<string, string>();
    for (const e of data) {
      if (e.targetType === "agent" && e.targetId && !seen.has(e.targetId)) {
        seen.set(e.targetId, e.targetId.slice(0, 8));
      }
    }
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [data]);

  const [agentFilter, setAgentFilter] = useState("all");

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((e) => {
      const matchSearch =
        !search ||
        e.userEmail.toLowerCase().includes(search.toLowerCase()) ||
        e.action.toLowerCase().includes(search.toLowerCase()) ||
        e.targetId.toLowerCase().includes(search.toLowerCase());
      const matchAction = actionFilter === "all" || e.action === actionFilter;
      const matchCategory =
        categoryFilter === "all" ||
        (ACTION_CATEGORIES[categoryFilter]?.actions.includes(e.action) ?? false);
      const matchAgent =
        agentFilter === "all" ||
        (e.targetType === "agent" && e.targetId === agentFilter);
      return matchSearch && matchAction && matchCategory && matchAgent;
    });
  }, [data, search, actionFilter, categoryFilter, agentFilter]);

  const hasFilters = search || actionFilter !== "all" || categoryFilter !== "all" || agentFilter !== "all";

  function handleExportJson() {
    if (!filtered.length) return;
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportCsv() {
    if (!filtered.length) return;
    const rows = ["timestamp,user_email,action,target_type,target_id,ip_address,details"];
    for (const e of filtered) {
      const detailsStr = e.details ? JSON.stringify(e.details).replace(/"/g, '""') : "";
      rows.push([
        new Date(e.createdAt).toISOString(),
        e.userEmail,
        e.action,
        e.targetType,
        e.targetId,
        e.ipAddress ?? "",
        `"${detailsStr}"`,
      ].join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All admin actions across the platform
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={!filtered.length}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportJson}
            disabled={!filtered.length}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export JSON
          </Button>
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
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by user, action, target..."
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); if (v !== "all") setActionFilter("all"); }}>
          <SelectTrigger className="h-8 w-[160px] text-sm">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(ACTION_CATEGORIES).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); if (v !== "all") setCategoryFilter("all"); }}>
          <SelectTrigger className="h-8 w-[180px] text-sm">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {KNOWN_ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {agentTargets.length > 0 && (
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="h-8 w-[140px] text-sm">
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
              {agentTargets.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => {
              setSearch("");
              setActionFilter("all");
              setCategoryFilter("all");
              setAgentFilter("all");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-400">
          Failed to load audit log: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <ScrollText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? "No entries match your filters."
                : "No audit log entries yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Timestamp
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Admin User
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Action
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Target
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                    IP Address
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {data?.length ?? 0} entries
        </p>
      )}
    </div>
  );
}

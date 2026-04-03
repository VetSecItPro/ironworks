import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { adminApi, type AdminAuditEntry } from "@/api/admin";
import { cn } from "@/lib/utils";
import {
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
  "user.disabled": "text-red-400",
  "user.enabled": "text-emerald-400",
  "user.promoted_admin": "text-purple-400",
  "user.demoted_admin": "text-amber-400",
  "agent.force_paused": "text-amber-400",
  "agent.force_terminated": "text-red-400",
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  company: "Company",
  user: "User",
  agent: "Agent",
  subscription: "Subscription",
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
            <span className="text-muted-foreground/40">—</span>
          )}
        </td>
        {hasDetails && (
          <td className="px-4 py-3 text-xs text-muted-foreground">
            <span className="underline underline-offset-2 cursor-pointer">
              {expanded ? "Hide" : "Details"}
            </span>
          </td>
        )}
        {!hasDetails && <td className="px-4 py-3" />}
      </tr>
      {expanded && hasDetails && (
        <tr className="border-b border-border bg-muted/10">
          <td colSpan={6} className="px-4 py-3">
            <pre className="text-xs font-mono text-muted-foreground overflow-auto max-h-32">
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
  "user.disabled",
  "user.enabled",
  "user.promoted_admin",
  "user.demoted_admin",
  "agent.force_paused",
  "agent.force_terminated",
];

export default function AdminAuditLog() {
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "IronWorks Admin" }, { label: "Audit Log" }]);
  }, [setBreadcrumbs]);

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "audit-log"],
    queryFn: () => adminApi.getAuditLog(200),
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((e) => {
      const matchSearch =
        !search ||
        e.userEmail.toLowerCase().includes(search.toLowerCase()) ||
        e.action.toLowerCase().includes(search.toLowerCase()) ||
        e.targetId.toLowerCase().includes(search.toLowerCase());
      const matchAction = actionFilter === "all" || e.action === actionFilter;
      return matchSearch && matchAction;
    });
  }, [data, search, actionFilter]);

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
        <Select value={actionFilter} onValueChange={setActionFilter}>
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
        {(search || actionFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => {
              setSearch("");
              setActionFilter("all");
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
              {search || actionFilter !== "all"
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

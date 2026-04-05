import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/context/ToastContext";
import { bugReportsApi, type BugReport } from "@/api/bugReports";
import { cn } from "@/lib/utils";
import { Bug, ChevronDown, ChevronRight, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* -- Badge helpers -- */

function TypeBadge({ type }: { type: BugReport["type"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide",
        type === "bug"
          ? "bg-red-500/15 text-red-400"
          : "bg-blue-500/15 text-blue-400",
      )}
    >
      {type === "bug" ? "Bug" : "Feature"}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: BugReport["severity"] }) {
  if (!severity) return null;
  const cls =
    severity === "critical"
      ? "bg-red-600/15 text-red-500"
      : severity === "high"
        ? "bg-orange-500/15 text-orange-400"
        : severity === "medium"
          ? "bg-amber-500/15 text-amber-400"
          : "bg-slate-500/15 text-slate-400";
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide", cls)}>
      {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: BugReport["status"] }) {
  const cls =
    status === "open"
      ? "bg-amber-500/15 text-amber-400"
      : status === "in_progress"
        ? "bg-blue-500/15 text-blue-400"
        : status === "resolved"
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-slate-500/15 text-slate-400";
  const labels: Record<string, string> = {
    open: "Open",
    in_progress: "In Progress",
    resolved: "Resolved",
    closed: "Closed",
  };
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide", cls)}>
      {labels[status] ?? status}
    </span>
  );
}

/* -- Report row with expandable detail -- */

function ReportRow({ report }: { report: BugReport }) {
  const [expanded, setExpanded] = useState(false);
  const [adminNotes, setAdminNotes] = useState(report.adminNotes ?? "");
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BugReport["status"] }) =>
      bugReportsApi.update(id, { status }),
    onSuccess: () => {
      pushToast({ title: "Status updated", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["admin", "bug-reports"] });
    },
    onError: () => {
      pushToast({ title: "Failed to update status", tone: "error" });
    },
  });

  const notesMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      bugReportsApi.update(id, { adminNotes: notes }),
    onSuccess: () => {
      pushToast({ title: "Notes saved", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["admin", "bug-reports"] });
    },
    onError: () => {
      pushToast({ title: "Failed to save notes", tone: "error" });
    },
  });

  return (
    <>
      <tr
        className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-3 py-3 w-6">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </td>
        <td className="px-3 py-3 text-sm font-medium truncate max-w-[250px]">{report.title}</td>
        <td className="px-3 py-3"><TypeBadge type={report.type} /></td>
        <td className="px-3 py-3"><SeverityBadge severity={report.severity} /></td>
        <td className="px-3 py-3"><StatusBadge status={report.status} /></td>
        <td className="px-3 py-3 text-xs text-muted-foreground">{report.reporterEmail ?? "Unknown"}</td>
        <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
          {new Date(report.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={7} className="px-4 py-4">
            <div className="space-y-4 max-w-3xl">
              {/* Description */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Description</h4>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {report.description || "No description provided"}
                </p>
              </div>

              {/* Page URL */}
              {report.pageUrl && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1">Page URL</h4>
                  <p className="text-xs text-blue-400 break-all">{report.pageUrl}</p>
                </div>
              )}

              {/* Actions row */}
              <div className="flex flex-wrap items-start gap-4">
                {/* Admin Notes */}
                <div className="flex-1 min-w-[260px] space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">Admin Notes</h4>
                  <Textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Internal notes..."
                    rows={3}
                    className="resize-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={adminNotes === (report.adminNotes ?? "") || notesMutation.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      notesMutation.mutate({ id: report.id, notes: adminNotes });
                    }}
                  >
                    {notesMutation.isPending ? "Saving..." : "Save Notes"}
                  </Button>
                </div>

                {/* Status change */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">Status</h4>
                  <Select
                    value={report.status}
                    onValueChange={(val) => {
                      statusMutation.mutate({ id: report.id, status: val as BugReport["status"] });
                    }}
                  >
                    <SelectTrigger
                      className="w-[160px] text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent onClick={(e) => e.stopPropagation()}>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Resolved date */}
              {report.resolvedAt && (
                <p className="text-xs text-muted-foreground">
                  Resolved: {new Date(report.resolvedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* -- Main component -- */

export default function AdminBugReports() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "bug" | "feature_request">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "in_progress" | "resolved" | "closed">("all");

  useEffect(() => {
    setBreadcrumbs([
      { label: "IronWorks Admin" },
      { label: "Bug Reports" },
    ]);
  }, [setBreadcrumbs]);

  const { data: reports = [], isLoading, refetch } = useQuery({
    queryKey: ["admin", "bug-reports"],
    queryFn: () => bugReportsApi.list(),
    staleTime: 30_000,
  });

  const openCount = useMemo(() => reports.filter((r) => r.status === "open").length, [reports]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return reports.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q && !r.title.toLowerCase().includes(q) && !(r.reporterEmail ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [reports, search, typeFilter, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Bug className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">
          Bug Reports
          {openCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500/15 text-red-400 text-xs font-bold px-2 py-0.5">
              {openCount}
            </span>
          )}
        </h1>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto text-muted-foreground"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 text-sm"
            placeholder="Search title or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
          <SelectTrigger className="w-[140px] text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="bug">Bug</SelectItem>
            <SelectItem value="feature_request">Feature Request</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[140px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="w-6 px-3 py-2" />
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Title</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Type</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Severity</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Reporter</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No bug reports found
                </td>
              </tr>
            )}
            {filtered.map((report) => (
              <ReportRow key={report.id} report={report} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

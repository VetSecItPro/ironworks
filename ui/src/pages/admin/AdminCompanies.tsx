import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { adminApi, type AdminCompany } from "@/api/admin";
import { cn, formatCents } from "@/lib/utils";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Pause,
  Play,
  RefreshCw,
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

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
        status === "active"
          ? "bg-emerald-500/10 text-emerald-400"
          : status === "paused"
            ? "bg-amber-500/10 text-amber-400"
            : "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
        tier === "enterprise"
          ? "bg-purple-500/10 text-purple-400"
          : tier === "professional" || tier === "growth" || tier === "business"
            ? "bg-blue-500/10 text-blue-400"
            : "bg-muted text-muted-foreground",
      )}
    >
      {tier}
    </span>
  );
}

function BudgetBar({ spentCents, budgetCents }: { spentCents: number; budgetCents: number }) {
  if (budgetCents <= 0) return <span className="text-xs text-muted-foreground">Unlimited</span>;
  const pct = Math.min(100, Math.round((spentCents / budgetCents) * 100));
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-blue-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-8 shrink-0">{pct}%</span>
    </div>
  );
}

function CompanyRow({
  company,
  onPause,
  onResume,
  isPausing,
  isResuming,
}: {
  company: AdminCompany;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  isPausing: boolean;
  isResuming: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors">
        <td className="px-4 py-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-left hover:opacity-70 transition-opacity"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="font-medium text-sm">{company.name}</span>
            <span className="text-xs text-muted-foreground font-mono">[{company.issuePrefix}]</span>
          </button>
        </td>
        <td className="px-4 py-3">
          <TierBadge tier={company.planTier} />
        </td>
        <td className="px-4 py-3 text-sm tabular-nums">{company.agentCount}</td>
        <td className="px-4 py-3 text-sm tabular-nums">{company.userCount}</td>
        <td className="px-4 py-3">
          <div className="space-y-1">
            <span className="text-sm tabular-nums">{formatCents(company.mtdSpendCents)}</span>
            <BudgetBar spentCents={company.mtdSpendCents} budgetCents={company.budgetMonthlyCents} />
          </div>
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={company.status} />
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
          {new Date(company.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            {company.status === "paused" ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => onResume(company.id)}
                disabled={isResuming}
              >
                <Play className="h-3 w-3" />
                Resume
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-amber-400 hover:text-amber-300"
                onClick={() => onPause(company.id)}
                disabled={isPausing}
              >
                <Pause className="h-3 w-3" />
                Pause
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" asChild>
              <Link to={`/${company.issuePrefix}/dashboard`}>
                <ExternalLink className="h-3 w-3" />
                View
              </Link>
            </Button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border">
          <td colSpan={8} className="px-4 py-3 bg-muted/20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Company ID</span>
                <p className="font-mono text-xs mt-0.5 text-muted-foreground truncate">{company.id}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Monthly Budget</span>
                <p className="font-medium mt-0.5">
                  {company.budgetMonthlyCents > 0
                    ? formatCents(company.budgetMonthlyCents)
                    : "Unlimited"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">MTD Spend</span>
                <p className="font-medium mt-0.5">{formatCents(company.mtdSpendCents)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Plan Tier</span>
                <p className="mt-0.5 capitalize">{company.planTier}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AdminCompanies() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "IronWorks Admin" }, { label: "Companies" }]);
  }, [setBreadcrumbs]);

  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "companies"],
    queryFn: () => adminApi.getCompanies(),
    staleTime: 30_000,
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => adminApi.pauseCompany(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "companies"] }),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: string) => adminApi.resumeCompany(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "companies"] }),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((c) => {
      const matchSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.issuePrefix.toLowerCase().includes(search.toLowerCase());
      const matchPlan = planFilter === "all" || c.planTier === planFilter;
      const matchStatus = statusFilter === "all" || c.status === statusFilter;
      return matchSearch && matchPlan && matchStatus;
    });
  }, [data, search, planFilter, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Companies</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data ? `${data.length} total companies` : "All tenant companies"}
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
            placeholder="Search by name or prefix..."
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="h-8 w-[130px] text-sm">
            <SelectValue placeholder="All plans" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            <SelectItem value="starter">Starter</SelectItem>
            <SelectItem value="growth">Growth</SelectItem>
            <SelectItem value="professional">Professional</SelectItem>
            <SelectItem value="business">Business</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[120px] text-sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
          </SelectContent>
        </Select>
        {(search || planFilter !== "all" || statusFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => {
              setSearch("");
              setPlanFilter("all");
              setStatusFilter("all");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-400">
          Failed to load companies: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No companies match your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Company
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Plan
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Agents
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Users
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    MTD Spend
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Created
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((company) => (
                  <CompanyRow
                    key={company.id}
                    company={company}
                    onPause={(id) => pauseMutation.mutate(id)}
                    onResume={(id) => resumeMutation.mutate(id)}
                    isPausing={pauseMutation.isPending && pauseMutation.variables === company.id}
                    isResuming={resumeMutation.isPending && resumeMutation.variables === company.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {data?.length ?? 0} companies
        </p>
      )}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { agentMemoryApi } from "../api/agentMemory";
import { agentsApi } from "../api/agents";
import { costsApi } from "../api/costs";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { velocityApi } from "../api/velocity";
import type { DeptAggRow } from "../components/agent-performance";
import {
  AgentKpiCards,
  DepartmentAggregation,
  LeaderboardHighlights,
  PerformanceAlertBanner,
  PerformanceHeader,
} from "../components/agent-performance";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { CompanyKpiCards } from "../components/performance/CompanyKpiCards";
import { PerformanceByProject } from "../components/performance/PerformanceByProject";
import { PerformanceTrendChart, VelocityChart } from "../components/performance/PerformanceCharts";
import { PerformanceInsights } from "../components/performance/PerformanceInsights";
import { PerformanceTable } from "../components/performance/PerformanceTable";
import {
  type AgentPerfRow,
  computeAgentPerformance,
  computeRating,
  RATING_COLORS,
  type SortField,
  type TimeRange,
} from "../components/performance/ratingUtils";
import { AgentPipeline, WorkloadDistribution } from "../components/performance/WorkloadCharts";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { cn, formatCents } from "../lib/utils";

// Re-export for consumers (e.g. BoardBriefing)
export type { AgentPerfRow };
export { computeAgentPerformance };

export function AgentPerformance() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [range, setRange] = useState<TimeRange>("30d");
  const [sortField, setSortField] = useState<SortField>("rating");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [trendAgentId, setTrendAgentId] = useState<string>("");
  const [showDeptAgg, setShowDeptAgg] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Agent Performance" }]);
  }, [setBreadcrumbs]);

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: costsByAgent } = useQuery({
    queryKey: [...queryKeys.costs(selectedCompanyId!), "by-agent"],
    queryFn: () => costsApi.byAgent(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: velocity } = useQuery({
    queryKey: queryKeys.velocity(selectedCompanyId!, 12),
    queryFn: () => velocityApi.get(selectedCompanyId!, 12),
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });

  const effectiveTrendAgentId = trendAgentId || (agents?.[0]?.id ?? "");

  const { data: trendMemory } = useQuery({
    queryKey: queryKeys.agentMemory.list(selectedCompanyId!, effectiveTrendAgentId),
    queryFn: () => agentMemoryApi.list(selectedCompanyId!, effectiveTrendAgentId),
    enabled: !!selectedCompanyId && !!effectiveTrendAgentId,
    staleTime: 60_000,
  });

  const trendSnapshots = useMemo(() => {
    if (!trendMemory) return [];
    return trendMemory
      .filter((m) => m.category === "performance_snapshot")
      .map((m) => {
        let score: number | null = null;
        try {
          const parsed = JSON.parse(m.content) as Record<string, unknown>;
          const s = parsed.score ?? parsed.performance_score ?? parsed.ratingScore;
          if (typeof s === "number") score = Math.min(100, Math.max(0, s));
        } catch {
          const match = m.content.match(/\b(\d{1,3})\b/);
          if (match) score = Math.min(100, Math.max(0, Number(match[1])));
        }
        return { date: new Date(m.createdAt), score };
      })
      .filter((s): s is { date: Date; score: number } => s.score !== null)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(-12);
  }, [trendMemory]);

  const rows = useMemo(
    () => computeAgentPerformance(agents ?? [], issues ?? [], costsByAgent ?? [], range),
    [agents, issues, costsByAgent, range],
  );

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortField === "rating") return dir * a.rating.localeCompare(b.rating);
      const av = a[sortField] ?? -1;
      const bv = b[sortField] ?? -1;
      return dir * ((av as number) - (bv as number));
    });
  }, [rows, sortField, sortDir]);

  const prevRows = useMemo(() => {
    if (range === "all") return [];
    const days = range === "7d" ? 7 : 30;
    const now = Date.now();
    const prevIssues = (issues ?? []).filter((i) => {
      const t = new Date(i.updatedAt).getTime();
      return t > now - days * 2 * 24 * 60 * 60 * 1000 && t <= now - days * 24 * 60 * 60 * 1000;
    });
    return computeAgentPerformance(agents ?? [], prevIssues, costsByAgent ?? [], "all");
  }, [agents, issues, costsByAgent, range]);

  const prevScoreMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of prevRows) m.set(r.agentId, r.ratingScore);
    return m;
  }, [prevRows]);

  const deptAggRows: DeptAggRow[] = useMemo(() => {
    if (!showDeptAgg) return [];
    const deptMap = new Map<string, { dept: string; agents: AgentPerfRow[] }>();
    for (const row of rows) {
      const agent = (agents ?? []).find((a) => a.id === row.agentId);
      const dept =
        ((agent as unknown as Record<string, unknown> | undefined)?.department as string | undefined) ?? "unassigned";
      if (!deptMap.has(dept)) deptMap.set(dept, { dept, agents: [] });
      deptMap.get(dept)!.agents.push(row);
    }
    return Array.from(deptMap.values())
      .map((g) => {
        const active = g.agents.filter((r) => r.tasksDone > 0);
        return {
          dept: g.dept,
          agentCount: g.agents.length,
          avgScore: active.length > 0 ? Math.round(active.reduce((s, r) => s + r.ratingScore, 0) / active.length) : 0,
          totalDone: g.agents.reduce((s, r) => s + r.tasksDone, 0),
          avgThroughput:
            active.length > 0 ? +(active.reduce((s, r) => s + r.throughput, 0) / active.length).toFixed(2) : 0,
          avgCompletion:
            active.length > 0 ? Math.round(active.reduce((s, r) => s + r.completionRate, 0) / active.length) : 0,
          totalSpend: g.agents.reduce((s, r) => s + r.totalSpendCents, 0),
        };
      })
      .sort((a, b) => b.avgScore - a.avgScore);
  }, [rows, agents, showDeptAgg]);

  const topPerformer = rows.filter((r) => r.tasksDone > 0)[0] ?? null;
  const mostImproved = useMemo(() => {
    if (prevRows.length === 0) return null;
    let best: AgentPerfRow | null = null;
    let bestDelta = -Infinity;
    for (const row of rows) {
      const prev = prevScoreMap.get(row.agentId);
      if (prev !== undefined && row.tasksDone > 0) {
        const delta = row.ratingScore - prev;
        if (delta > bestDelta) {
          bestDelta = delta;
          best = row;
        }
      }
    }
    return bestDelta > 0 ? best : null;
  }, [rows, prevRows, prevScoreMap]);

  const teamAvgScore = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.ratingScore, 0) / rows.length) : 0;
  const teamRating = computeRating(teamAvgScore);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  if (!selectedCompanyId) {
    return <EmptyState icon={BarChart3} message="Select a company to view agent performance." />;
  }
  if (agentsLoading) return <PageSkeleton variant="list" />;

  return (
    <div className="space-y-6">
      <PerformanceHeader
        range={range}
        setRange={setRange}
        showDeptAgg={showDeptAgg}
        setShowDeptAgg={setShowDeptAgg}
        rows={rows}
      />
      <PerformanceAlertBanner rows={rows} prevScoreMap={prevScoreMap} />
      <LeaderboardHighlights topPerformer={topPerformer} mostImproved={mostImproved} prevScoreMap={prevScoreMap} />
      <CompanyKpiCards rows={rows} />
      {showDeptAgg && <DepartmentAggregation deptAggRows={deptAggRows} />}

      {velocity && velocity.length > 0 && (
        <div className="rounded-xl border border-border p-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Mission Velocity - Last 12 Weeks
          </h4>
          <VelocityChart data={velocity} />
        </div>
      )}

      {/* Team summary */}
      <div className="flex items-center gap-4 rounded-xl border border-border p-4">
        <div
          className={cn(
            "inline-flex items-center justify-center h-12 w-12 rounded-xl border text-xl font-bold",
            RATING_COLORS[teamRating],
          )}
        >
          {teamRating}
        </div>
        <div>
          <p className="text-sm font-medium">Team Average</p>
          <p className="text-sm text-muted-foreground">
            {rows.filter((r) => r.tasksDone > 0).length} active agents · {rows.reduce((s, r) => s + r.tasksDone, 0)}{" "}
            tasks completed · {formatCents(rows.reduce((s, r) => s + r.totalSpendCents, 0))} total spend
          </p>
        </div>
      </div>

      <AgentKpiCards sorted={sorted} prevScoreMap={prevScoreMap} />
      {rows.length > 0 && <PerformanceInsights rows={rows} />}

      {/* Performance Score Trend */}
      {rows.length > 0 && agents && agents.length > 0 && (
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Performance Score Trend
            </h4>
            <Select value={effectiveTrendAgentId} onValueChange={setTrendAgentId}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="Select agent" />
              </SelectTrigger>
              <SelectContent>
                {agents
                  .filter((a) => a.status !== "terminated")
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {trendSnapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No performance snapshots found.</p>
          ) : (
            <PerformanceTrendChart snapshots={trendSnapshots} />
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState icon={BarChart3} message="No agents to evaluate." />
      ) : (
        <PerformanceTable
          sorted={sorted}
          sortField={sortField}
          sortDir={sortDir}
          prevScoreMap={prevScoreMap}
          expandedRowId={expandedRowId}
          onToggleExpand={(id) => setExpandedRowId(expandedRowId === id ? null : id)}
          onToggleSort={toggleSort}
        />
      )}

      {rows.length > 0 && issues && issues.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <WorkloadDistribution rows={rows} issues={issues} />
          <AgentPipeline rows={rows} issues={issues} />
        </div>
      )}

      {rows.length > 0 && projects && projects.length > 0 && (
        <PerformanceByProject
          rows={rows}
          issues={issues ?? []}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
        />
      )}
    </div>
  );
}

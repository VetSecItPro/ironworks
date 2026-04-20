import type { ActivityEvent, Agent } from "@ironworksai/shared";
import { useQuery } from "@tanstack/react-query";
import { Download, History } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { activityApi } from "../api/activity";
import { agentsApi } from "../api/agents";
import { goalsApi } from "../api/goals";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { ActivityHeatmap } from "../components/activity/ActivityHeatmap";
import { ActivityTimeline } from "../components/activity/ActivityTimeline";
import { aggregateEvents, getTimeGroup, isAggregated } from "../components/activity/activityHelpers";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { usePageTitle } from "../hooks/usePageTitle";
import { exportToCSV } from "../lib/exportCSV";
import { queryKeys } from "../lib/queryKeys";
import type { AggregatedGroup } from "../types/dashboard";

export function Activity() {
  usePageTitle("Activity");
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [filter, setFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Activity" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: goals } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.identifier ?? i.id.slice(0, 8));
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    for (const p of projects ?? []) map.set(`project:${p.id}`, p.name);
    for (const g of goals ?? []) map.set(`goal:${g.id}`, g.title);
    return map;
  }, [issues, agents, projects, goals]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [issues]);

  const filtered = useMemo(() => {
    if (!data) return null;
    let result = data;
    if (filter !== "all") result = result.filter((e) => e.entityType === filter);
    if (agentFilter !== "all") result = result.filter((e) => e.actorType === "agent" && e.actorId === agentFilter);
    if (dateFrom) {
      const fromTs = new Date(dateFrom).getTime();
      result = result.filter((e) => new Date(e.createdAt).getTime() >= fromTs);
    }
    if (dateTo) {
      const toTs = new Date(dateTo).getTime() + 86400000;
      result = result.filter((e) => new Date(e.createdAt).getTime() < toTs);
    }
    return result;
  }, [data, filter, agentFilter, dateFrom, dateTo]);

  const groupedItems = useMemo(() => {
    if (!filtered) return null;
    const aggregated = aggregateEvents(filtered, agentMap);
    const groups = new Map<string, (ActivityEvent | AggregatedGroup)[]>();
    for (const item of aggregated) {
      const date = isAggregated(item) ? new Date(item.latestEvent.createdAt) : new Date(item.createdAt);
      const group = getTimeGroup(date);
      const existing = groups.get(group) ?? [];
      existing.push(item);
      groups.set(group, existing);
    }
    return groups;
  }, [filtered, agentMap]);

  const entityTypes = data ? [...new Set(data.map((e) => e.entityType))].sort() : [];

  const totalEvents = filtered?.length ?? 0;

  if (!selectedCompanyId) {
    return <EmptyState icon={History} message="Select a company to view activity." />;
  }

  if (isLoading && !data) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Audit trail of every action across your company.</p>
          {totalEvents > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalEvents} event{totalEvents !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => {
              if (!filtered || filtered.length === 0) return;
              exportToCSV(
                filtered.map((e) => ({
                  timestamp: new Date(e.createdAt).toISOString(),
                  action: e.action,
                  entityType: e.entityType,
                  entityId: e.entityId,
                  actorType: e.actorType,
                  actorId: e.actorId,
                  actorName: e.actorType === "agent" ? (agentMap.get(e.actorId)?.name ?? e.actorId) : "Board",
                })),
                "activity-export",
                [
                  { key: "timestamp", label: "Timestamp" },
                  { key: "action", label: "Action" },
                  { key: "entityType", label: "Entity Type" },
                  { key: "entityId", label: "Entity ID" },
                  { key: "actorType", label: "Actor Type" },
                  { key: "actorName", label: "Actor" },
                ],
              );
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {entityTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {agents && agents.length > 0 && (
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[130px] h-8 text-xs"
            placeholder="From"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[130px] h-8 text-xs"
            placeholder="To"
          />
        </div>
      </div>

      {data && data.length > 0 && <ActivityHeatmap events={data} />}

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {totalEvents === 0 && <EmptyState icon={History} message="No activity yet." />}

      {groupedItems && groupedItems.size > 0 && (
        <ActivityTimeline
          groupedItems={groupedItems}
          agentMap={agentMap}
          entityNameMap={entityNameMap}
          entityTitleMap={entityTitleMap}
        />
      )}
    </div>
  );
}

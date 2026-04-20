import { type Agent, type AgentLifecycleStage, DEPARTMENT_LABELS, DEPARTMENTS } from "@ironworksai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bot,
  GitBranch,
  Layers,
  LayoutGrid,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  UserPlus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { useLocation, useNavigate } from "@/lib/router";
import { agentsApi, type OrgNode } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { issuesApi } from "../api/issues";
import {
  AgentCompareModal,
  AgentGridView,
  AgentListView,
  AgentOrgTreeNode,
  AgentPipelineView,
  AgentYamlExportButton,
  AgentYamlImportModal,
} from "../components/agents-page";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { PageTabBar } from "../components/PageTabBar";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { usePageTitle } from "../hooks/usePageTitle";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";

type FilterTab = "all" | "active" | "paused" | "error";

function matchesFilter(status: string, tab: FilterTab, showTerminated: boolean): boolean {
  if (status === "terminated") return showTerminated;
  if (tab === "all") return true;
  if (tab === "active") return status === "active" || status === "running" || status === "idle";
  if (tab === "paused") return status === "paused";
  if (tab === "error") return status === "error";
  return true;
}

function filterAgents(agents: Agent[], tab: FilterTab, showTerminated: boolean): Agent[] {
  return agents
    .filter((a) => matchesFilter(a.status, tab, showTerminated))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function filterOrgTree(nodes: OrgNode[], tab: FilterTab, showTerminated: boolean): OrgNode[] {
  return nodes
    .reduce<OrgNode[]>((acc, node) => {
      const filteredReports = filterOrgTree(node.reports, tab, showTerminated);
      if (matchesFilter(node.status, tab, showTerminated) || filteredReports.length > 0) {
        acc.push({ ...node, reports: filteredReports });
      }
      return acc;
    }, [])
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function Agents() {
  usePageTitle("Agents");
  const { selectedCompanyId } = useCompany();
  const { openNewAgent, openHireAgent } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile } = useSidebar();
  const pathSegment = location.pathname.split("/").pop() ?? "all";
  const tab: FilterTab =
    pathSegment === "all" || pathSegment === "active" || pathSegment === "paused" || pathSegment === "error"
      ? pathSegment
      : "all";
  const [view, setView] = useState<"list" | "grid" | "org" | "pipeline">("org");
  const forceListView = isMobile;
  const effectiveView: "list" | "grid" | "org" | "pipeline" = forceListView ? "list" : view;
  const [showTerminated, setShowTerminated] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [employmentFilter, setEmploymentFilter] = useState<string>("all");
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 3) next.add(id);
      return next;
    });
  }, []);

  const invokeMutation = useMutation({
    mutationFn: (agentId: string) => agentsApi.invoke(agentId, selectedCompanyId!),
  });

  const {
    data: agents,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: orgTree } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
    enabled: !!selectedCompanyId && effectiveView === "org",
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && effectiveView === "pipeline",
    staleTime: 30_000,
  });

  const liveRunByAgent = useMemo(() => {
    const map = new Map<string, { runId: string; liveCount: number }>();
    for (const r of runs ?? []) {
      if (r.status !== "running" && r.status !== "queued") continue;
      const existing = map.get(r.agentId);
      if (existing) {
        existing.liveCount += 1;
        continue;
      }
      map.set(r.agentId, { runId: r.id, liveCount: 1 });
    }
    return map;
  }, [runs]);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const completedIssuesByAgent = useMemo(() => {
    const map = new Map<string, number>();
    for (const issue of issues ?? []) {
      if (issue.status !== "done") continue;
      const assigneeId = (issue as unknown as Record<string, unknown>).assigneeAgentId as string | null;
      if (!assigneeId) continue;
      map.set(assigneeId, (map.get(assigneeId) ?? 0) + 1);
    }
    return map;
  }, [issues]);

  const deriveLifecycleStage = useCallback(
    (agent: Agent): AgentLifecycleStage => {
      if (agent.status === "terminated") return "retired";
      const completedCount = completedIssuesByAgent.get(agent.id) ?? 0;
      if (agent.status === "active" || agent.status === "running") {
        return completedCount >= 5 ? "production" : "pilot";
      }
      return "draft";
    },
    [completedIssuesByAgent],
  );

  useEffect(() => {
    setBreadcrumbs([{ label: "Agents" }]);
  }, [setBreadcrumbs]);

  if (!selectedCompanyId) return <EmptyState icon={Bot} message="Select a company to view agents." />;
  if (isLoading && !agents) return <PageSkeleton variant="list" />;

  const filtered = filterAgents(agents ?? [], tab, showTerminated).filter((a) => {
    if (
      agentSearch.trim() &&
      !a.name.toLowerCase().includes(agentSearch.toLowerCase()) &&
      !(a.title ?? "").toLowerCase().includes(agentSearch.toLowerCase())
    )
      return false;
    if (departmentFilter !== "all" && (a as unknown as Record<string, unknown>).department !== departmentFilter)
      return false;
    const empType = ((a as unknown as Record<string, unknown>).employmentType as string) ?? "full_time";
    if (employmentFilter !== "all" && empType !== employmentFilter) return false;
    return true;
  });
  const filteredOrg = filterOrgTree(orgTree ?? [], tab, showTerminated);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => navigate(`/agents/${v}`)}>
          <PageTabBar
            items={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
              { value: "error", label: "Error" },
            ]}
            value={tab}
            onValueChange={(v) => navigate(`/agents/${v}`)}
          />
        </Tabs>
        <div className="flex items-center gap-2">
          <div className="relative w-40 sm:w-52 md:w-64">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
              placeholder="Search agents..."
              aria-label="Search agents"
              className="pl-7 text-xs h-8"
            />
          </div>
          <div className="relative">
            <button
              type="button"
              className={cn(
                "flex items-center gap-1.5 px-2 py-1.5 text-xs transition-colors border border-border",
                filtersOpen || showTerminated
                  ? "text-foreground bg-accent"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <SlidersHorizontal className="h-3 w-3" />
              Filters
              {(showTerminated || departmentFilter !== "all" || employmentFilter !== "all") && (
                <span className="ml-0.5 px-1 bg-foreground/10 rounded text-[10px]">
                  {(showTerminated ? 1 : 0) +
                    (departmentFilter !== "all" ? 1 : 0) +
                    (employmentFilter !== "all" ? 1 : 0)}
                </span>
              )}
            </button>
            {filtersOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-52 border border-border bg-popover shadow-md p-1 space-y-0.5">
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-left hover:bg-accent/50 transition-colors"
                  onClick={() => setShowTerminated(!showTerminated)}
                >
                  <span
                    className={cn(
                      "flex items-center justify-center h-3.5 w-3.5 border border-border rounded-sm",
                      showTerminated && "bg-foreground",
                    )}
                  >
                    {showTerminated && <span className="text-background text-[10px] leading-none">&#10003;</span>}
                  </span>
                  Show terminated
                </button>
                <div className="px-2 py-1.5">
                  <label
                    htmlFor="agents-dept-filter"
                    className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1"
                  >
                    Department
                  </label>
                  <select
                    id="agents-dept-filter"
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="w-full text-xs bg-transparent border border-border rounded px-1.5 py-1"
                  >
                    <option value="all">All departments</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {(DEPARTMENT_LABELS as Record<string, string>)[d] ?? d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="px-2 py-1.5">
                  <label
                    htmlFor="agents-employment-filter"
                    className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1"
                  >
                    Employment Type
                  </label>
                  <select
                    id="agents-employment-filter"
                    value={employmentFilter}
                    onChange={(e) => setEmploymentFilter(e.target.value)}
                    className="w-full text-xs bg-transparent border border-border rounded px-1.5 py-1"
                  >
                    <option value="all">All types</option>
                    <option value="full_time">Full-Time</option>
                    <option value="contractor">Contractor</option>
                  </select>
                </div>
              </div>
            )}
          </div>
          {!forceListView && (
            <div className="flex items-center border border-border">
              <button
                type="button"
                className={cn(
                  "p-1.5 transition-colors",
                  effectiveView === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
                )}
                onClick={() => setView("list")}
                title="List view"
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={cn(
                  "p-1.5 transition-colors",
                  effectiveView === "grid" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
                )}
                onClick={() => setView("grid")}
                title="Grid view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={cn(
                  "p-1.5 transition-colors",
                  effectiveView === "org" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
                )}
                onClick={() => setView("org")}
                title="Org chart view"
              >
                <GitBranch className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={cn(
                  "p-1.5 transition-colors",
                  effectiveView === "pipeline"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50",
                )}
                onClick={() => setView("pipeline")}
                title="Pipeline view"
              >
                <Layers className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {compareIds.size > 0 && (
            <Button size="sm" variant="outline" onClick={() => setShowCompare(true)}>
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              Compare ({compareIds.size})
            </Button>
          )}
          {selectedCompanyId && (
            <>
              <AgentYamlExportButton companyId={selectedCompanyId} />
              <AgentYamlImportModal
                companyId={selectedCompanyId}
                onImported={() => {
                  // Invalidate agent list so newly imported agents appear immediately
                  void queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
                }}
              />
            </>
          )}
          <Button size="sm" variant="outline" onClick={openHireAgent}>
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            Hire Agent
          </Button>
          <Button size="sm" variant="outline" onClick={openNewAgent}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Agent
          </Button>
        </div>
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} agent{filtered.length !== 1 ? "s" : ""}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      {agents && agents.length === 0 && (
        <EmptyState
          icon={Bot}
          message="Create your first agent to get started."
          action="New Agent"
          onAction={openNewAgent}
        />
      )}

      {effectiveView === "list" && (
        <AgentListView
          agents={filtered}
          liveRunByAgent={liveRunByAgent}
          compareIds={compareIds}
          toggleCompare={toggleCompare}
          onInvoke={(id) => invokeMutation.mutate(id)}
        />
      )}
      {effectiveView === "list" && agents && agents.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No agents match the selected filter.</p>
      )}

      {effectiveView === "grid" && <AgentGridView agents={filtered} liveRunByAgent={liveRunByAgent} />}
      {effectiveView === "grid" && agents && agents.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No agents match the selected filter.</p>
      )}

      {effectiveView === "org" && filteredOrg.length > 0 && (
        <div className="border border-border py-1">
          {filteredOrg.map((node) => (
            <AgentOrgTreeNode key={node.id} node={node} depth={0} agentMap={agentMap} liveRunByAgent={liveRunByAgent} />
          ))}
        </div>
      )}
      {effectiveView === "org" && orgTree && orgTree.length > 0 && filteredOrg.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No agents match the selected filter.</p>
      )}
      {effectiveView === "org" && orgTree && orgTree.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No organizational hierarchy defined.</p>
      )}

      {effectiveView === "pipeline" && (
        <AgentPipelineView agents={agents ?? []} deriveLifecycleStage={deriveLifecycleStage} />
      )}

      {showCompare && compareIds.size > 0 && (
        <AgentCompareModal
          agents={(agents ?? []).filter((a) => compareIds.has(a.id))}
          liveRunByAgent={liveRunByAgent}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  );
}

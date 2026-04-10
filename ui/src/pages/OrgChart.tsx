import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useNavigate } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { agentsApi, type OrgNode } from "../api/agents";
import { issuesApi } from "../api/issues";
import { hiringApi } from "../api/hiring";
import { expertiseMapApi } from "../api/expertiseMap";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { agentUrl } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Network } from "lucide-react";
import { AGENT_ROLE_LABELS, type Agent, type Issue } from "@ironworksai/shared";
import {
  layoutForest, flattenLayout, collectEdges, CARD_W, PADDING,
  OrgChartCard, OrgChartSvgLayer, OrgChartMinimap,
  OrgChartToolbar, OrgChartZoomControls, OrgChartVacantPositions,
  type LayoutNode,
} from "../components/org-chart";

const CARD_H = 130;

const roleLabels: Record<string, string> = AGENT_ROLE_LABELS;
function roleLabel(role: string): string {
  return roleLabels[role] ?? role;
}

// Mock data for local dev preview when no agents exist
const MOCK_ORG: OrgNode[] = [
  { id: "m-ceo", name: "CEO", role: "ceo", status: "active", reports: [
    { id: "m-cto", name: "CTO", role: "cto", status: "active", reports: [
      { id: "m-eng", name: "SeniorEngineer", role: "engineer", status: "active", reports: [] },
      { id: "m-devops", name: "DevOpsEngineer", role: "engineer", status: "active", reports: [] },
      { id: "m-sec", name: "SecurityEngineer", role: "engineer", status: "active", reports: [] },
    ]},
    { id: "m-cfo", name: "CFO", role: "cfo", status: "active", reports: [] },
    { id: "m-cmo", name: "CMO", role: "cmo", status: "active", reports: [
      { id: "m-content", name: "ContentMarketer", role: "marketer", status: "active", reports: [] },
    ]},
    { id: "m-vphr", name: "VPofHR", role: "director", status: "active", reports: [] },
    { id: "m-legal", name: "LegalCounsel", role: "director", status: "active", reports: [] },
    { id: "m-comp", name: "ComplianceDirector", role: "director", status: "active", reports: [] },
    { id: "m-ux", name: "UXDesigner", role: "designer", status: "idle", reports: [] },
  ]},
];
const MOCK_AGENTS: Agent[] = [
  { id: "m-ceo", name: "CEO", role: "ceo", title: "Chief Executive Officer", status: "active", icon: "crown", adapterType: "ollama_cloud", adapterConfig: { model: "kimi-k2.5" } },
  { id: "m-cto", name: "CTO", role: "cto", title: "Chief Technology Officer", status: "active", icon: "code", adapterType: "ollama_cloud", adapterConfig: { model: "deepseek-v3.2" } },
  { id: "m-cfo", name: "CFO", role: "cfo", title: "Chief Financial Officer", status: "active", icon: "dollar-sign", adapterType: "ollama_cloud", adapterConfig: { model: "deepseek-v3.2" } },
  { id: "m-cmo", name: "CMO", role: "cmo", title: "Chief Marketing Officer", status: "active", icon: "megaphone", adapterType: "ollama_cloud", adapterConfig: { model: "kimi-k2.5" } },
  { id: "m-vphr", name: "VPofHR", role: "director", title: "VP of Human Resources", status: "active", icon: "users", adapterType: "ollama_cloud", adapterConfig: { model: "qwen3.5:397b" } },
  { id: "m-legal", name: "LegalCounsel", role: "director", title: "Legal Counsel", status: "active", icon: "gavel", adapterType: "ollama_cloud", adapterConfig: { model: "deepseek-v3.2" } },
  { id: "m-comp", name: "ComplianceDirector", role: "director", title: "Compliance Director", status: "active", icon: "scale", adapterType: "ollama_cloud", adapterConfig: { model: "deepseek-v3.2" } },
  { id: "m-eng", name: "SeniorEngineer", role: "engineer", title: "Senior Full-Stack Engineer", status: "active", icon: "terminal", adapterType: "ollama_cloud", adapterConfig: { model: "deepseek-v3.2" } },
  { id: "m-devops", name: "DevOpsEngineer", role: "engineer", title: "DevOps & Infrastructure Engineer", status: "active", icon: "server", adapterType: "ollama_cloud", adapterConfig: { model: "deepseek-v3.2" } },
  { id: "m-sec", name: "SecurityEngineer", role: "engineer", title: "Application Security Engineer", status: "active", icon: "shield", adapterType: "ollama_cloud", adapterConfig: { model: "deepseek-v3.2" } },
  { id: "m-ux", name: "UXDesigner", role: "designer", title: "UX Designer", status: "idle", icon: "palette", adapterType: "ollama_cloud", adapterConfig: { model: "kimi-k2.5" } },
  { id: "m-content", name: "ContentMarketer", role: "marketer", title: "Content Marketer", status: "active", icon: "pen-line", adapterType: "ollama_cloud", adapterConfig: { model: "qwen3.5:397b" } },
] as unknown as Agent[];

export function OrgChart() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  const { data: orgTree, isLoading } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
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

  const { data: skillMap } = useQuery({
    queryKey: ["expertise-map", "skills", selectedCompanyId!] as const,
    queryFn: () => expertiseMapApi.skills(selectedCompanyId!).catch(() => null),
    enabled: !!selectedCompanyId,
    staleTime: 120_000,
    retry: false,
  });

  const { data: hiringRequests } = useQuery({
    queryKey: queryKeys.hiring.list(selectedCompanyId!),
    queryFn: () => hiringApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });

  const skillsByAgent = useMemo(() => {
    const map = new Map<string, NonNullable<typeof skillMap>["agents"][number]>();
    for (const agent of skillMap?.agents ?? []) map.set(agent.agentId, agent);
    return map;
  }, [skillMap]);

  const useMockData = !orgTree || orgTree.length === 0;
  const effectiveOrg = useMockData ? MOCK_ORG : orgTree ?? [];
  const effectiveAgents = useMockData ? MOCK_AGENTS : agents ?? [];

  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of effectiveAgents) m.set(a.id, a);
    return m;
  }, [effectiveAgents]);

  const taskCountByAgent = useMemo(() => {
    const map = new Map<string, number>();
    for (const issue of (issues ?? []) as Issue[]) {
      if (issue.assigneeAgentId && (issue.status === "in_progress" || issue.status === "todo")) {
        map.set(issue.assigneeAgentId, (map.get(issue.assigneeAgentId) ?? 0) + 1);
      }
    }
    return map;
  }, [issues]);

  const perfScoreByAgent = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of effectiveAgents) {
      const agentIssues = (issues ?? []).filter((i: Issue) => i.assigneeAgentId === a.id);
      const done = agentIssues.filter((i: Issue) => i.status === "done").length;
      const total = agentIssues.length;
      if (total > 0) map.set(a.id, Math.round((done / total) * 100));
    }
    return map;
  }, [issues, effectiveAgents]);

  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Org Chart" }]);
  }, [setBreadcrumbs]);

  const layout = useMemo(() => layoutForest(effectiveOrg), [effectiveOrg]);
  const allNodes = useMemo(() => flattenLayout(layout), [layout]);
  const edges = useMemo(() => collectEdges(layout), [layout]);

  const departmentGroups = useMemo(() => {
    const groups = new Map<string, { nodes: LayoutNode[]; dept: string }>();
    for (const node of allNodes) {
      const agent = agentMap.get(node.id);
      const dept = (agent as unknown as Record<string, unknown> | undefined)?.department as string | undefined;
      if (dept) {
        if (!groups.has(dept)) groups.set(dept, { nodes: [], dept });
        groups.get(dept)!.nodes.push(node);
      }
    }
    return Array.from(groups.values()).filter((g) => g.nodes.length > 1);
  }, [allNodes, agentMap]);

  const bounds = useMemo(() => {
    if (allNodes.length === 0) return { width: 800, height: 600 };
    let maxX = 0, maxY = 0;
    for (const n of allNodes) {
      maxX = Math.max(maxX, n.x + CARD_W);
      maxY = Math.max(maxY, n.y + CARD_H);
    }
    return { width: maxX + PADDING, height: maxY + PADDING };
  }, [allNodes]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current || allNodes.length === 0 || !containerRef.current) return;
    hasInitialized.current = true;
    const container = containerRef.current;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const scaleX = (containerW - 40) / bounds.width;
    const scaleY = (containerH - 40) / bounds.height;
    const fitZoom = Math.min(scaleX, scaleY, 1);
    const chartW = bounds.width * fitZoom;
    const chartH = bounds.height * fitZoom;
    setZoom(fitZoom);
    setPan({ x: (containerW - chartW) / 2, y: (containerH - chartH) / 2 });
  }, [allNodes, bounds]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-org-card]")) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  }, [dragging]);

  const handleMouseUp = useCallback(() => { setDragging(false); }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(zoom * factor, 0.2), 2);
    const scale = newZoom / zoom;
    setPan({ x: mouseX - scale * (mouseX - pan.x), y: mouseY - scale * (mouseY - pan.y) });
    setZoom(newZoom);
  }, [zoom, pan]);

  const handleZoomPan = useCallback((newZoom: number, newPan: { x: number; y: number }) => {
    setZoom(newZoom);
    setPan(newPan);
  }, []);

  if (!selectedCompanyId) return <EmptyState icon={Network} message="Select a company to view the org chart." />;
  if (isLoading) return <PageSkeleton variant="org-chart" />;
  if (orgTree && orgTree.length === 0) return <EmptyState icon={Network} message="No organizational hierarchy defined." />;

  return (
    <div className="flex flex-col -mx-4 -mt-3 -mb-3" style={{ height: "calc(100vh - 40px)", width: "calc(100% + 2rem)" }}>
      <OrgChartToolbar containerRef={containerRef} />
      <div
        ref={containerRef}
        className="w-full flex-1 overflow-hidden relative bg-muted/20 border border-border rounded-lg"
        style={{ cursor: dragging ? "grabbing" : "grab" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <OrgChartZoomControls zoom={zoom} pan={pan} bounds={bounds} containerRef={containerRef} onZoomPan={handleZoomPan} />
        <OrgChartMinimap allNodes={allNodes} edges={edges} bounds={bounds} pan={pan} zoom={zoom} containerRef={containerRef} />
        <OrgChartSvgLayer pan={pan} zoom={zoom} edges={edges} departmentGroups={departmentGroups} />

        {/* Card layer */}
        <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
          {allNodes.map((node) => (
            <OrgChartCard
              key={node.id}
              node={node}
              agent={agentMap.get(node.id)}
              activeTasks={taskCountByAgent.get(node.id) ?? 0}
              perfScore={perfScoreByAgent.get(node.id)}
              isHovered={hoveredNode === node.id}
              skillProfile={skillsByAgent.get(node.id)}
              onNavigate={() => {
                const agent = agentMap.get(node.id);
                navigate(agent ? agentUrl(agent) : `/agents/${node.id}`);
              }}
              onMouseEnter={() => {
                if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
                hoverTimeout.current = setTimeout(() => setHoveredNode(node.id), 300);
              }}
              onMouseLeave={() => {
                if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
                setHoveredNode(null);
              }}
            />
          ))}
        </div>

        <OrgChartVacantPositions
          hiringRequests={(hiringRequests ?? []) as Array<{ id: string; status: string; role: string; title?: string }>}
          roleLabel={roleLabel}
        />
      </div>
    </div>
  );
}

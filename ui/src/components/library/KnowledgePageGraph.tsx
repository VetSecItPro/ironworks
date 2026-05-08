import { Background, Controls, type Edge, type Node, type NodeMouseHandler, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type GraphResult, knowledgeApi } from "../../api/knowledge";

interface NodeData extends Record<string, unknown> {
  label: string;
  isCurrent: boolean;
}

function layoutNodes(graph: GraphResult): Node<NodeData>[] {
  const current = graph.nodes.find((n) => n.isCurrent);
  const others = graph.nodes.filter((n) => !n.isCurrent);

  const cx = 0;
  const cy = 0;
  const radius = 180;

  const nodes: Node<NodeData>[] = [];
  if (current) {
    nodes.push({
      id: current.id,
      type: "default",
      position: { x: cx, y: cy },
      data: { label: current.title, isCurrent: true },
      draggable: true,
      style: {
        background: "var(--color-primary, #2563eb)",
        color: "white",
        border: "2px solid var(--color-ring, #1d4ed8)",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        padding: "6px 10px",
      },
    });
  }
  others.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, others.length);
    nodes.push({
      id: n.id,
      type: "default",
      position: { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) },
      data: { label: n.title, isCurrent: false },
      draggable: true,
      style: {
        background: "var(--color-card, #ffffff)",
        border: "1px solid var(--color-border, #e5e7eb)",
        borderRadius: 8,
        fontSize: 12,
        padding: "6px 10px",
      },
    });
  });
  return nodes;
}

function layoutEdges(graph: GraphResult): Edge[] {
  return graph.edges.map((e, i) => {
    const unresolved = e.toId === null;
    const targetId = e.toId ?? `unresolved-${i}`;
    return {
      id: `${e.fromId}->${targetId}-${i}`,
      source: e.fromId,
      target: targetId,
      animated: false,
      style: unresolved
        ? { strokeDasharray: "4 4", stroke: "var(--color-muted-foreground, #94a3b8)", opacity: 0.6 }
        : { stroke: "var(--color-foreground, #475569)" },
      label: e.anchor ? `#${e.anchor}` : undefined,
      labelStyle: { fontSize: 10, fill: "var(--color-muted-foreground, #94a3b8)" },
    };
  });
}

export function KnowledgePageGraph({
  pageId,
  hops = 2,
  onNavigate,
}: {
  pageId: string;
  hops?: 1 | 2;
  onNavigate?: (id: string) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["knowledge-page-graph", pageId, hops],
    queryFn: () => knowledgeApi.getGraph(pageId, hops),
    enabled: !!pageId,
  });

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [] as Node<NodeData>[], edges: [] as Edge[] };
    return { nodes: layoutNodes(data), edges: layoutEdges(data) };
  }, [data]);

  const handleNodeClick: NodeMouseHandler = (_event, node) => {
    const data = node.data as NodeData | undefined;
    if (data?.isCurrent) return;
    onNavigate?.(node.id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full text-sm text-muted-foreground" style={{ height: 400 }}>
        Loading graph...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center w-full text-sm text-destructive" style={{ height: 400 }}>
        {error instanceof Error ? error.message : "Failed to load graph"}
      </div>
    );
  }

  const hasNeighbors = (data?.nodes.length ?? 0) > 1 || (data?.edges.length ?? 0) > 0;
  if (!hasNeighbors) {
    return (
      <div className="flex items-center justify-center w-full text-sm text-muted-foreground" style={{ height: 400 }}>
        No links from this page yet
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height: 400 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

import { DEPARTMENT_LABELS } from "@ironworksai/shared";
import type { LayoutNode } from "./orgChartLayout";
import { CARD_H, CARD_W } from "./orgChartLayout";

const departmentSvgColor: Record<string, string> = {
  executive: "rgba(245,158,11,0.04)",
  engineering: "rgba(59,130,246,0.04)",
  design: "rgba(168,85,247,0.04)",
  operations: "rgba(16,185,129,0.04)",
  finance: "rgba(34,197,94,0.04)",
  security: "rgba(239,68,68,0.04)",
  research: "rgba(6,182,212,0.04)",
  marketing: "rgba(236,72,153,0.04)",
  support: "rgba(249,115,22,0.04)",
  compliance: "rgba(99,102,241,0.04)",
  hr: "rgba(139,92,246,0.04)",
};

const departmentLabels = DEPARTMENT_LABELS as Record<string, string>;

export function OrgChartSvgLayer({
  pan,
  zoom,
  edges,
  departmentGroups,
}: {
  pan: { x: number; y: number };
  zoom: number;
  edges: Array<{ parent: LayoutNode; child: LayoutNode }>;
  departmentGroups: Array<{ nodes: LayoutNode[]; dept: string }>;
}) {
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      {/* Background grid for blueprint feel (12.14) */}
      <defs>
        <pattern id="blueprint-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--border)" strokeWidth="0.3" opacity="0.5" />
        </pattern>
        <pattern id="blueprint-grid-major" width="200" height="200" patternUnits="userSpaceOnUse">
          <path d="M 200 0 L 0 0 0 200" fill="none" stroke="var(--border)" strokeWidth="0.6" opacity="0.3" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#blueprint-grid)" />
      <rect width="100%" height="100%" fill="url(#blueprint-grid-major)" />

      <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
        {/* Department background groupings */}
        {departmentGroups.map(({ nodes: dNodes, dept }) => {
          const pad = 20;
          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          for (const n of dNodes) {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + CARD_W);
            maxY = Math.max(maxY, n.y + CARD_H);
          }
          const deptColor = departmentSvgColor[dept] ?? "rgba(100,100,100,0.04)";
          return (
            <g key={`dept-bg-${dept}`}>
              <rect
                x={minX - pad}
                y={minY - pad - 16}
                width={maxX - minX + pad * 2}
                height={maxY - minY + pad * 2 + 16}
                rx={12}
                fill={deptColor}
                stroke="none"
              />
              <text
                x={minX - pad + 8}
                y={minY - pad - 4}
                fontSize={10}
                fontWeight={600}
                fill="var(--muted-foreground)"
                opacity={0.6}
                style={{ textTransform: "uppercase" as const, letterSpacing: "0.05em" }}
              >
                {departmentLabels[dept] ?? dept}
              </text>
            </g>
          );
        })}
        {/* Curved bezier connecting lines (left-to-right) */}
        {edges.map(({ parent, child }) => {
          const x1 = parent.x + CARD_W;
          const y1 = parent.y + CARD_H / 2;
          const x2 = child.x;
          const y2 = child.y + CARD_H / 2;
          const cx1 = x1 + (x2 - x1) * 0.5;
          const cx2 = x2 - (x2 - x1) * 0.5;

          return (
            <path
              key={`${parent.id}-${child.id}`}
              d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="var(--border)"
              strokeWidth={1.5}
            />
          );
        })}
      </g>
    </svg>
  );
}

export function OrgChartMinimap({
  allNodes,
  edges,
  bounds,
  pan,
  zoom,
  containerRef,
}: {
  allNodes: LayoutNode[];
  edges: Array<{ parent: LayoutNode; child: LayoutNode }>;
  bounds: { width: number; height: number };
  pan: { x: number; y: number };
  zoom: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (allNodes.length <= 5) return null;

  return (
    <div className="absolute bottom-3 left-3 z-10 w-36 h-24 rounded border border-border bg-background/80 backdrop-blur-sm overflow-hidden pointer-events-none">
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${bounds.width} ${bounds.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Minimap edges */}
        {edges.map(({ parent, child }) => (
          <line
            key={`mm-${parent.id}-${child.id}`}
            x1={parent.x + CARD_W / 2}
            y1={parent.y + CARD_H / 2}
            x2={child.x + CARD_W / 2}
            y2={child.y + CARD_H / 2}
            stroke="var(--border)"
            strokeWidth={3}
          />
        ))}
        {/* Minimap nodes */}
        {allNodes.map((node) => (
          <rect
            key={`mm-${node.id}`}
            x={node.x}
            y={node.y}
            width={CARD_W}
            height={CARD_H}
            rx={4}
            fill="var(--primary)"
            opacity={0.4}
          />
        ))}
        {/* Viewport indicator */}
        {containerRef.current && (
          <rect
            x={-pan.x / zoom}
            y={-pan.y / zoom}
            width={containerRef.current.clientWidth / zoom}
            height={containerRef.current.clientHeight / zoom}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={4}
            rx={4}
            opacity={0.6}
          />
        )}
      </svg>
    </div>
  );
}

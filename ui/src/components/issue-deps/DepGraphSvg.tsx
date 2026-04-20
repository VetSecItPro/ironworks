import type { Issue } from "@ironworksai/shared";
import { cn } from "../../lib/utils";

interface DepGraphSvgProps {
  issue: Issue;
  blockers: Issue[];
  blocked: Issue[];
  criticalPath: Set<string>;
}

export function DepGraphSvg({ issue, blockers, blocked, criticalPath }: DepGraphSvgProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 overflow-x-auto">
      <svg
        width={Math.max(600, (blockers.length + blocked.length + 1) * 200)}
        height={Math.max(120, Math.max(blockers.length, blocked.length, 1) * 50 + 40)}
        className="w-full"
        viewBox={`0 0 ${Math.max(600, (blockers.length + blocked.length + 1) * 200)} ${Math.max(120, Math.max(blockers.length, blocked.length, 1) * 50 + 40)}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" className="fill-muted-foreground/50" />
          </marker>
          <marker id="arrowhead-critical" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" className="fill-amber-500" />
          </marker>
        </defs>

        {blockers.map((b, i) => {
          const x = 20;
          const y = 20 + i * 50;
          const isCritical = criticalPath.has(b.id);
          return (
            <g key={b.id}>
              <rect
                x={x}
                y={y}
                width={160}
                height={36}
                rx={6}
                className={cn("fill-background", isCritical ? "stroke-amber-500 stroke-2" : "stroke-border")}
                strokeWidth={isCritical ? 2 : 1}
              />
              <text x={x + 10} y={y + 15} className="fill-muted-foreground text-[10px]" fontFamily="monospace">
                {b.identifier ?? b.id.slice(0, 8)}
              </text>
              <text x={x + 10} y={y + 28} className="fill-foreground text-[10px]">
                {b.title.length > 18 ? b.title.slice(0, 17) + "\u2026" : b.title}
              </text>
              <line
                x1={x + 160}
                y1={y + 18}
                x2={280}
                y2={Math.max(blockers.length, blocked.length, 1) * 25 + 8}
                className={isCritical ? "stroke-amber-500" : "stroke-muted-foreground/40"}
                strokeWidth={isCritical ? 2 : 1}
                strokeDasharray={isCritical ? undefined : "4 2"}
                markerEnd={isCritical ? "url(#arrowhead-critical)" : "url(#arrowhead)"}
              />
            </g>
          );
        })}

        {(() => {
          const centerX = 290;
          const centerY = Math.max(blockers.length, blocked.length, 1) * 25 - 10;
          return (
            <g>
              <rect
                x={centerX}
                y={centerY}
                width={160}
                height={36}
                rx={6}
                className="fill-primary/10 stroke-primary stroke-2"
              />
              <text
                x={centerX + 10}
                y={centerY + 15}
                className="fill-primary text-[10px]"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {issue.identifier ?? issue.id.slice(0, 8)}
              </text>
              <text x={centerX + 10} y={centerY + 28} className="fill-foreground text-[10px]" fontWeight="bold">
                {issue.title.length > 18 ? issue.title.slice(0, 17) + "\u2026" : issue.title}
              </text>
            </g>
          );
        })()}

        {blocked.map((b, i) => {
          const x = 560;
          const y = 20 + i * 50;
          const isCritical = criticalPath.has(b.id);
          const centerY = Math.max(blockers.length, blocked.length, 1) * 25 + 8;
          return (
            <g key={b.id}>
              <rect
                x={x}
                y={y}
                width={160}
                height={36}
                rx={6}
                className={cn("fill-background", isCritical ? "stroke-amber-500 stroke-2" : "stroke-border")}
                strokeWidth={isCritical ? 2 : 1}
              />
              <text x={x + 10} y={y + 15} className="fill-muted-foreground text-[10px]" fontFamily="monospace">
                {b.identifier ?? b.id.slice(0, 8)}
              </text>
              <text x={x + 10} y={y + 28} className="fill-foreground text-[10px]">
                {b.title.length > 18 ? b.title.slice(0, 17) + "\u2026" : b.title}
              </text>
              <line
                x1={450}
                y1={centerY}
                x2={x}
                y2={y + 18}
                className={isCritical ? "stroke-amber-500" : "stroke-muted-foreground/40"}
                strokeWidth={isCritical ? 2 : 1}
                strokeDasharray={isCritical ? undefined : "4 2"}
                markerEnd={isCritical ? "url(#arrowhead-critical)" : "url(#arrowhead)"}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

import { useMemo } from "react";
import { Link } from "@/lib/router";
import { StatusIcon } from "./StatusIcon";
import { cn } from "../lib/utils";
import { GitBranch, ArrowRight } from "lucide-react";
import type { Issue } from "@ironworksai/shared";

interface IssueDependencyGraphProps {
  issue: Issue;
  allIssues: Issue[];
}

interface DepNode {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  isCurrent: boolean;
}

interface DepEdge {
  from: string;
  to: string;
}

/**
 * Compute the longest chain (critical path) through a DAG of issue dependencies.
 * Returns a Set of issue IDs that are on the critical path.
 */
function computeCriticalPath(
  issue: Issue,
  allIssues: Issue[],
  blockers: Issue[],
  blocked: Issue[],
): Set<string> {
  // Build adjacency: blocker -> issue -> blocked
  const issueMap = new Map<string, Issue>();
  for (const i of allIssues) issueMap.set(i.id, i);

  // Walk upstream (blockers of blockers) and downstream (blocked of blocked)
  // Simple BFS longest-path from each blocker through current issue to each blocked
  const chainNodes: string[] = [];

  // Find deepest upstream chain
  function upstreamDepth(id: string, visited: Set<string>): string[] {
    if (visited.has(id)) return [];
    visited.add(id);
    const node = issueMap.get(id);
    if (!node) return [id];
    const deps = (node.dependsOn ?? [])
      .map((did) => issueMap.get(did))
      .filter((n): n is Issue => !!n);
    if (deps.length === 0) return [id];
    let longest: string[] = [];
    for (const dep of deps) {
      const chain = upstreamDepth(dep.id, visited);
      if (chain.length > longest.length) longest = chain;
    }
    return [...longest, id];
  }

  // Find deepest downstream chain
  function downstreamDepth(id: string, visited: Set<string>): string[] {
    if (visited.has(id)) return [];
    visited.add(id);
    const dependents = allIssues.filter((i) => (i.dependsOn ?? []).includes(id));
    if (dependents.length === 0) return [id];
    let longest: string[] = [];
    for (const dep of dependents) {
      const chain = downstreamDepth(dep.id, visited);
      if (chain.length > longest.length) longest = chain;
    }
    return [id, ...longest];
  }

  const upstream = upstreamDepth(issue.id, new Set());
  const downstream = downstreamDepth(issue.id, new Set());

  // Merge: upstream already includes issue.id at end, downstream starts with it
  const fullChain = [...upstream, ...downstream.slice(1)];
  return new Set(fullChain);
}

export function IssueDependencyGraph({ issue, allIssues }: IssueDependencyGraphProps) {
  const { blockers, blocked, nodes, edges, criticalPath } = useMemo(() => {
    const issueMap = new Map<string, Issue>();
    for (const i of allIssues) issueMap.set(i.id, i);

    // Issues that block this one (this issue dependsOn them)
    const blockerIssues = (issue.dependsOn ?? [])
      .map((id) => issueMap.get(id))
      .filter((i): i is Issue => !!i);

    // Issues that this one blocks (they dependOn this issue)
    const blockedIssues = allIssues.filter(
      (i) => i.id !== issue.id && (i.dependsOn ?? []).includes(issue.id),
    );

    const nodeMap = new Map<string, DepNode>();

    // Current issue
    nodeMap.set(issue.id, {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      status: issue.status,
      isCurrent: true,
    });

    for (const b of blockerIssues) {
      nodeMap.set(b.id, {
        id: b.id,
        identifier: b.identifier,
        title: b.title,
        status: b.status,
        isCurrent: false,
      });
    }

    for (const b of blockedIssues) {
      nodeMap.set(b.id, {
        id: b.id,
        identifier: b.identifier,
        title: b.title,
        status: b.status,
        isCurrent: false,
      });
    }

    const edgeList: DepEdge[] = [];
    for (const b of blockerIssues) {
      edgeList.push({ from: b.id, to: issue.id });
    }
    for (const b of blockedIssues) {
      edgeList.push({ from: issue.id, to: b.id });
    }

    const cp = computeCriticalPath(issue, allIssues, blockerIssues, blockedIssues);

    return {
      blockers: blockerIssues,
      blocked: blockedIssues,
      nodes: [...nodeMap.values()],
      edges: edgeList,
      criticalPath: cp,
    };
  }, [issue, allIssues]);

  if (blockers.length === 0 && blocked.length === 0) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <GitBranch className="h-3.5 w-3.5" />
        No dependencies
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* SVG dependency visualization */}
      <div className="rounded-lg border border-border bg-muted/20 p-4 overflow-x-auto">
        <svg
          width={Math.max(600, (blockers.length + blocked.length + 1) * 200)}
          height={Math.max(120, Math.max(blockers.length, blocked.length, 1) * 50 + 40)}
          className="w-full"
          viewBox={`0 0 ${Math.max(600, (blockers.length + blocked.length + 1) * 200)} ${Math.max(120, Math.max(blockers.length, blocked.length, 1) * 50 + 40)}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" className="fill-muted-foreground/50" />
            </marker>
            <marker
              id="arrowhead-critical"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" className="fill-amber-500" />
            </marker>
          </defs>

          {/* Blocker nodes (left column) */}
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
                  className={cn(
                    "fill-background",
                    isCritical ? "stroke-amber-500 stroke-2" : "stroke-border",
                  )}
                  strokeWidth={isCritical ? 2 : 1}
                />
                <text
                  x={x + 10}
                  y={y + 15}
                  className="fill-muted-foreground text-[10px]"
                  fontFamily="monospace"
                >
                  {b.identifier ?? b.id.slice(0, 8)}
                </text>
                <text
                  x={x + 10}
                  y={y + 28}
                  className="fill-foreground text-[10px]"
                >
                  {b.title.length > 18 ? b.title.slice(0, 17) + "\u2026" : b.title}
                </text>
                {/* Edge to current */}
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

          {/* Current node (center) */}
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
                <text
                  x={centerX + 10}
                  y={centerY + 28}
                  className="fill-foreground text-[10px]"
                  fontWeight="bold"
                >
                  {issue.title.length > 18 ? issue.title.slice(0, 17) + "\u2026" : issue.title}
                </text>
              </g>
            );
          })()}

          {/* Blocked nodes (right column) */}
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
                  className={cn(
                    "fill-background",
                    isCritical ? "stroke-amber-500 stroke-2" : "stroke-border",
                  )}
                  strokeWidth={isCritical ? 2 : 1}
                />
                <text
                  x={x + 10}
                  y={y + 15}
                  className="fill-muted-foreground text-[10px]"
                  fontFamily="monospace"
                >
                  {b.identifier ?? b.id.slice(0, 8)}
                </text>
                <text
                  x={x + 10}
                  y={y + 28}
                  className="fill-foreground text-[10px]"
                >
                  {b.title.length > 18 ? b.title.slice(0, 17) + "\u2026" : b.title}
                </text>
                {/* Edge from current */}
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

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-amber-500 rounded" />
          Critical path
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-muted-foreground/40 rounded border-dashed" style={{ borderTop: "1px dashed" }} />
          Dependency link
        </span>
      </div>

      {/* List view for accessibility and detail */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {blockers.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Blocked by ({blockers.length})
            </h4>
            <div className="border border-border rounded-lg divide-y divide-border">
              {blockers.map((b) => (
                <Link
                  key={b.id}
                  to={`/issues/${b.identifier ?? b.id}`}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent/20 transition-colors",
                    criticalPath.has(b.id) && "border-l-2 border-l-amber-500",
                  )}
                >
                  <StatusIcon status={b.status} />
                  <span className="font-mono text-muted-foreground shrink-0">
                    {b.identifier ?? b.id.slice(0, 8)}
                  </span>
                  <span className="truncate">{b.title}</span>
                  {criticalPath.has(b.id) && (
                    <span className="ml-auto text-[9px] font-medium text-amber-500">CRITICAL</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {blocked.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Blocks ({blocked.length})
            </h4>
            <div className="border border-border rounded-lg divide-y divide-border">
              {blocked.map((b) => (
                <Link
                  key={b.id}
                  to={`/issues/${b.identifier ?? b.id}`}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent/20 transition-colors",
                    criticalPath.has(b.id) && "border-l-2 border-l-amber-500",
                  )}
                >
                  <StatusIcon status={b.status} />
                  <span className="font-mono text-muted-foreground shrink-0">
                    {b.identifier ?? b.id.slice(0, 8)}
                  </span>
                  <span className="truncate">{b.title}</span>
                  {criticalPath.has(b.id) && (
                    <span className="ml-auto text-[9px] font-medium text-amber-500">CRITICAL</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import type { Issue } from "@ironworksai/shared";

export interface DepNode {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  isCurrent: boolean;
}

export interface DepEdge {
  from: string;
  to: string;
}

/**
 * Compute the longest chain (critical path) through a DAG of issue dependencies.
 * Returns a Set of issue IDs that are on the critical path.
 */
export function computeCriticalPath(
  issue: Issue,
  allIssues: Issue[],
  _blockers: Issue[],
  _blocked: Issue[],
): Set<string> {
  const issueMap = new Map<string, Issue>();
  for (const i of allIssues) issueMap.set(i.id, i);

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
  const fullChain = [...upstream, ...downstream.slice(1)];
  return new Set(fullChain);
}

import type { OrgNode } from "../../api/agents";

// Layout constants - horizontal tree (left-to-right)
export const CARD_W = 280;
export const CARD_H = 150;
export const GAP_X = 80; // horizontal gap between depth levels
export const GAP_Y = 24; // vertical gap between sibling cards
export const PADDING = 60;

// Tree layout types
export interface LayoutNode {
  id: string;
  name: string;
  role: string;
  status: string;
  x: number;
  y: number;
  children: LayoutNode[];
}

/** Compute the vertical height each subtree needs. */
export function subtreeHeight(node: OrgNode): number {
  if (node.reports.length === 0) return CARD_H;
  const childrenH = node.reports.reduce((sum, c) => sum + subtreeHeight(c), 0);
  const gaps = (node.reports.length - 1) * GAP_Y;
  return Math.max(CARD_H, childrenH + gaps);
}

/** Recursively assign x,y positions (left-to-right tree). */
export function layoutTree(node: OrgNode, x: number, y: number): LayoutNode {
  const totalH = subtreeHeight(node);
  const layoutChildren: LayoutNode[] = [];

  if (node.reports.length > 0) {
    const childrenH = node.reports.reduce((sum, c) => sum + subtreeHeight(c), 0);
    const gaps = (node.reports.length - 1) * GAP_Y;
    let cy = y + (totalH - childrenH - gaps) / 2;

    for (const child of node.reports) {
      const ch = subtreeHeight(child);
      layoutChildren.push(layoutTree(child, x + CARD_W + GAP_X, cy));
      cy += ch + GAP_Y;
    }
  }

  return {
    id: node.id,
    name: node.name,
    role: node.role,
    status: node.status,
    x,
    y: y + (totalH - CARD_H) / 2,
    children: layoutChildren,
  };
}

/** Layout all root nodes stacked vertically. */
export function layoutForest(roots: OrgNode[]): LayoutNode[] {
  if (roots.length === 0) return [];

  const x = PADDING;
  let y = PADDING;

  const result: LayoutNode[] = [];
  for (const root of roots) {
    const h = subtreeHeight(root);
    result.push(layoutTree(root, x, y));
    y += h + GAP_Y;
  }

  return result;
}

/** Flatten layout tree to list of nodes. */
export function flattenLayout(nodes: LayoutNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  function walk(n: LayoutNode) {
    result.push(n);
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

/** Collect all parent-child edges. */
export function collectEdges(nodes: LayoutNode[]): Array<{ parent: LayoutNode; child: LayoutNode }> {
  const edges: Array<{ parent: LayoutNode; child: LayoutNode }> = [];
  function walk(n: LayoutNode) {
    for (const c of n.children) {
      edges.push({ parent: n, child: c });
      walk(c);
    }
  }
  nodes.forEach(walk);
  return edges;
}

import { type Db, knowledgePageLinks, knowledgePages } from "@ironworksai/db";
import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { notFound } from "../../errors.js";

/**
 * Read-side queries over the wikilink graph.
 *
 * Tenant scope: every query is filtered by companyId. Visibility is NOT
 * enforced here - the route layer is the visibility gate (see T7). If
 * downstream review shows visibility leakage, the route can post-filter;
 * this module intentionally stays minimal-and-fast.
 */

export interface BacklinkRow {
  pageId: string;
  slug: string;
  title: string;
  anchor: string | null;
  documentType: string | null;
  updatedAt: Date;
}

/**
 * Pages that link TO the given page. Ordered by source page updated_at DESC.
 *
 * One row per (source page, anchor) edge. If a source page links the target
 * via multiple anchors, multiple rows are returned (matches the underlying
 * edge cardinality).
 */
export async function getBacklinks(db: Db, args: { pageId: string; companyId: string }): Promise<BacklinkRow[]> {
  const { pageId, companyId } = args;

  const rows = await db
    .select({
      pageId: knowledgePages.id,
      slug: knowledgePages.slug,
      title: knowledgePages.title,
      anchor: knowledgePageLinks.anchor,
      documentType: knowledgePages.documentType,
      updatedAt: knowledgePages.updatedAt,
    })
    .from(knowledgePageLinks)
    .innerJoin(knowledgePages, eq(knowledgePages.id, knowledgePageLinks.fromId))
    .where(and(eq(knowledgePageLinks.toId, pageId), eq(knowledgePageLinks.companyId, companyId)))
    .orderBy(desc(knowledgePages.updatedAt));

  return rows;
}

export interface GraphNode {
  id: string;
  slug: string;
  title: string;
  isCurrent: boolean;
  documentType: string | null;
}

export interface GraphEdge {
  fromId: string;
  toId: string | null;
  unresolvedSlug: string | null;
  anchor: string | null;
}

export interface GraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Sanity cap on neighborhood size. A page wired into a star-graph hub could
 * otherwise return thousands of nodes and stall the UI. When the reachable
 * set exceeds this, we keep the closest-by-hop nodes (current first, then
 * 1-hop, then 2-hop in insertion order) and log a warning.
 */
const MAX_NEIGHBORHOOD_NODES = 100;

/**
 * 1-2 hop neighborhood around the given page.
 *
 * - hops=0: just the current page node, no edges.
 * - hops=1: current + direct in/out neighbors.
 * - hops=2: include 2-hop neighbors (in/out from the 1-hop set).
 *
 * Edges in the result include the unresolved (broken) outbound edges from the
 * CURRENT page only - 1-hop neighbor unresolved edges are intentionally
 * dropped to keep the graph readable. (Spec decision; see API doc.)
 *
 * Throws notFound if the page does not exist in this company.
 */
export async function getNeighborhood(
  db: Db,
  args: { pageId: string; companyId: string; hops: 0 | 1 | 2 },
): Promise<GraphResult> {
  const { pageId, companyId, hops } = args;

  // Confirm the current page exists in this tenant. Mirrors knowledge.ts
  // pattern (notFound throw for missing page).
  const currentRows = await db
    .select({
      id: knowledgePages.id,
      slug: knowledgePages.slug,
      title: knowledgePages.title,
      documentType: knowledgePages.documentType,
    })
    .from(knowledgePages)
    .where(and(eq(knowledgePages.id, pageId), eq(knowledgePages.companyId, companyId)))
    .limit(1);

  const current = currentRows[0];
  if (!current) throw notFound("Knowledge page not found");

  const currentNode: GraphNode = {
    id: current.id,
    slug: current.slug,
    title: current.title,
    isCurrent: true,
    documentType: current.documentType,
  };

  if (hops === 0) {
    return { nodes: [currentNode], edges: [] };
  }

  // hop-distance map: id -> distance from current (0 = current).
  const hopDistance = new Map<string, number>();
  hopDistance.set(pageId, 0);

  // Round 1: 1-hop neighbors (in + out resolved).
  const oneHopEdges = await db
    .select({
      fromId: knowledgePageLinks.fromId,
      toId: knowledgePageLinks.toId,
    })
    .from(knowledgePageLinks)
    .where(
      and(
        eq(knowledgePageLinks.companyId, companyId),
        or(eq(knowledgePageLinks.fromId, pageId), eq(knowledgePageLinks.toId, pageId)),
      ),
    );

  const oneHopIds = new Set<string>();
  for (const e of oneHopEdges) {
    if (e.fromId !== pageId) oneHopIds.add(e.fromId);
    if (e.toId && e.toId !== pageId) oneHopIds.add(e.toId);
  }
  for (const id of oneHopIds) {
    if (!hopDistance.has(id)) hopDistance.set(id, 1);
  }

  if (hops === 2 && oneHopIds.size > 0) {
    const oneHopArr = [...oneHopIds];
    const twoHopEdges = await db
      .select({
        fromId: knowledgePageLinks.fromId,
        toId: knowledgePageLinks.toId,
      })
      .from(knowledgePageLinks)
      .where(
        and(
          eq(knowledgePageLinks.companyId, companyId),
          or(inArray(knowledgePageLinks.fromId, oneHopArr), inArray(knowledgePageLinks.toId, oneHopArr)),
        ),
      );

    for (const e of twoHopEdges) {
      if (!hopDistance.has(e.fromId)) hopDistance.set(e.fromId, 2);
      if (e.toId && !hopDistance.has(e.toId)) hopDistance.set(e.toId, 2);
    }
  }

  // Apply node cap by hop distance (closest first, stable on Map iteration).
  let nodeIds: string[];
  if (hopDistance.size > MAX_NEIGHBORHOOD_NODES) {
    console.warn(
      `[knowledge-links/queries] neighborhood for page ${pageId} exceeded ${MAX_NEIGHBORHOOD_NODES} nodes (${hopDistance.size}); truncating by hop distance`,
    );
    const sorted = [...hopDistance.entries()].sort((a, b) => a[1] - b[1]);
    nodeIds = sorted.slice(0, MAX_NEIGHBORHOOD_NODES).map(([id]) => id);
  } else {
    nodeIds = [...hopDistance.keys()];
  }

  const nodeIdSet = new Set(nodeIds);

  // Fetch node details (excluding current; we already have it).
  const otherIds = nodeIds.filter((id) => id !== pageId);
  const nodes: GraphNode[] = [currentNode];

  if (otherIds.length > 0) {
    const otherRows = await db
      .select({
        id: knowledgePages.id,
        slug: knowledgePages.slug,
        title: knowledgePages.title,
        documentType: knowledgePages.documentType,
      })
      .from(knowledgePages)
      .where(and(eq(knowledgePages.companyId, companyId), inArray(knowledgePages.id, otherIds)));

    for (const r of otherRows) {
      nodes.push({
        id: r.id,
        slug: r.slug,
        title: r.title,
        isCurrent: false,
        documentType: r.documentType,
      });
    }
  }

  // Resolved edges: any edge where BOTH endpoints are in the node set.
  const resolvedEdgeRows = await db
    .select({
      fromId: knowledgePageLinks.fromId,
      toId: knowledgePageLinks.toId,
      anchor: knowledgePageLinks.anchor,
    })
    .from(knowledgePageLinks)
    .where(
      and(
        eq(knowledgePageLinks.companyId, companyId),
        isNotNull(knowledgePageLinks.toId),
        inArray(knowledgePageLinks.fromId, nodeIds),
        inArray(knowledgePageLinks.toId, nodeIds),
      ),
    );

  const edges: GraphEdge[] = [];
  for (const e of resolvedEdgeRows) {
    if (e.toId && nodeIdSet.has(e.fromId) && nodeIdSet.has(e.toId)) {
      edges.push({
        fromId: e.fromId,
        toId: e.toId,
        unresolvedSlug: null,
        anchor: e.anchor,
      });
    }
  }

  // Unresolved edges: ONLY from the current page (graph readability).
  const unresolvedRows = await db
    .select({
      fromId: knowledgePageLinks.fromId,
      unresolvedSlug: knowledgePageLinks.unresolvedSlug,
      anchor: knowledgePageLinks.anchor,
    })
    .from(knowledgePageLinks)
    .where(
      and(
        eq(knowledgePageLinks.companyId, companyId),
        eq(knowledgePageLinks.fromId, pageId),
        isNotNull(knowledgePageLinks.unresolvedSlug),
      ),
    );

  for (const e of unresolvedRows) {
    edges.push({
      fromId: e.fromId,
      toId: null,
      unresolvedSlug: e.unresolvedSlug,
      anchor: e.anchor,
    });
  }

  return { nodes, edges };
}

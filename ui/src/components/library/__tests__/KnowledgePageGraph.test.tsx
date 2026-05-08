// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GraphResult } from "../../../api/knowledge";
import { KnowledgePageGraph } from "../KnowledgePageGraph";

const useQueryMock = vi.hoisted(() => vi.fn());
const reactFlowMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

// Stub @xyflow/react: it pulls in DOM APIs not available in node.
vi.mock("@xyflow/react", () => ({
  ReactFlow: (props: Record<string, unknown>) => {
    reactFlowMock(props);
    const nodes = (props.nodes as Array<{ data?: { label?: string } }>) ?? [];
    return (
      <div data-testid="reactflow-mock">
        {nodes.map((n, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: test-only mock; positional fixtures.
          <span key={i}>{n.data?.label ?? ""}</span>
        ))}
      </div>
    );
  },
  Background: () => null,
  Controls: () => null,
}));

vi.mock("@xyflow/react/dist/style.css", () => ({}));

vi.mock("../../../api/knowledge", () => ({
  knowledgeApi: { getGraph: vi.fn() },
}));

afterEach(() => {
  useQueryMock.mockReset();
  reactFlowMock.mockReset();
});

const PAGE_ID = "00000000-0000-0000-0000-000000000bbb";

function setQuery(state: { data?: unknown; isLoading?: boolean; error?: unknown }) {
  useQueryMock.mockReturnValue({
    data: state.data,
    isLoading: state.isLoading ?? false,
    error: state.error ?? null,
  });
}

describe("KnowledgePageGraph", () => {
  it("renders nodes + edges from mocked API", () => {
    const graph: GraphResult = {
      nodes: [
        { id: "p0", slug: "current", title: "Current Doc", isCurrent: true, documentType: null },
        { id: "p1", slug: "neighbor", title: "Neighbor Doc", isCurrent: false, documentType: null },
      ],
      edges: [
        { fromId: "p0", toId: "p1", unresolvedSlug: null, anchor: null },
        { fromId: "p1", toId: null, unresolvedSlug: "missing", anchor: null },
      ],
    };
    setQuery({ data: graph });
    const html = renderToStaticMarkup(<KnowledgePageGraph pageId={PAGE_ID} />);
    expect(html).toContain("Current Doc");
    expect(html).toContain("Neighbor Doc");

    expect(reactFlowMock).toHaveBeenCalledOnce();
    const props = reactFlowMock.mock.calls[0][0] as { nodes: unknown[]; edges: unknown[] };
    expect(props.nodes).toHaveLength(2);
    expect(props.edges).toHaveLength(2);
  });

  it("renders empty-state message when graph has only current node", () => {
    const graph: GraphResult = {
      nodes: [{ id: "p0", slug: "alone", title: "Alone", isCurrent: true, documentType: null }],
      edges: [],
    };
    setQuery({ data: graph });
    const html = renderToStaticMarkup(<KnowledgePageGraph pageId={PAGE_ID} />);
    expect(html).toContain("No links from this page yet");
    expect(reactFlowMock).not.toHaveBeenCalled();
  });

  it("wires onNodeClick to call onNavigate for non-current nodes", () => {
    const graph: GraphResult = {
      nodes: [
        { id: "p0", slug: "current", title: "Current", isCurrent: true, documentType: null },
        { id: "p1", slug: "neighbor", title: "Neighbor", isCurrent: false, documentType: null },
      ],
      edges: [{ fromId: "p0", toId: "p1", unresolvedSlug: null, anchor: null }],
    };
    setQuery({ data: graph });
    const onNavigate = vi.fn();
    renderToStaticMarkup(<KnowledgePageGraph pageId={PAGE_ID} onNavigate={onNavigate} />);

    const props = reactFlowMock.mock.calls[0][0] as {
      onNodeClick: (e: unknown, n: { id: string; data: { isCurrent: boolean } }) => void;
    };
    // Click on non-current node
    props.onNodeClick({}, { id: "p1", data: { isCurrent: false } });
    expect(onNavigate).toHaveBeenCalledWith("p1");

    // Click on current node — should NOT navigate
    onNavigate.mockClear();
    props.onNodeClick({}, { id: "p0", data: { isCurrent: true } });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("renders error state on API failure", () => {
    setQuery({ error: new Error("graph fail") });
    const html = renderToStaticMarkup(<KnowledgePageGraph pageId={PAGE_ID} />);
    expect(html).toContain("graph fail");
  });
});

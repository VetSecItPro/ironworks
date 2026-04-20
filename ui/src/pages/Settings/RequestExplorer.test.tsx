// @vitest-environment node

/**
 * SSR smoke tests for RequestExplorer.
 *
 * Uses renderToStaticMarkup so all tests run in the node environment without
 * a DOM. This matches Providers.test.tsx: it verifies the component renders
 * without crashing, key structural elements are present, and the mocked data
 * appears in the output.
 *
 * Radix Select portals do NOT render in SSR static markup — tests check for
 * the SelectTrigger's role="combobox" attribute instead of SelectItem content.
 *
 * useEffect (infinite scroll observer, page accumulation) does not run in
 * renderToStaticMarkup — the displayItems SSR fallback (`data?.items ?? []`)
 * ensures list data is visible in the static output.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../context/ThemeContext";
import type { AdapterCallListItem, AdapterCallListResponse } from "../../types/adapter-calls";
import { RequestExplorer } from "./RequestExplorer";

const TEST_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

const SAMPLE_CALL: AdapterCallListItem = {
  id: "11111111-1111-1111-1111-111111111111",
  companyId: TEST_COMPANY_ID,
  agentId: "22222222-2222-2222-2222-222222222222",
  adapterType: "anthropic_api",
  model: "claude-3-5-sonnet-20241022",
  status: "success",
  latencyMs: 850,
  inputTokens: 200,
  outputTokens: 80,
  costUsdCents: 1,
  source: "agent",
  replayOf: null,
  errorCode: null,
  promptPreview: "What is the capital of France?",
  responsePreview: "Paris.",
  adapterConfigSnapshot: { model: "claude-3-5-sonnet-20241022" },
  requestId: "req-abc",
  occurredAt: "2026-04-20T10:00:00Z",
  createdAt: "2026-04-20T10:00:00Z",
};

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockUseAdapterCallList = vi.hoisted(() =>
  vi.fn((): { data: AdapterCallListResponse | undefined; isLoading: boolean; error: null } => ({
    data: undefined,
    isLoading: false,
    error: null,
  })),
);

const mockUseAdapterCallDetail = vi.hoisted(() =>
  vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
);

vi.mock("../../hooks/useAdapterCalls", () => ({
  useAdapterCallList: mockUseAdapterCallList,
  useAdapterCallDetail: mockUseAdapterCallDetail,
}));

// SettingsProviderNav uses useLocation/useParams from react-router
// Those work fine inside MemoryRouter

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/ACME/settings/explorer"]}>
      <QueryClientProvider client={makeTestClient()}>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function render(companyId = TEST_COMPANY_ID) {
  return renderToStaticMarkup(
    <Wrapper>
      <RequestExplorer companyId={companyId} />
    </Wrapper>,
  );
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("RequestExplorer", () => {
  it("renders without crashing (empty state)", () => {
    expect(() => render()).not.toThrow();
  });

  it("renders filter comboboxes", () => {
    const html = render();
    // Radix SelectTrigger renders role="combobox"
    expect(html).toContain('role="combobox"');
  });

  it("renders column headers", () => {
    const html = render();
    expect(html).toContain("Adapter / Model");
    expect(html).toContain("Status");
    expect(html).toContain("Latency");
    expect(html).toContain("In tokens");
    expect(html).toContain("Out tokens");
  });

  it("renders call rows from mock data", () => {
    mockUseAdapterCallList.mockReturnValueOnce({
      data: { items: [SAMPLE_CALL], nextCursor: null },
      isLoading: false,
      error: null,
    });
    const html = render();
    expect(html).toContain("anthropic_api");
    expect(html).toContain("What is the capital of France?");
  });

  it("renders the page heading", () => {
    const html = render();
    expect(html).toContain("Request / Response Explorer");
  });

  it("renders empty state when no calls", () => {
    mockUseAdapterCallList.mockReturnValueOnce({
      data: { items: [], nextCursor: null },
      isLoading: false,
      error: null,
    });
    const html = render();
    expect(html).toContain("No adapter calls found");
  });

  it("renders navigation tabs (Providers + Explorer)", () => {
    const html = render();
    expect(html).toContain("Providers");
    expect(html).toContain("Explorer");
  });

  it("shows multiple rows when data has multiple items", () => {
    const secondCall = { ...SAMPLE_CALL, id: "33333333-3333-3333-3333-333333333333", model: "gpt-4o" };
    mockUseAdapterCallList.mockReturnValueOnce({
      data: { items: [SAMPLE_CALL, secondCall], nextCursor: null },
      isLoading: false,
      error: null,
    });
    const html = render();
    expect(html).toContain("anthropic_api");
    expect(html).toContain("gpt-4o");
  });
});

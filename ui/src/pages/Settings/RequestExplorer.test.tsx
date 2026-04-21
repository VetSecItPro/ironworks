// @vitest-environment node

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../context/ThemeContext";
import type { AdapterCallListItem, AdapterCallListResponse } from "../../types/adapter-calls";
import { RequestExplorer } from "./RequestExplorer";

const TEST_COMPANY_ID = "00000000-0000-0000-0000-000000000099";

// ── mock: router (SettingsProviderNav uses useLocation / useParams) ───────────

vi.mock("../../lib/router", () => ({
  useLocation: () => ({ pathname: "/test/settings/explorer" }),
  useParams: () => ({ companyPrefix: "TEST" }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => children,
  Navigate: () => null,
}));

// ── mock: useAdapterCalls hooks ───────────────────────────────────────────────
// Mock is hoisted so we can override per-test with mockReturnValueOnce.

const mockUseAdapterCallList = vi.fn();
const mockUseAdapterCallDetail = vi.fn();

vi.mock("../../hooks/useAdapterCalls", () => ({
  useAdapterCallList: (...args: unknown[]) => mockUseAdapterCallList(...args),
  useAdapterCallDetail: (...args: unknown[]) => mockUseAdapterCallDetail(...args),
}));

const MOCK_CALL: AdapterCallListItem = {
  id: "00000000-0000-0000-0000-000000000001",
  companyId: TEST_COMPANY_ID,
  agentId: "00000000-0000-0000-0000-000000000002",
  adapterType: "anthropic_api",
  model: "claude-3-5-sonnet-20241022",
  status: "success",
  latencyMs: 1200,
  inputTokens: 500,
  outputTokens: 150,
  costUsdCents: 3,
  source: "agent",
  replayOf: null,
  errorCode: null,
  promptPreview: "What is the capital of France?",
  responsePreview: "Paris is the capital of France.",
  adapterConfigSnapshot: { model: "claude-3-5-sonnet-20241022" },
  requestId: "req-001",
  occurredAt: "2026-04-20T10:00:00Z",
  createdAt: "2026-04-20T10:00:00Z",
};

const DEFAULT_LIST_RESPONSE: AdapterCallListResponse = {
  items: [MOCK_CALL],
  nextCursor: null,
};

const DEFAULT_LIST_HOOK = {
  data: DEFAULT_LIST_RESPONSE,
  isLoading: false,
  error: null,
};

const DEFAULT_DETAIL_HOOK = {
  data: null,
  isLoading: false,
  error: null,
};

// ── test helpers ──────────────────────────────────────────────────────────────

function makeTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={makeTestClient()}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
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
  // Default mock: one call, not loading, no error
  beforeEach(() => {
    mockUseAdapterCallList.mockReturnValue(DEFAULT_LIST_HOOK);
    mockUseAdapterCallDetail.mockReturnValue(DEFAULT_DETAIL_HOOK);
  });

  it("renders the page heading", () => {
    expect(render()).toContain("Request / Response Explorer");
  });

  it("renders the settings nav with Providers and Explorer tabs", () => {
    const html = render();
    expect(html).toContain("Providers");
    expect(html).toContain("Explorer");
  });

  it("renders filter bar controls", () => {
    const html = render();
    expect(html).toContain("Filter by adapter");
    expect(html).toContain("Filter by status");
    expect(html).toContain("Filter by source");
    expect(html).toContain("Agent ID (UUID)");
  });

  it("renders column headers", () => {
    const html = render();
    expect(html).toContain("Adapter / Model");
    expect(html).toContain("Latency");
    expect(html).toContain("Cost");
  });

  it("renders a row for each adapter call in mock data", () => {
    const html = render();
    expect(html).toContain("anthropic_api");
    expect(html).toContain("What is the capital of France?");
  });

  it("renders success badge for successful calls", () => {
    const html = render();
    expect(html).toContain("success");
  });

  it("renders model name from call data", () => {
    const html = render();
    expect(html).toContain("claude-3-5-sonnet-20241022");
  });

  it("shows empty state when no calls exist", () => {
    mockUseAdapterCallList.mockReturnValueOnce({
      data: { items: [], nextCursor: null },
      isLoading: false,
      error: null,
    });

    const html = render();
    expect(html).toContain("No adapter calls found");
  });

  it("shows loading state", () => {
    mockUseAdapterCallList.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      error: null,
    });

    const html = render();
    expect(html).toContain("Loading...");
  });

  it("shows error state when query fails", () => {
    mockUseAdapterCallList.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      error: new Error("Network error"),
    });

    const html = render();
    expect(html).toContain("Failed to load adapter calls");
    expect(html).toContain("Network error");
  });

  it("does not expose any API key patterns in rendered HTML", () => {
    const html = render();
    expect(html).not.toMatch(/sk-ant-[a-zA-Z0-9]{10,}/);
    expect(html).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
  });
});

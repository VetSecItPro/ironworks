// @vitest-environment node

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../context/ThemeContext";
import type { ProviderStatusResponse } from "../../types/providers";
import { ProvidersPage } from "./Providers";

// SettingsProviderNav uses useLocation/useParams which require a Router context.
// Server-render tests run outside of a Router; stub it to avoid the invariant error.
vi.mock("./SettingsProviderNav", () => ({
  SettingsProviderNav: () => null,
}));

const TEST_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

function makeTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={makeTestClient()}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

// Mock useProviderStatus to return controlled statuses
vi.mock("../../hooks/useProviderStatus", () => ({
  useProviderStatus: vi.fn((_companyId: string | null | undefined, provider: string) => {
    const statuses: Record<string, ProviderStatusResponse> = {
      poe_api: {
        configured: true,
        source: "workspace",
        lastTestedAt: "2026-04-19T10:00:00Z",
        lastTestStatus: "pass",
        keyLastFour: "k8x2",
      },
      anthropic_api: { configured: false, source: "none" },
      openai_api: {
        configured: true,
        source: "workspace",
        lastTestedAt: "2026-04-19T09:00:00Z",
        lastTestStatus: "fail",
        keyLastFour: "zz99",
      },
      openrouter_api: { configured: false, source: "none" },
    };
    return { status: statuses[provider], isLoading: false, error: null, refetch: vi.fn() };
  }),
}));

// Mock useMeAccess — role gating test
vi.mock("../../hooks/useMeAccess", () => ({
  useMeAccess: vi.fn(() => ({
    isInstanceAdmin: false,
    memberships: [],
    isLoading: false,
    getRoleForCompany: () => "operator",
  })),
}));

describe("ProvidersPage", () => {
  it("renders a card for all four providers", () => {
    const html = renderToStaticMarkup(
      <Wrapper>
        <ProvidersPage companyId={TEST_COMPANY_ID} />
      </Wrapper>,
    );

    expect(html).toContain("Poe");
    expect(html).toContain("Anthropic");
    expect(html).toContain("OpenAI");
    expect(html).toContain("OpenRouter");
  });

  it("shows masked last-four display when provider is configured", () => {
    const html = renderToStaticMarkup(
      <Wrapper>
        <ProvidersPage companyId={TEST_COMPANY_ID} />
      </Wrapper>,
    );

    expect(html).toContain("k8x2");
    expect(html).toContain("zz99");
  });

  it("renders password-type input for key entry — never text type", () => {
    const html = renderToStaticMarkup(
      <Wrapper>
        <ProvidersPage companyId={TEST_COMPANY_ID} />
      </Wrapper>,
    );

    const textInputCount = (html.match(/type="text"/g) ?? []).length;
    const passwordInputCount = (html.match(/type="password"/g) ?? []).length;

    expect(passwordInputCount).toBeGreaterThanOrEqual(2);
    expect(textInputCount).toBe(0);
  });

  it("shows last-tested status for configured providers with test results", () => {
    const html = renderToStaticMarkup(
      <Wrapper>
        <ProvidersPage companyId={TEST_COMPANY_ID} />
      </Wrapper>,
    );

    expect(html).toContain("PASS");
    expect(html).toContain("FAIL");
    expect(html).toContain("Not configured");
  });

  it("does NOT echo key values in any data attribute or aria attribute", () => {
    const html = renderToStaticMarkup(
      <Wrapper>
        <ProvidersPage companyId={TEST_COMPANY_ID} />
      </Wrapper>,
    );

    expect(html).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
    expect(html).not.toMatch(/sk-ant-[a-zA-Z0-9]{10,}/);
  });

  it("shows page heading Provider API Keys", () => {
    const html = renderToStaticMarkup(
      <Wrapper>
        <ProvidersPage companyId={TEST_COMPANY_ID} />
      </Wrapper>,
    );

    expect(html).toContain("Provider API Keys");
  });

  it("renders Test connection and Rotate buttons for configured providers", () => {
    const html = renderToStaticMarkup(
      <Wrapper>
        <ProvidersPage companyId={TEST_COMPANY_ID} />
      </Wrapper>,
    );

    expect(html).toContain("Test connection");
    expect(html).toContain("Rotate");
  });
});

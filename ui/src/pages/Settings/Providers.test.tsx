// @vitest-environment node

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../context/ThemeContext";
import type { ProviderStatusResponse } from "../../types/providers";
import { ProvidersPage } from "./Providers";

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
  useProviderStatus: vi.fn((provider: string) => {
    const statuses: Record<string, ProviderStatusResponse> = {
      poe: {
        configured: true,
        lastTestedAt: "2026-04-19T10:00:00Z",
        lastTestStatus: "pass",
        keyLastFour: "k8x2",
      },
      anthropic: { configured: false, lastTestedAt: null, lastTestStatus: null },
      openai: {
        configured: true,
        lastTestedAt: "2026-04-19T09:00:00Z",
        lastTestStatus: "fail",
        keyLastFour: "zz99",
      },
      openrouter: { configured: false, lastTestedAt: null, lastTestStatus: null },
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
        <ProvidersPage />
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
        <ProvidersPage />
      </Wrapper>,
    );

    // Configured providers show masked key with last 4 chars
    expect(html).toContain("k8x2");
    expect(html).toContain("zz99");
  });

  it("renders password-type input for key entry — never text type", () => {
    const html = renderToStaticMarkup(
      <Wrapper>
        <ProvidersPage />
      </Wrapper>,
    );

    // All key inputs must be type=password, never text/visible
    const textInputCount = (html.match(/type="text"/g) ?? []).length;
    const passwordInputCount = (html.match(/type="password"/g) ?? []).length;

    // At minimum the unconfigured providers have visible password inputs
    expect(passwordInputCount).toBeGreaterThanOrEqual(2);
    // No key value rendered as plain text input
    expect(textInputCount).toBe(0);
  });

  it("shows last-tested status for configured providers with test results", () => {
    const html = renderToStaticMarkup(
      <Wrapper>
        <ProvidersPage />
      </Wrapper>,
    );

    // Poe has pass status
    expect(html).toContain("PASS");
    // OpenAI has fail status
    expect(html).toContain("FAIL");
    // Anthropic is not configured — shows Not configured status
    expect(html).toContain("Not configured");
  });

  it("does NOT echo key values in any data attribute or aria attribute", () => {
    const html = renderToStaticMarkup(
      <Wrapper>
        <ProvidersPage />
      </Wrapper>,
    );

    // Key values must never appear in DOM outside password input value attribute
    // We can't actually set defaultValue in static render — but we verify no
    // API key string shapes appear in the HTML output
    expect(html).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
    expect(html).not.toMatch(/sk-ant-[a-zA-Z0-9]{10,}/);
  });

  it("shows page heading Provider API Keys", () => {
    const html = renderToStaticMarkup(
      <Wrapper>
        <ProvidersPage />
      </Wrapper>,
    );

    expect(html).toContain("Provider API Keys");
  });

  it("renders Test connection and Rotate buttons for configured providers", () => {
    const html = renderToStaticMarkup(
      <Wrapper>
        <ProvidersPage />
      </Wrapper>,
    );

    expect(html).toContain("Test connection");
    // Configured providers have Rotate option
    expect(html).toContain("Rotate");
  });
});

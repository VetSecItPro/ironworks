// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../context/ThemeContext";
import type { ProviderStatusResponse } from "../../types/providers";
import { AdapterPicker } from "./AdapterPicker";

const TEST_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

// Mock useProviderStatus so tests are deterministic without network calls
vi.mock("../../hooks/useProviderStatus", () => ({
  useProviderStatus: vi.fn((_companyId: string | null | undefined, provider: string) => {
    const statuses: Record<string, ProviderStatusResponse> = {
      poe_api: {
        configured: true,
        source: "workspace",
        lastTestedAt: "2026-04-19T12:00:00Z",
        lastTestStatus: "pass",
      },
      anthropic_api: { configured: false, source: "none" },
      openai_api: { configured: true, source: "workspace" },
      openrouter_api: { configured: false, source: "none" },
    };
    return { status: statuses[provider], isLoading: false, error: null, refetch: vi.fn() };
  }),
}));

describe("AdapterPicker", () => {
  it("renders a card for each of the four HTTP adapters", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <AdapterPicker companyId={TEST_COMPANY_ID} onSelect={vi.fn()} />
      </ThemeProvider>,
    );

    expect(html).toContain("Poe");
    expect(html).toContain("Anthropic");
    expect(html).toContain("OpenAI");
    expect(html).toContain("OpenRouter");
  });

  it("shows Configured chip for configured providers and Not configured for unconfigured", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <AdapterPicker companyId={TEST_COMPANY_ID} onSelect={vi.fn()} />
      </ThemeProvider>,
    );

    const configuredCount = (html.match(/Configured/g) ?? []).length;
    expect(configuredCount).toBeGreaterThanOrEqual(2);

    const notConfiguredCount = (html.match(/Not configured/g) ?? []).length;
    expect(notConfiguredCount).toBeGreaterThanOrEqual(2);
  });

  it("renders value-prop text for each provider", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <AdapterPicker companyId={TEST_COMPANY_ID} onSelect={vi.fn()} />
      </ThemeProvider>,
    );

    expect(html).toContain("subscription");
    expect(html).toContain("cache");
  });

  it("renders one data-provider attribute per provider type", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <AdapterPicker companyId={TEST_COMPANY_ID} onSelect={vi.fn()} />
      </ThemeProvider>,
    );

    expect(html).toContain('data-provider="poe_api"');
    expect(html).toContain('data-provider="anthropic_api"');
    expect(html).toContain('data-provider="openai_api"');
    expect(html).toContain('data-provider="openrouter_api"');
  });
});

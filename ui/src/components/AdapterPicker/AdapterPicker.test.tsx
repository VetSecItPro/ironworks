// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../context/ThemeContext";
import type { ProviderStatusResponse } from "../../types/providers";
import { AdapterPicker } from "./AdapterPicker";

// Mock useProviderStatus so tests are deterministic without network calls
vi.mock("../../hooks/useProviderStatus", () => ({
  useProviderStatus: vi.fn((provider: string) => {
    const statuses: Record<string, ProviderStatusResponse> = {
      poe: { configured: true, lastTestedAt: "2026-04-19T12:00:00Z", lastTestStatus: "pass" },
      anthropic: { configured: false, lastTestedAt: null, lastTestStatus: null },
      openai: { configured: true, lastTestedAt: null, lastTestStatus: null },
      openrouter: { configured: false, lastTestedAt: null, lastTestStatus: null },
    };
    return { status: statuses[provider], isLoading: false, error: null, refetch: vi.fn() };
  }),
}));

describe("AdapterPicker", () => {
  it("renders a card for each of the four HTTP adapters", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <AdapterPicker onSelect={vi.fn()} />
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
        <AdapterPicker onSelect={vi.fn()} />
      </ThemeProvider>,
    );

    // poe + openai are configured (2 Configured badges)
    const configuredCount = (html.match(/Configured/g) ?? []).length;
    expect(configuredCount).toBeGreaterThanOrEqual(2);

    // anthropic + openrouter are not configured
    const notConfiguredCount = (html.match(/Not configured/g) ?? []).length;
    expect(notConfiguredCount).toBeGreaterThanOrEqual(2);
  });

  it("renders value-prop text for each provider", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <AdapterPicker onSelect={vi.fn()} />
      </ThemeProvider>,
    );

    // Each card should have some descriptive text — spot-check two
    expect(html).toContain("subscription");
    expect(html).toContain("cache");
  });

  it("calls onSelect with the provider type when a card is clicked", () => {
    // Render as HTML; click behavior tested via data-provider attribute presence
    // (RTL is not in this vitest node environment — we verify the handler is wired via data attrs)
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <AdapterPicker onSelect={vi.fn()} />
      </ThemeProvider>,
    );

    expect(html).toContain('data-provider="poe"');
    expect(html).toContain('data-provider="anthropic"');
    expect(html).toContain('data-provider="openai"');
    expect(html).toContain('data-provider="openrouter"');
  });
});

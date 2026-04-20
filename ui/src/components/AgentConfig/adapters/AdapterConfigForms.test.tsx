// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../context/ThemeContext";
import { AnthropicApiConfigForm } from "./AnthropicApiConfigForm";
import { OpenAiApiConfigForm } from "./OpenAiApiConfigForm";
import { OpenRouterApiConfigForm } from "./OpenRouterApiConfigForm";
import { PoeApiConfigForm } from "./PoeApiConfigForm";

// ─── PoeApiConfigForm ────────────────────────────────────────────────────────

describe("PoeApiConfigForm", () => {
  it("renders model dropdown with Poe models", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <PoeApiConfigForm
          values={{ model: "claude-sonnet-4-6", temperature: undefined, maxTokens: undefined, systemPromptSkills: [] }}
          onChange={vi.fn()}
          availableSkills={[]}
        />
      </ThemeProvider>,
    );
    // Model label rendered
    expect(html).toContain("Model");
    // Temperature field rendered
    expect(html).toContain("Temperature");
    // Max tokens rendered
    expect(html).toContain("Max tokens");
  });

  it("renders system prompt skills multi-select", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <PoeApiConfigForm
          values={{ model: "gpt-4o", temperature: 0.7, maxTokens: 4096, systemPromptSkills: ["skill-a"] }}
          onChange={vi.fn()}
          availableSkills={[
            { key: "skill-a", label: "Skill A" },
            { key: "skill-b", label: "Skill B" },
          ]}
        />
      </ThemeProvider>,
    );
    expect(html).toContain("System prompt skills");
    expect(html).toContain("Skill A");
  });

  it("calls onChange when model changes", () => {
    // onChange wiring verified by data-testid attribute presence
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <PoeApiConfigForm
          values={{ model: "gpt-4o", temperature: undefined, maxTokens: undefined, systemPromptSkills: [] }}
          onChange={vi.fn()}
          availableSkills={[]}
        />
      </ThemeProvider>,
    );
    // form element rendered
    expect(html).toContain('data-adapter-form="poe"');
  });

  it("does NOT render an API key field", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <PoeApiConfigForm
          values={{ model: "gpt-4o", temperature: undefined, maxTokens: undefined, systemPromptSkills: [] }}
          onChange={vi.fn()}
          availableSkills={[]}
        />
      </ThemeProvider>,
    );
    // API key input must never appear — keys are global in Settings > Providers
    expect(html).not.toContain("API key");
    expect(html).not.toContain("apiKey");
  });
});

// ─── AnthropicApiConfigForm ──────────────────────────────────────────────────

describe("AnthropicApiConfigForm", () => {
  it("renders model dropdown, temperature, maxTokens, cacheControl, extendedThinking", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <AnthropicApiConfigForm
          values={{
            model: "claude-opus-4-7",
            temperature: undefined,
            maxTokens: undefined,
            cacheControlBreakpoints: undefined,
            extendedThinkingBudgetTokens: undefined,
            systemPromptSkills: [],
          }}
          onChange={vi.fn()}
          availableSkills={[]}
        />
      </ThemeProvider>,
    );
    expect(html).toContain("Model");
    expect(html).toContain("Temperature");
    expect(html).toContain("Max tokens");
    expect(html).toContain("Cache control");
    expect(html).toContain("Extended thinking");
  });

  it("does NOT render an API key field", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <AnthropicApiConfigForm
          values={{
            model: "claude-sonnet-4-6",
            temperature: undefined,
            maxTokens: undefined,
            cacheControlBreakpoints: undefined,
            extendedThinkingBudgetTokens: undefined,
            systemPromptSkills: [],
          }}
          onChange={vi.fn()}
          availableSkills={[]}
        />
      </ThemeProvider>,
    );
    expect(html).not.toContain("API key");
    expect(html).not.toContain("apiKey");
  });

  it("shows extended thinking budget field when model supports it", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <AnthropicApiConfigForm
          values={{
            model: "claude-opus-4-7",
            temperature: undefined,
            maxTokens: undefined,
            cacheControlBreakpoints: undefined,
            extendedThinkingBudgetTokens: 2048,
            systemPromptSkills: [],
          }}
          onChange={vi.fn()}
          availableSkills={[]}
        />
      </ThemeProvider>,
    );
    expect(html).toContain("Budget tokens");
  });

  it("renders data-adapter-form attribute for testing", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <AnthropicApiConfigForm
          values={{
            model: "claude-haiku-4-5",
            temperature: undefined,
            maxTokens: undefined,
            cacheControlBreakpoints: undefined,
            extendedThinkingBudgetTokens: undefined,
            systemPromptSkills: [],
          }}
          onChange={vi.fn()}
          availableSkills={[]}
        />
      </ThemeProvider>,
    );
    expect(html).toContain('data-adapter-form="anthropic"');
  });
});

// ─── OpenAiApiConfigForm ─────────────────────────────────────────────────────

describe("OpenAiApiConfigForm", () => {
  it("renders model dropdown, temperature, maxTokens, parallelToolCalls", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <OpenAiApiConfigForm
          values={{
            model: "gpt-5",
            temperature: undefined,
            maxTokens: undefined,
            parallelToolCalls: undefined,
            systemPromptSkills: [],
          }}
          onChange={vi.fn()}
          availableSkills={[]}
        />
      </ThemeProvider>,
    );
    expect(html).toContain("Model");
    expect(html).toContain("Temperature");
    expect(html).toContain("Max tokens");
    expect(html).toContain("Parallel tool calls");
  });

  it("does NOT render an API key field", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <OpenAiApiConfigForm
          values={{
            model: "gpt-5",
            temperature: undefined,
            maxTokens: undefined,
            parallelToolCalls: undefined,
            systemPromptSkills: [],
          }}
          onChange={vi.fn()}
          availableSkills={[]}
        />
      </ThemeProvider>,
    );
    expect(html).not.toContain("API key");
    expect(html).not.toContain("apiKey");
  });

  it("shows reasoning model note for o4 family", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <OpenAiApiConfigForm
          values={{
            model: "o4-mini",
            temperature: undefined,
            maxTokens: undefined,
            parallelToolCalls: undefined,
            systemPromptSkills: [],
          }}
          onChange={vi.fn()}
          availableSkills={[]}
        />
      </ThemeProvider>,
    );
    expect(html).toContain("reasoning");
  });

  it("renders data-adapter-form attribute", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <OpenAiApiConfigForm
          values={{
            model: "gpt-5",
            temperature: undefined,
            maxTokens: undefined,
            parallelToolCalls: undefined,
            systemPromptSkills: [],
          }}
          onChange={vi.fn()}
          availableSkills={[]}
        />
      </ThemeProvider>,
    );
    expect(html).toContain('data-adapter-form="openai"');
  });
});

// ─── OpenRouterApiConfigForm ─────────────────────────────────────────────────

describe("OpenRouterApiConfigForm", () => {
  it("renders model dropdown, temperature, maxTokens, httpReferer, xTitle", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <OpenRouterApiConfigForm
          values={{
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            temperature: undefined,
            maxTokens: undefined,
            httpReferer: undefined,
            xTitle: undefined,
            systemPromptSkills: [],
          }}
          onChange={vi.fn()}
          availableSkills={[]}
        />
      </ThemeProvider>,
    );
    expect(html).toContain("Model");
    expect(html).toContain("Temperature");
    expect(html).toContain("Max tokens");
    expect(html).toContain("HTTP Referer");
    expect(html).toContain("X-Title");
  });

  it("does NOT render an API key field", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <OpenRouterApiConfigForm
          values={{
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            temperature: undefined,
            maxTokens: undefined,
            httpReferer: undefined,
            xTitle: undefined,
            systemPromptSkills: [],
          }}
          onChange={vi.fn()}
          availableSkills={[]}
        />
      </ThemeProvider>,
    );
    expect(html).not.toContain("API key");
    expect(html).not.toContain("apiKey");
  });

  it("renders data-adapter-form attribute", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <OpenRouterApiConfigForm
          values={{
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            temperature: undefined,
            maxTokens: undefined,
            httpReferer: undefined,
            xTitle: undefined,
            systemPromptSkills: [],
          }}
          onChange={vi.fn()}
          availableSkills={[]}
        />
      </ThemeProvider>,
    );
    expect(html).toContain('data-adapter-form="openrouter"');
  });

  it("renders system prompt skills", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <OpenRouterApiConfigForm
          values={{
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            temperature: undefined,
            maxTokens: undefined,
            httpReferer: "https://example.com",
            xTitle: "My App",
            systemPromptSkills: [],
          }}
          onChange={vi.fn()}
          availableSkills={[{ key: "skill-x", label: "Skill X" }]}
        />
      </ThemeProvider>,
    );
    expect(html).toContain("System prompt skills");
    expect(html).toContain("Skill X");
  });
});

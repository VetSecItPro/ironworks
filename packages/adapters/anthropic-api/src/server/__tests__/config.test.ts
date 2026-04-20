import { describe, expect, it } from "vitest";
import { ANTHROPIC_MODELS, validateAnthropicConfig } from "../../shared/config.js";

describe("ANTHROPIC_MODELS", () => {
  it("contains exactly 3 Claude models", () => {
    expect(ANTHROPIC_MODELS.length).toBe(3);
  });

  it("each entry has a non-empty id and label", () => {
    for (const model of ANTHROPIC_MODELS) {
      expect(typeof model.id).toBe("string");
      expect(model.id.length).toBeGreaterThan(0);
      expect(typeof model.label).toBe("string");
      expect(model.label.length).toBeGreaterThan(0);
    }
  });

  it("includes all three expected Claude model IDs", () => {
    const ids = ANTHROPIC_MODELS.map((m) => m.id);
    expect(ids).toContain("claude-opus-4-7");
    expect(ids).toContain("claude-sonnet-4-6");
    expect(ids).toContain("claude-haiku-4-5");
  });

  it("marks Opus and Sonnet as supporting extended thinking", () => {
    const opus = ANTHROPIC_MODELS.find((m) => m.id === "claude-opus-4-7");
    const sonnet = ANTHROPIC_MODELS.find((m) => m.id === "claude-sonnet-4-6");
    expect(opus?.supportsExtendedThinking).toBe(true);
    expect(sonnet?.supportsExtendedThinking).toBe(true);
  });

  it("marks Haiku as not supporting extended thinking", () => {
    const haiku = ANTHROPIC_MODELS.find((m) => m.id === "claude-haiku-4-5");
    expect(haiku?.supportsExtendedThinking).toBe(false);
  });
});

describe("validateAnthropicConfig", () => {
  it("accepts minimal valid config with model only", () => {
    const result = validateAnthropicConfig({ model: "claude-sonnet-4-6" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.model).toBe("claude-sonnet-4-6");
      expect(result.config.temperature).toBeUndefined();
      expect(result.config.maxTokens).toBeUndefined();
      expect(result.config.cacheControl).toBeUndefined();
      expect(result.config.extendedThinking).toBeUndefined();
    }
  });

  it("accepts full config with all optional fields", () => {
    const result = validateAnthropicConfig({
      model: "claude-opus-4-7",
      apiKey: "sk-ant-testkey12345678",
      temperature: 0.5,
      maxTokens: 4096,
      cacheControl: { breakpoints: 2 },
      extendedThinking: { budgetTokens: 8000 },
      systemPromptSkills: ["ironworks", "atlas"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.apiKey).toBe("sk-ant-testkey12345678");
      expect(result.config.temperature).toBe(0.5);
      expect(result.config.maxTokens).toBe(4096);
      expect(result.config.cacheControl?.breakpoints).toBe(2);
      expect(result.config.extendedThinking?.budgetTokens).toBe(8000);
      expect(result.config.systemPromptSkills).toEqual(["ironworks", "atlas"]);
    }
  });

  it("accepts env-var reference for apiKey", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional literal — testing env-var reference string syntax
    const result = validateAnthropicConfig({ model: "claude-sonnet-4-6", apiKey: "${ANTHROPIC_API_KEY}" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional literal
      expect(result.config.apiKey).toBe("${ANTHROPIC_API_KEY}");
    }
  });

  it("rejects unknown model with helpful message and suggestions", () => {
    const result = validateAnthropicConfig({ model: "gpt-4o" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/model/i);
      expect(result.error).toMatch(/gpt-4o/);
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
    }
  });

  it("rejects missing model field", () => {
    const result = validateAnthropicConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/model/i);
    }
  });

  it("rejects temperature out of range [0,1]", () => {
    const result = validateAnthropicConfig({ model: "claude-sonnet-4-6", temperature: 1.5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/temperature/i);
    }
  });

  it("rejects cacheControl without valid breakpoints", () => {
    const result = validateAnthropicConfig({ model: "claude-sonnet-4-6", cacheControl: { breakpoints: 0 } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/breakpoints/i);
    }
  });

  it("rejects extendedThinking.budgetTokens below 1024", () => {
    const result = validateAnthropicConfig({
      model: "claude-sonnet-4-6",
      extendedThinking: { budgetTokens: 512 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/budgetTokens/i);
    }
  });

  it("rejects non-object input", () => {
    expect(validateAnthropicConfig("not-an-object").ok).toBe(false);
    expect(validateAnthropicConfig(null).ok).toBe(false);
    expect(validateAnthropicConfig([]).ok).toBe(false);
  });
});

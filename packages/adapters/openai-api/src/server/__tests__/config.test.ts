import { describe, expect, it } from "vitest";
import { validateOpenAIConfig } from "../../shared/config.js";
import { OPENAI_MODELS } from "../../shared/models.js";

describe("validateOpenAIConfig", () => {
  it("accepts a minimal valid config with just model", () => {
    const result = validateOpenAIConfig({ model: "gpt-5" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.model).toBe("gpt-5");
  });

  it("rejects missing model field", () => {
    const result = validateOpenAIConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/model/i);
      expect(result.suggestions).toBeDefined();
    }
  });

  it("rejects unknown model with suggestions", () => {
    const result = validateOpenAIConfig({ model: "gpt-99-turbo-ultra" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/unknown openai model/i);
      expect(result.suggestions).toEqual(OPENAI_MODELS.map((m) => m.id));
    }
  });

  it("accepts env-var reference for apiKey", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional literal — testing env-var reference string syntax
    const result = validateOpenAIConfig({ model: "gpt-5", apiKey: "${OPENAI_API_KEY}" });
    expect(result.ok).toBe(true);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional literal
    if (result.ok) expect(result.config.apiKey).toBe("${OPENAI_API_KEY}");
  });

  it("accepts o4 reasoning model", () => {
    const result = validateOpenAIConfig({ model: "o4" });
    expect(result.ok).toBe(true);
  });

  it("accepts o4-mini reasoning model", () => {
    const result = validateOpenAIConfig({ model: "o4-mini" });
    expect(result.ok).toBe(true);
  });

  it("accepts temperature in [0, 2]", () => {
    const result = validateOpenAIConfig({ model: "gpt-5", temperature: 1.5 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.temperature).toBe(1.5);
  });

  it("rejects temperature > 2", () => {
    const result = validateOpenAIConfig({ model: "gpt-5", temperature: 2.1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/temperature/i);
  });

  it("accepts valid structuredOutputSchema", () => {
    const result = validateOpenAIConfig({
      model: "gpt-5",
      structuredOutputSchema: {
        name: "my_schema",
        schema: { type: "object", properties: { answer: { type: "string" } } },
        strict: true,
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.structuredOutputSchema?.name).toBe("my_schema");
    }
  });

  it("rejects structuredOutputSchema with invalid name (spaces)", () => {
    const result = validateOpenAIConfig({
      model: "gpt-5",
      structuredOutputSchema: { name: "bad name!", schema: {} },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/name must match/i);
  });

  it("accepts parallelToolCalls boolean", () => {
    const result = validateOpenAIConfig({ model: "gpt-5", parallelToolCalls: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.parallelToolCalls).toBe(false);
  });

  it("rejects parallelToolCalls non-boolean", () => {
    const result = validateOpenAIConfig({ model: "gpt-5", parallelToolCalls: "yes" });
    expect(result.ok).toBe(false);
  });

  it("accepts systemPromptSkills string array", () => {
    const result = validateOpenAIConfig({ model: "gpt-5", systemPromptSkills: ["ironworks", "atlas"] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.systemPromptSkills).toEqual(["ironworks", "atlas"]);
  });

  it("rejects non-object config", () => {
    expect(validateOpenAIConfig("string").ok).toBe(false);
    expect(validateOpenAIConfig(null).ok).toBe(false);
    expect(validateOpenAIConfig([]).ok).toBe(false);
  });

  it("models list contains 8+ entries including reasoning models", () => {
    expect(OPENAI_MODELS.length).toBeGreaterThanOrEqual(8);
    const reasoningModels = OPENAI_MODELS.filter((m) => m.isReasoningModel);
    expect(reasoningModels.length).toBeGreaterThanOrEqual(2);
  });
});

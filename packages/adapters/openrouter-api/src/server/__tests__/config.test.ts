import { describe, expect, it } from "vitest";
import { validateOpenRouterConfig } from "../../shared/config.js";
import { OPENROUTER_MODELS } from "../../shared/models.js";

describe("validateOpenRouterConfig", () => {
  it("accepts a minimal valid config with just model", () => {
    const result = validateOpenRouterConfig({ model: "meta-llama/llama-4-scout-17b-16e-instruct" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.model).toBe("meta-llama/llama-4-scout-17b-16e-instruct");
  });

  it("rejects missing model field", () => {
    const result = validateOpenRouterConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/model/i);
      expect(result.suggestions).toBeDefined();
    }
  });

  it("rejects unknown model with suggestions", () => {
    const result = validateOpenRouterConfig({ model: "nonexistent/fake-model-9000" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/unknown openrouter model/i);
      expect(result.suggestions).toEqual(OPENROUTER_MODELS.map((m) => m.id));
    }
  });

  it("accepts env-var reference for apiKey", () => {
    const result = validateOpenRouterConfig({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional literal — testing env-var reference string syntax
      apiKey: "${OPENROUTER_API_KEY}",
    });
    expect(result.ok).toBe(true);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional literal
    if (result.ok) expect(result.config.apiKey).toBe("${OPENROUTER_API_KEY}");
  });

  it("accepts temperature in [0, 2]", () => {
    const result = validateOpenRouterConfig({ model: "meta-llama/llama-4-scout-17b-16e-instruct", temperature: 0.7 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.temperature).toBe(0.7);
  });

  it("rejects temperature > 2", () => {
    const result = validateOpenRouterConfig({ model: "meta-llama/llama-4-scout-17b-16e-instruct", temperature: 2.5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/temperature/i);
  });

  it("accepts systemPromptSkills string array", () => {
    const result = validateOpenRouterConfig({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      systemPromptSkills: ["ironworks", "atlas"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.systemPromptSkills).toEqual(["ironworks", "atlas"]);
  });

  it("rejects non-object config", () => {
    expect(validateOpenRouterConfig("string").ok).toBe(false);
    expect(validateOpenRouterConfig(null).ok).toBe(false);
    expect(validateOpenRouterConfig([]).ok).toBe(false);
  });

  it("accepts httpReferer override", () => {
    const result = validateOpenRouterConfig({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      httpReferer: "https://my-app.example.com",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.httpReferer).toBe("https://my-app.example.com");
  });

  it("accepts xTitle override", () => {
    const result = validateOpenRouterConfig({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      xTitle: "MyApp",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.xTitle).toBe("MyApp");
  });

  it("models list contains 15+ entries", () => {
    expect(OPENROUTER_MODELS.length).toBeGreaterThanOrEqual(15);
  });

  it("models list includes required Llama-4 entries", () => {
    const ids = OPENROUTER_MODELS.map((m) => m.id);
    expect(ids).toContain("meta-llama/llama-4-scout-17b-16e-instruct");
    expect(ids).toContain("meta-llama/llama-4-maverick-17b-128e-instruct");
  });

  it("models list includes required Anthropic relay entries", () => {
    const ids = OPENROUTER_MODELS.map((m) => m.id);
    expect(ids).toContain("anthropic/claude-opus-4-7");
    expect(ids).toContain("anthropic/claude-sonnet-4-6");
  });
});

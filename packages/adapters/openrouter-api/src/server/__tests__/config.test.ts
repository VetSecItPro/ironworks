import { describe, expect, it } from "vitest";
import { validateOpenRouterConfig } from "../../shared/config.js";
import { OPENROUTER_MODELS } from "../../shared/models.js";

describe("validateOpenRouterConfig", () => {
  it("accepts a minimal valid config with just model", () => {
    const result = validateOpenRouterConfig({ model: "openai/gpt-oss-120b:free" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.model).toBe("openai/gpt-oss-120b:free");
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

  it("accepts a valid fallbackModel", () => {
    const result = validateOpenRouterConfig({
      model: "openai/gpt-oss-120b:free",
      fallbackModel: "meta-llama/llama-3.3-70b-instruct:free",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.fallbackModel).toBe("meta-llama/llama-3.3-70b-instruct:free");
  });

  it("rejects fallbackModel equal to primary model", () => {
    const result = validateOpenRouterConfig({
      model: "openai/gpt-oss-120b:free",
      fallbackModel: "openai/gpt-oss-120b:free",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/differ from primary/i);
  });

  it("rejects unknown fallbackModel", () => {
    const result = validateOpenRouterConfig({
      model: "openai/gpt-oss-120b:free",
      fallbackModel: "nonexistent/fake-model-9000",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown openrouter fallbackmodel/i);
  });

  it("accepts env-var reference for apiKey", () => {
    const result = validateOpenRouterConfig({
      model: "openai/gpt-oss-120b:free",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional literal — testing env-var reference string syntax
      apiKey: "${OPENROUTER_API_KEY}",
    });
    expect(result.ok).toBe(true);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional literal
    if (result.ok) expect(result.config.apiKey).toBe("${OPENROUTER_API_KEY}");
  });

  it("accepts temperature in [0, 2]", () => {
    const result = validateOpenRouterConfig({ model: "openai/gpt-oss-120b:free", temperature: 0.7 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.temperature).toBe(0.7);
  });

  it("rejects temperature > 2", () => {
    const result = validateOpenRouterConfig({ model: "openai/gpt-oss-120b:free", temperature: 2.5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/temperature/i);
  });

  it("accepts systemPromptSkills string array", () => {
    const result = validateOpenRouterConfig({
      model: "openai/gpt-oss-120b:free",
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
      model: "openai/gpt-oss-120b:free",
      httpReferer: "https://my-app.example.com",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.httpReferer).toBe("https://my-app.example.com");
  });

  it("accepts xTitle override", () => {
    const result = validateOpenRouterConfig({
      model: "openai/gpt-oss-120b:free",
      xTitle: "MyApp",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.xTitle).toBe("MyApp");
  });

  it("models list contains the curated current catalog", () => {
    expect(OPENROUTER_MODELS.length).toBeGreaterThanOrEqual(10);
  });

  it("models list includes required free-tier Western entries", () => {
    const ids = OPENROUTER_MODELS.map((m) => m.id);
    expect(ids).toContain("openai/gpt-oss-120b:free");
    expect(ids).toContain("meta-llama/llama-3.3-70b-instruct:free");
    expect(ids).toContain("nousresearch/hermes-3-llama-3.1-405b:free");
  });

  it("every model declares a positive contextWindowTokens", () => {
    for (const m of OPENROUTER_MODELS) {
      expect(m.contextWindowTokens, `${m.id} contextWindowTokens`).toBeGreaterThan(0);
    }
  });
});

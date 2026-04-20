import { describe, expect, it } from "vitest";
import { POE_MODELS, validatePoeConfig } from "../../shared/config.js";

describe("POE_MODELS", () => {
  it("contains at least 7 model IDs", () => {
    expect(POE_MODELS.length).toBeGreaterThanOrEqual(7);
  });

  it("each entry has a non-empty id and label", () => {
    for (const model of POE_MODELS) {
      expect(typeof model.id).toBe("string");
      expect(model.id.length).toBeGreaterThan(0);
      expect(typeof model.label).toBe("string");
      expect(model.label.length).toBeGreaterThan(0);
    }
  });

  it("includes known Poe model IDs from Phase A discovery", () => {
    const ids = POE_MODELS.map((m) => m.id);
    // Phase A confirmed these models support tool_calls on Poe
    expect(ids).toContain("claude-sonnet-4-6");
    expect(ids).toContain("claude-haiku-4-5");
    expect(ids).toContain("gpt-4o");
    expect(ids).toContain("gemini-2.5-pro");
  });
});

describe("validatePoeConfig", () => {
  it("accepts minimal valid config with model only", () => {
    const result = validatePoeConfig({ model: "claude-sonnet-4-6" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.model).toBe("claude-sonnet-4-6");
      expect(result.config.temperature).toBeUndefined();
      expect(result.config.maxTokens).toBeUndefined();
    }
  });

  it("accepts full config with optional fields", () => {
    const result = validatePoeConfig({
      model: "gpt-4o",
      apiKey: "sk-poe-abc123456789",
      temperature: 0.7,
      maxTokens: 4096,
      systemPromptSkills: ["ironworks", "atlas"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.apiKey).toBe("sk-poe-abc123456789");
      expect(result.config.temperature).toBe(0.7);
      expect(result.config.maxTokens).toBe(4096);
      expect(result.config.systemPromptSkills).toEqual(["ironworks", "atlas"]);
    }
  });

  it("accepts env-var reference for apiKey", () => {
    const result = validatePoeConfig({ model: "claude-sonnet-4-6", apiKey: "${POE_API_KEY}" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.apiKey).toBe("${POE_API_KEY}");
    }
  });

  it("rejects unknown model with helpful message", () => {
    const result = validatePoeConfig({ model: "nonexistent-model-xyz" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/model/i);
      expect(result.error).toMatch(/nonexistent-model-xyz/);
      // Should suggest valid alternatives
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
    }
  });

  it("rejects missing model field", () => {
    const result = validatePoeConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/model/i);
    }
  });

  it("rejects temperature out of range", () => {
    const result = validatePoeConfig({ model: "gpt-4o", temperature: 3.0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/temperature/i);
    }
  });

  it("rejects non-string model field", () => {
    const result = validatePoeConfig({ model: 42 });
    expect(result.ok).toBe(false);
  });
});

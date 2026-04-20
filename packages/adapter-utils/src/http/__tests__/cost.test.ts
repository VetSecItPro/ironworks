import { describe, expect, it } from "vitest";
import { computeCost } from "../cost.js";

describe("computeCost — Anthropic with caching", () => {
  it("Claude Opus 4.7: 1k input, 500 output", () => {
    const cost = computeCost("anthropic", "claude-opus-4-7", {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    });
    // 1000 input @ $15/1M = $0.015
    // 500 output @ $75/1M = $0.0375
    expect(cost.totalUsd).toBeCloseTo(0.0525, 4);
    expect(cost.breakdown.inputUsd).toBeCloseTo(0.015, 5);
    expect(cost.breakdown.outputUsd).toBeCloseTo(0.0375, 5);
    expect(cost.breakdown.cachedInputUsd).toBe(0);
    expect(cost.warnings).toEqual([]);
  });

  it("Claude Sonnet 4.6 with cache read: 1000 prompt (800 cached), 500 output", () => {
    const cost = computeCost("anthropic", "claude-sonnet-4-6", {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      cachedPromptTokens: 800,
    });
    // Uncached input: 1000 - 800 = 200 @ $3/1M = $0.0006
    // Cached input: 800 @ $0.30/1M = $0.00024
    // Output: 500 @ $15/1M = $0.0075
    // Total: ~$0.00834
    expect(cost.totalUsd).toBeCloseTo(0.00834, 4);
    expect(cost.breakdown.inputUsd).toBeCloseTo(0.0006, 5);
    expect(cost.breakdown.cachedInputUsd).toBeCloseTo(0.00024, 5);
    expect(cost.breakdown.outputUsd).toBeCloseTo(0.0075, 5);
  });

  it("Claude Opus with cache write: 1000 prompt, 400 written to cache, 600 fresh, 200 output", () => {
    const cost = computeCost("anthropic", "claude-opus-4-7", {
      promptTokens: 1000,
      completionTokens: 200,
      totalTokens: 1200,
      cachedWriteTokens: 400,
    });
    // Uncached: 1000 - 400 = 600 @ $15/1M = $0.009
    // Cache write: 400 @ $18.75/1M = $0.0075
    // Output: 200 @ $75/1M = $0.015
    // Total: $0.0315
    expect(cost.totalUsd).toBeCloseTo(0.0315, 4);
    expect(cost.breakdown.cachedWriteUsd).toBeCloseTo(0.0075, 5);
  });

  it("combined: some cached, some fresh, some written, output", () => {
    const cost = computeCost("anthropic", "claude-sonnet-4-6", {
      promptTokens: 2000,
      completionTokens: 500,
      totalTokens: 2500,
      cachedPromptTokens: 1000,
      cachedWriteTokens: 200,
    });
    // Uncached: 2000 - 1000 - 200 = 800 @ $3/1M = $0.0024
    // Cache read: 1000 @ $0.30/1M = $0.0003
    // Cache write: 200 @ $3.75/1M = $0.00075
    // Output: 500 @ $15/1M = $0.0075
    expect(cost.breakdown.inputUsd).toBeCloseTo(0.0024, 5);
    expect(cost.breakdown.cachedInputUsd).toBeCloseTo(0.0003, 5);
    expect(cost.breakdown.cachedWriteUsd).toBeCloseTo(0.00075, 5);
    expect(cost.breakdown.outputUsd).toBeCloseTo(0.0075, 5);
  });
});

describe("computeCost — OpenAI with reasoning", () => {
  it("o4: 1000 prompt, 500 reasoning, 300 output", () => {
    const cost = computeCost("openai", "o4", {
      promptTokens: 1000,
      completionTokens: 300,
      totalTokens: 1800,
      reasoningTokens: 500,
    });
    // Input: 1000 @ $15/1M = $0.015
    // Reasoning: 500 @ $60/1M = $0.03
    // Output: 300 @ $60/1M = $0.018
    // Total: $0.063
    expect(cost.breakdown.reasoningUsd).toBeCloseTo(0.03, 5);
    expect(cost.breakdown.outputUsd).toBeCloseTo(0.018, 5);
    expect(cost.totalUsd).toBeCloseTo(0.063, 4);
  });

  it("gpt-5-mini: cheap model math", () => {
    const cost = computeCost("openai", "gpt-5-mini", {
      promptTokens: 10_000,
      completionTokens: 2000,
      totalTokens: 12_000,
    });
    // Input: 10000 @ $0.25/1M = $0.0025
    // Output: 2000 @ $1/1M = $0.002
    expect(cost.totalUsd).toBeCloseTo(0.0045, 5);
  });
});

describe("computeCost — Poe (no caching)", () => {
  it("Claude Sonnet 4.6 via Poe: 1000/500 — no cache discount applied even if reported", () => {
    const cost = computeCost("poe", "claude-sonnet-4.6", {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      cachedPromptTokens: 800, // Poe doesn't charge caching differently
    });
    // Poe model has no cachedInputTokens rate → cached tokens treated as uncached
    // All 1000 @ $4.5/1M = $0.0045
    // Output: 500 @ $22.5/1M = $0.01125
    expect(cost.totalUsd).toBeCloseTo(0.01575, 4);
    expect(cost.warnings.length).toBeGreaterThan(0); // warned that caching was requested but N/A
    expect(cost.warnings[0]).toMatch(/cach/i);
  });
});

describe("computeCost — missing data paths", () => {
  it("unknown provider returns 0 USD with warning", () => {
    const cost = computeCost("unknown" as any, "anything", {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
    expect(cost.totalUsd).toBe(0);
    expect(cost.warnings[0]).toMatch(/no pricing/i);
  });

  it("unknown model returns 0 USD with warning", () => {
    const cost = computeCost("anthropic", "claude-nonexistent-v99", {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
    expect(cost.totalUsd).toBe(0);
    expect(cost.warnings[0]).toMatch(/no pricing/i);
  });

  it("zero usage returns 0 USD with no warnings", () => {
    const cost = computeCost("anthropic", "claude-sonnet-4-6", {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
    expect(cost.totalUsd).toBe(0);
    expect(cost.warnings).toEqual([]);
  });

  it("reasoning tokens reported but model has no reasoning rate → treat as output", () => {
    const cost = computeCost("anthropic", "claude-sonnet-4-6", {
      promptTokens: 0,
      completionTokens: 100,
      totalTokens: 600,
      reasoningTokens: 500, // Anthropic doesn't separately bill reasoning
    });
    // Should fall back to output rate or similar; must not NaN or produce negative cost
    expect(cost.totalUsd).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(cost.totalUsd)).toBe(true);
  });

  it("warns when reasoning tokens fall back to output rate", () => {
    const cost = computeCost("anthropic", "claude-sonnet-4-6", {
      promptTokens: 0,
      completionTokens: 100,
      totalTokens: 600,
      reasoningTokens: 500,
    });
    expect(cost.warnings.some((w) => /reasoning/i.test(w))).toBe(true);
  });

  it("warns when cache write falls back to input rate", () => {
    // Use an OpenRouter Anthropic model where cache write rate is not defined
    const cost = computeCost("openrouter", "anthropic/claude-sonnet-4.5", {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      cachedWriteTokens: 200,
    });
    expect(cost.warnings.some((w) => /cache write/i.test(w))).toBe(true);
  });
});

describe("computeCost — edge cases", () => {
  it("never returns NaN", () => {
    const cost = computeCost("anthropic", "claude-opus-4-7", {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
    expect(Number.isFinite(cost.totalUsd)).toBe(true);
  });

  it("cached tokens exceed prompt tokens → clamps uncached to 0 (defensive)", () => {
    // Shouldn't happen in practice but provider bug could cause it
    const cost = computeCost("anthropic", "claude-sonnet-4-6", {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      cachedPromptTokens: 200, // more cached than total input — bogus but defend
    });
    expect(cost.breakdown.inputUsd).toBeGreaterThanOrEqual(0);
    expect(cost.breakdown.cachedInputUsd).toBeGreaterThanOrEqual(0);
    expect(cost.totalUsd).toBeGreaterThanOrEqual(0);
  });

  it("totalUsd sums the breakdown exactly", () => {
    const cost = computeCost("anthropic", "claude-sonnet-4-6", {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      cachedPromptTokens: 300,
    });
    const sum =
      cost.breakdown.inputUsd +
      cost.breakdown.cachedInputUsd +
      cost.breakdown.cachedWriteUsd +
      cost.breakdown.outputUsd +
      cost.breakdown.reasoningUsd;
    expect(cost.totalUsd).toBeCloseTo(sum, 10);
  });
});

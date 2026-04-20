/**
 * Per-provider per-model pricing in USD per 1,000,000 tokens. Used by cost.ts
 * to compute per-call USD from a UsageSummary returned by the sse-parser or
 * transport layer.
 *
 * Sources and verification dates are embedded inline on each provider block
 * as LAST_VERIFIED comments. When you update rates, update that date.
 *
 * Design: flat Record<provider, Record<modelId, ModelPricing>>. No defensive
 * freezing — this module is data-only and consumers are not expected to
 * mutate. If a consumer does mutate, that's their bug.
 */

export type PricingProvider = "anthropic" | "openai" | "poe" | "openrouter";

export interface ModelPricing {
  /** USD per 1M input (prompt) tokens. */
  inputTokens: number;
  /** USD per 1M cached-input (read) tokens. Undefined when the provider doesn't expose caching. */
  cachedInputTokens?: number;
  /** USD per 1M cached-input (write) tokens. Undefined when not applicable. */
  cachedWriteTokens?: number;
  /** USD per 1M output (completion) tokens. */
  outputTokens: number;
  /** USD per 1M reasoning tokens (OpenAI reasoning models). Undefined for non-reasoning models. */
  reasoningTokens?: number;
}

// LAST_VERIFIED: 2026-04-19 against Anthropic pricing page
export const ANTHROPIC_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-7": {
    inputTokens: 15,
    cachedInputTokens: 1.5, // ~90% discount vs input
    cachedWriteTokens: 18.75, // 1.25x input — cache block creation premium
    outputTokens: 75,
  },
  "claude-sonnet-4-6": {
    inputTokens: 3,
    cachedInputTokens: 0.3,
    cachedWriteTokens: 3.75,
    outputTokens: 15,
  },
  "claude-haiku-4-5": {
    inputTokens: 1,
    cachedInputTokens: 0.1,
    cachedWriteTokens: 1.25,
    outputTokens: 5,
  },
};

// LAST_VERIFIED: 2026-04-19 against OpenAI platform pricing page
export const OPENAI_PRICING: Record<string, ModelPricing> = {
  "gpt-5": {
    inputTokens: 2,
    cachedInputTokens: 0.2,
    outputTokens: 8,
  },
  "gpt-5-mini": {
    inputTokens: 0.25,
    cachedInputTokens: 0.025,
    outputTokens: 1,
  },
  o4: {
    inputTokens: 15,
    cachedInputTokens: 1.5,
    outputTokens: 60,
    reasoningTokens: 60, // reasoning tokens billed at same rate as output
  },
  "o4-mini": {
    inputTokens: 1.5,
    cachedInputTokens: 0.15,
    outputTokens: 6,
    reasoningTokens: 6,
  },
};

// LAST_VERIFIED: 2026-04-19. Poe bills in compute-points tied to subscription tiers,
// not direct USD-per-token — these are rough equivalents for cost projection only.
// Replace with Poe's official USD-per-token rates when/if they publish them.
// Until then, ~1.5x the direct-provider rate is a pragmatic estimate based on
// compute-point conversion at ~$0.02/1k points. No cache passthrough on Poe.
export const POE_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4.7": { inputTokens: 22.5, outputTokens: 112.5 },
  "claude-sonnet-4.6": { inputTokens: 4.5, outputTokens: 22.5 },
  "claude-sonnet-4.5": { inputTokens: 4.5, outputTokens: 22.5 },
  "claude-haiku-4.5": { inputTokens: 1.5, outputTokens: 7.5 },
  "gpt-5": { inputTokens: 3, outputTokens: 12 },
  "gpt-5-mini": { inputTokens: 0.375, outputTokens: 1.5 },
  "gpt-5.4": { inputTokens: 3, outputTokens: 12 },
  "gemini-2.5-pro": { inputTokens: 2, outputTokens: 8 },
  "gemini-2.5-flash": { inputTokens: 0.5, outputTokens: 2 },
};

// LAST_VERIFIED: 2026-04-19 against openrouter.ai/models page.
// OpenRouter applies ~5-15% markup over direct provider rates; values below are
// provider-direct rates (OpenRouter's listed price approximates these).
// Cache discounts do NOT passthrough for Anthropic models routed via OpenRouter
// (confirmed in Phase A discovery) — cachedInputTokens / cachedWriteTokens are
// intentionally omitted for all entries here.
export const OPENROUTER_PRICING: Record<string, ModelPricing> = {
  "anthropic/claude-opus-4.7": { inputTokens: 15, outputTokens: 75 },
  "anthropic/claude-sonnet-4.6": { inputTokens: 3, outputTokens: 15 },
  "anthropic/claude-sonnet-4.5": { inputTokens: 3, outputTokens: 15 },
  "anthropic/claude-haiku-4.5": { inputTokens: 1, outputTokens: 5 },
  "openai/gpt-5": { inputTokens: 2, outputTokens: 8 },
  "openai/gpt-5-mini": { inputTokens: 0.25, outputTokens: 1 },
  "openai/o4": { inputTokens: 15, outputTokens: 60, reasoningTokens: 60 },
  "openai/o4-mini": { inputTokens: 1.5, outputTokens: 6, reasoningTokens: 6 },
  "google/gemini-2.5-pro": { inputTokens: 2, outputTokens: 8 },
  "google/gemini-2.5-flash": { inputTokens: 0.5, outputTokens: 2 },
  "meta-llama/llama-3.3-70b-instruct": { inputTokens: 0.9, outputTokens: 0.9 },
  "mistralai/mistral-large-2411": { inputTokens: 2, outputTokens: 6 },
};

/** Full pricing table keyed by provider then model ID. */
export const PRICING_TABLE: Record<PricingProvider, Record<string, ModelPricing>> = {
  anthropic: ANTHROPIC_PRICING,
  openai: OPENAI_PRICING,
  poe: POE_PRICING,
  openrouter: OPENROUTER_PRICING,
};

/**
 * Lookup pricing for a provider+model combination.
 * Returns undefined if the provider or model is not in the table — callers
 * should gate cost computation on hasPricing() rather than assuming presence.
 */
export function getPricing(provider: PricingProvider, modelId: string): ModelPricing | undefined {
  return PRICING_TABLE[provider]?.[modelId];
}

/**
 * Returns true when pricing data exists for the given provider+model pair.
 * Useful as a guard before calling getPricing() in cost-calculation paths.
 */
export function hasPricing(provider: PricingProvider, modelId: string): boolean {
  return getPricing(provider, modelId) !== undefined;
}

// Barrel compat — lets callers import the whole module as a namespace if preferred.
export const pricingTable = {
  PRICING_TABLE,
  ANTHROPIC_PRICING,
  OPENAI_PRICING,
  POE_PRICING,
  OPENROUTER_PRICING,
  getPricing,
  hasPricing,
};

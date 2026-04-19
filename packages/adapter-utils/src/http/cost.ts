import { getPricing, type PricingProvider } from './pricing-table.js';
import type { UsageSummary } from './sse-parser.js';

export interface CostSummary {
  /** Total USD cost for this call. */
  totalUsd: number;
  /** Breakdown per rate class for observability + debugging. */
  breakdown: {
    inputUsd: number;       // uncached input tokens × inputTokens rate
    cachedInputUsd: number; // cached read × cachedInputTokens rate (0 if no cache discount applies)
    cachedWriteUsd: number; // cache write × cachedWriteTokens rate (0 if N/A)
    outputUsd: number;      // completion × outputTokens rate
    reasoningUsd: number;   // reasoning × reasoningTokens rate (0 if N/A)
  };
  /** Warnings for missing pricing data etc. */
  warnings: string[];
}

/**
 * Compute USD cost for a single LLM call from its UsageSummary. Uses the
 * static PRICING_TABLE; returns totalUsd: 0 with a warning when pricing is
 * not tabulated for the provider+model pair.
 *
 * Uncached input token count is derived as promptTokens minus cachedPromptTokens
 * minus cachedWriteTokens, clamped to >= 0 defensively (some providers have
 * been observed reporting cached > total during API transitions).
 *
 * Note: usage.totalTokens is intentionally ignored. Summing component token
 * classes (promptTokens, completionTokens, reasoningTokens, etc.) is more
 * accurate; totalTokens is advisory and may have rounding artifacts.
 */
export function computeCost(
  provider: PricingProvider,
  modelId: string,
  usage: UsageSummary,
): CostSummary {
  const warnings: string[] = [];
  const breakdown = {
    inputUsd: 0,
    cachedInputUsd: 0,
    cachedWriteUsd: 0,
    outputUsd: 0,
    reasoningUsd: 0,
  };

  const pricing = getPricing(provider, modelId);
  if (!pricing) {
    warnings.push(`no pricing data for ${provider}/${modelId}`);
    return { totalUsd: 0, breakdown, warnings };
  }

  const promptTokens = Math.max(0, usage.promptTokens);
  const completionTokens = Math.max(0, usage.completionTokens);
  const cachedReads = Math.max(0, usage.cachedPromptTokens ?? 0);
  const cachedWrites = Math.max(0, usage.cachedWriteTokens ?? 0);
  const reasoningTokens = Math.max(0, usage.reasoningTokens ?? 0);

  // Clamp uncached input to 0: a buggy provider could report cached > total,
  // which would otherwise produce a negative uncached count and negative cost.
  const uncachedInput = Math.max(0, promptTokens - cachedReads - cachedWrites);

  // Uncached input billed at full input rate.
  breakdown.inputUsd = (uncachedInput / 1_000_000) * pricing.inputTokens;

  // Cached read: use discounted rate when available; fall back to full rate with warning.
  // This preserves accuracy for providers that expose cache pricing while preventing
  // silent under-counting for those that don't (e.g. Poe, OpenRouter).
  if (cachedReads > 0) {
    if (pricing.cachedInputTokens !== undefined) {
      breakdown.cachedInputUsd = (cachedReads / 1_000_000) * pricing.cachedInputTokens;
    } else {
      breakdown.cachedInputUsd = (cachedReads / 1_000_000) * pricing.inputTokens;
      warnings.push(
        `caching reported (${cachedReads} tokens) but ${provider}/${modelId} has no cache discount; charged at full rate`,
      );
    }
  }

  // Cache write: billed at write premium when tabulated, otherwise at input rate.
  if (cachedWrites > 0) {
    if (pricing.cachedWriteTokens !== undefined) {
      breakdown.cachedWriteUsd = (cachedWrites / 1_000_000) * pricing.cachedWriteTokens;
    } else {
      breakdown.cachedWriteUsd = (cachedWrites / 1_000_000) * pricing.inputTokens;
      warnings.push(
        `cache write reported (${cachedWrites} tokens) but ${provider}/${modelId} has no cache write rate; charged at input rate`,
      );
    }
  }

  // Output tokens billed at output rate.
  breakdown.outputUsd = (completionTokens / 1_000_000) * pricing.outputTokens;

  // Reasoning tokens: use dedicated rate when available (OpenAI o-series), otherwise
  // fall back to outputTokens rate (Anthropic bundles extended thinking into completion).
  if (reasoningTokens > 0) {
    if (pricing.reasoningTokens !== undefined) {
      breakdown.reasoningUsd = (reasoningTokens / 1_000_000) * pricing.reasoningTokens;
    } else {
      breakdown.reasoningUsd = (reasoningTokens / 1_000_000) * pricing.outputTokens;
      warnings.push(
        `reasoning reported (${reasoningTokens} tokens) but ${provider}/${modelId} has no separate reasoning rate; charged at output rate`,
      );
    }
  }

  const totalUsd =
    breakdown.inputUsd +
    breakdown.cachedInputUsd +
    breakdown.cachedWriteUsd +
    breakdown.outputUsd +
    breakdown.reasoningUsd;

  return { totalUsd, breakdown, warnings };
}

// Barrel compat
export const cost = { computeCost };

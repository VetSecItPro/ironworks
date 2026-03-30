/**
 * Rate card for calculating equivalent API spend from token counts.
 * Prices are per 1M tokens in cents (USD).
 * Updated: March 2026. Keep in sync with provider pricing pages.
 */

interface ModelRate {
  inputPer1M: number;   // cents per 1M input tokens
  outputPer1M: number;  // cents per 1M output tokens
  cachedInputPer1M: number; // cents per 1M cached input tokens (usually discounted)
}

const RATE_CARD: Record<string, ModelRate> = {
  // ─── Anthropic ──────────────────────────────────────────
  "claude-opus-4-20250514":           { inputPer1M: 1500, outputPer1M: 7500, cachedInputPer1M: 750 },
  "claude-opus-4":                    { inputPer1M: 1500, outputPer1M: 7500, cachedInputPer1M: 750 },
  "claude-sonnet-4-20250514":         { inputPer1M: 300,  outputPer1M: 1500, cachedInputPer1M: 150 },
  "claude-sonnet-4":                  { inputPer1M: 300,  outputPer1M: 1500, cachedInputPer1M: 150 },
  "claude-3-5-sonnet-20241022":       { inputPer1M: 300,  outputPer1M: 1500, cachedInputPer1M: 150 },
  "claude-3-5-sonnet":                { inputPer1M: 300,  outputPer1M: 1500, cachedInputPer1M: 150 },
  "claude-3-5-haiku-20241022":        { inputPer1M: 80,   outputPer1M: 400,  cachedInputPer1M: 40 },
  "claude-3-5-haiku":                 { inputPer1M: 80,   outputPer1M: 400,  cachedInputPer1M: 40 },
  "claude-haiku-4-5-20251001":        { inputPer1M: 80,   outputPer1M: 400,  cachedInputPer1M: 40 },

  // ─── OpenAI ─────────────────────────────────────────────
  "gpt-4o":                           { inputPer1M: 250,  outputPer1M: 1000, cachedInputPer1M: 125 },
  "gpt-4o-2024-11-20":                { inputPer1M: 250,  outputPer1M: 1000, cachedInputPer1M: 125 },
  "gpt-4o-mini":                      { inputPer1M: 15,   outputPer1M: 60,   cachedInputPer1M: 8 },
  "gpt-4-turbo":                      { inputPer1M: 1000, outputPer1M: 3000, cachedInputPer1M: 500 },
  "o1":                               { inputPer1M: 1500, outputPer1M: 6000, cachedInputPer1M: 750 },
  "o1-mini":                          { inputPer1M: 300,  outputPer1M: 1200, cachedInputPer1M: 150 },
  "o3":                               { inputPer1M: 1000, outputPer1M: 4000, cachedInputPer1M: 500 },
  "o3-mini":                          { inputPer1M: 110,  outputPer1M: 440,  cachedInputPer1M: 55 },
  "o4-mini":                          { inputPer1M: 110,  outputPer1M: 440,  cachedInputPer1M: 55 },
  "codex-mini":                       { inputPer1M: 150,  outputPer1M: 600,  cachedInputPer1M: 25 },

  // ─── Google ─────────────────────────────────────────────
  "gemini-2.5-pro":                   { inputPer1M: 125,  outputPer1M: 1000, cachedInputPer1M: 32 },
  "gemini-2.5-flash":                 { inputPer1M: 15,   outputPer1M: 60,   cachedInputPer1M: 4 },
  "gemini-2.0-flash":                 { inputPer1M: 10,   outputPer1M: 40,   cachedInputPer1M: 3 },
  "gemini-1.5-pro":                   { inputPer1M: 125,  outputPer1M: 500,  cachedInputPer1M: 32 },
  "gemini-1.5-flash":                 { inputPer1M: 8,    outputPer1M: 30,   cachedInputPer1M: 2 },
};

// Default rate for unknown models (roughly mid-tier pricing)
const DEFAULT_RATE: ModelRate = { inputPer1M: 300, outputPer1M: 1500, cachedInputPer1M: 150 };

/**
 * Look up rate for a model. Tries exact match first, then prefix match.
 */
function getRate(model: string): ModelRate {
  const normalized = model.toLowerCase().trim();

  // Exact match
  if (RATE_CARD[normalized]) return RATE_CARD[normalized];

  // Prefix match (e.g. "claude-sonnet-4-20250514" matches "claude-sonnet-4")
  for (const [key, rate] of Object.entries(RATE_CARD)) {
    if (normalized.startsWith(key) || key.startsWith(normalized)) {
      return rate;
    }
  }

  return DEFAULT_RATE;
}

/**
 * Calculate equivalent API spend in cents for a set of token counts.
 */
export function calculateEquivalentSpendCents(
  model: string,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
): number {
  const rate = getRate(model);
  const nonCachedInput = Math.max(0, inputTokens - cachedInputTokens);

  const inputCost = (nonCachedInput / 1_000_000) * rate.inputPer1M;
  const cachedCost = (cachedInputTokens / 1_000_000) * rate.cachedInputPer1M;
  const outputCost = (outputTokens / 1_000_000) * rate.outputPer1M;

  return Math.round(inputCost + cachedCost + outputCost);
}

/**
 * Calculate equivalent spend for an array of cost entries.
 * Returns total equivalent spend in cents.
 */
export function calculateTotalEquivalentSpend(
  entries: Array<{
    model: string;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  }>,
): number {
  return entries.reduce(
    (sum, e) =>
      sum + calculateEquivalentSpendCents(e.model, e.inputTokens, e.cachedInputTokens, e.outputTokens),
    0,
  );
}

/**
 * Get the full rate card (for display in UI).
 */
export function getRateCard(): Record<string, ModelRate> {
  return { ...RATE_CARD };
}

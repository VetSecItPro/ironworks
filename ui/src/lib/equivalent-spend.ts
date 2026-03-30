/**
 * Client-side rate card for calculating equivalent API spend.
 * Mirrors server/src/services/equivalent-spend.ts.
 * Prices in cents per 1M tokens.
 */

const RATES: Record<string, { input: number; output: number; cached: number }> = {
  "claude-opus-4": { input: 1500, output: 7500, cached: 750 },
  "claude-sonnet-4": { input: 300, output: 1500, cached: 150 },
  "claude-3-5-sonnet": { input: 300, output: 1500, cached: 150 },
  "claude-3-5-haiku": { input: 80, output: 400, cached: 40 },
  "claude-haiku-4-5": { input: 80, output: 400, cached: 40 },
  "gpt-4o": { input: 250, output: 1000, cached: 125 },
  "gpt-4o-mini": { input: 15, output: 60, cached: 8 },
  "o1": { input: 1500, output: 6000, cached: 750 },
  "o3-mini": { input: 110, output: 440, cached: 55 },
  "o4-mini": { input: 110, output: 440, cached: 55 },
  "codex-mini": { input: 150, output: 600, cached: 25 },
  "gemini-2.5-pro": { input: 125, output: 1000, cached: 32 },
  "gemini-2.5-flash": { input: 15, output: 60, cached: 4 },
};

const DEFAULT_RATE = { input: 300, output: 1500, cached: 150 };

function getRate(model: string) {
  const n = model.toLowerCase().trim();
  if (RATES[n]) return RATES[n];
  for (const [key, rate] of Object.entries(RATES)) {
    if (n.startsWith(key) || key.startsWith(n)) return rate;
  }
  return DEFAULT_RATE;
}

/**
 * Calculate equivalent API spend in cents for given token counts.
 */
export function equivalentSpendCents(
  model: string,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
): number {
  const rate = getRate(model);
  const nonCached = Math.max(0, inputTokens - cachedInputTokens);
  return Math.round(
    (nonCached / 1_000_000) * rate.input +
    (cachedInputTokens / 1_000_000) * rate.cached +
    (outputTokens / 1_000_000) * rate.output,
  );
}

/**
 * Calculate equivalent spend for multiple model entries.
 */
export function totalEquivalentSpendCents(
  entries: Array<{
    model: string;
    inputTokens: number;
    cachedInputTokens?: number;
    outputTokens: number;
  }>,
): number {
  return entries.reduce(
    (sum, e) => sum + equivalentSpendCents(e.model, e.inputTokens, e.cachedInputTokens ?? 0, e.outputTokens),
    0,
  );
}

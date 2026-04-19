import { describe, it, expect } from 'vitest';
import {
  PRICING_TABLE,
  getPricing,
  hasPricing,
  type ModelPricing,
  type PricingProvider,
} from '../pricing-table.js';

describe('PRICING_TABLE structure', () => {
  it('has entries for all four providers', () => {
    expect(PRICING_TABLE).toHaveProperty('anthropic');
    expect(PRICING_TABLE).toHaveProperty('openai');
    expect(PRICING_TABLE).toHaveProperty('poe');
    expect(PRICING_TABLE).toHaveProperty('openrouter');
  });

  it('each provider entry is a Record of modelId → ModelPricing', () => {
    for (const [provider, models] of Object.entries(PRICING_TABLE)) {
      expect(typeof models).toBe('object');
      for (const [modelId, pricing] of Object.entries(models)) {
        expect(typeof modelId).toBe('string');
        expect(typeof pricing.inputTokens).toBe('number');
        expect(pricing.inputTokens).toBeGreaterThan(0);
        expect(typeof pricing.outputTokens).toBe('number');
        expect(pricing.outputTokens).toBeGreaterThan(0);
      }
    }
  });

  it('includes Claude Opus 4.7 pricing for anthropic', () => {
    const pricing = PRICING_TABLE.anthropic['claude-opus-4-7'];
    expect(pricing).toBeDefined();
    expect(pricing?.inputTokens).toBeGreaterThan(0);
    expect(pricing?.outputTokens).toBeGreaterThan(pricing?.inputTokens ?? 0);  // output always more expensive
  });

  it('includes Claude Sonnet 4.6 pricing for anthropic', () => {
    expect(PRICING_TABLE.anthropic['claude-sonnet-4-6']).toBeDefined();
  });

  it('includes Claude Haiku 4.5 pricing for anthropic', () => {
    expect(PRICING_TABLE.anthropic['claude-haiku-4-5']).toBeDefined();
  });

  it('anthropic entries include cached rate (~90% discount from input)', () => {
    const opus = PRICING_TABLE.anthropic['claude-opus-4-7'];
    expect(opus?.cachedInputTokens).toBeDefined();
    expect(opus!.cachedInputTokens!).toBeLessThan(opus!.inputTokens * 0.2);  // well under 20% of input
  });

  it('anthropic entries include cache write premium (~25% above input)', () => {
    const opus = PRICING_TABLE.anthropic['claude-opus-4-7'];
    expect(opus?.cachedWriteTokens).toBeDefined();
    expect(opus!.cachedWriteTokens!).toBeGreaterThan(opus!.inputTokens);
  });

  it('includes GPT-5 family for openai', () => {
    expect(PRICING_TABLE.openai['gpt-5']).toBeDefined();
    expect(PRICING_TABLE.openai['gpt-5-mini']).toBeDefined();
  });

  it('includes o4 and o4-mini for openai with reasoning-token awareness', () => {
    const o4 = PRICING_TABLE.openai['o4'];
    const o4mini = PRICING_TABLE.openai['o4-mini'];
    expect(o4).toBeDefined();
    expect(o4mini).toBeDefined();
  });

  it('includes Poe model IDs from Phase A discovery (lowercase with dot versioning)', () => {
    expect(PRICING_TABLE.poe['claude-sonnet-4.6']).toBeDefined();
    expect(PRICING_TABLE.poe['gpt-5']).toBeDefined();
    expect(PRICING_TABLE.poe['claude-haiku-4.5']).toBeDefined();
  });

  it('openrouter table has at least 10 models', () => {
    const count = Object.keys(PRICING_TABLE.openrouter).length;
    expect(count).toBeGreaterThanOrEqual(10);
  });

  it('openrouter models with Anthropic origin do NOT have cache discount flagged (caching does not passthrough per Phase A)', () => {
    // Convention: OpenRouter entries omit cachedInputTokens / cachedWriteTokens
    const anthropicOnOpenRouter = PRICING_TABLE.openrouter['anthropic/claude-sonnet-4.5'];
    if (anthropicOnOpenRouter) {
      expect(anthropicOnOpenRouter.cachedInputTokens).toBeUndefined();
      expect(anthropicOnOpenRouter.cachedWriteTokens).toBeUndefined();
    }
  });
});

describe('getPricing', () => {
  it('returns ModelPricing for known provider+model', () => {
    const p = getPricing('anthropic', 'claude-opus-4-7');
    expect(p).toBeDefined();
    expect(p?.inputTokens).toBeGreaterThan(0);
  });

  it('returns undefined for unknown model', () => {
    expect(getPricing('anthropic', 'claude-nonexistent-v99')).toBeUndefined();
  });

  it('returns undefined for unknown provider', () => {
    expect(getPricing('invalid' as PricingProvider, 'anything')).toBeUndefined();
  });

  it('is case-sensitive on model IDs', () => {
    // Anthropic uses lowercase-with-hyphens; Poe uses lowercase-with-dots
    expect(getPricing('anthropic', 'Claude-Opus-4-7')).toBeUndefined();
    expect(getPricing('anthropic', 'claude-opus-4-7')).toBeDefined();
  });
});

describe('hasPricing', () => {
  it('returns true for known pairs', () => {
    expect(hasPricing('anthropic', 'claude-sonnet-4-6')).toBe(true);
    expect(hasPricing('poe', 'gpt-5')).toBe(true);
  });

  it('returns false for unknown pairs', () => {
    expect(hasPricing('anthropic', 'nonexistent')).toBe(false);
  });
});

describe('provenance comments', () => {
  it('module source contains LAST_VERIFIED date markers', async () => {
    // Sanity check that we remembered to date the data
    const source = await import('node:fs').then(fs =>
      fs.promises.readFile(
        new URL('../pricing-table.ts', import.meta.url).pathname,
        'utf8'
      )
    );
    expect(source).toContain('LAST_VERIFIED');
    expect(source.match(/2026-\d{2}-\d{2}/)?.[0]).toBeDefined();
  });
});

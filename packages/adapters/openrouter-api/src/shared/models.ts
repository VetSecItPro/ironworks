/**
 * OpenRouter model catalog as of Phase F build (2026-04-19).
 * OpenRouter is a multi-provider gateway — these IDs are prefixed with the source
 * provider (e.g. "meta-llama/", "anthropic/", "openai/") and routed by OpenRouter.
 *
 * IMPORTANT: OpenRouter does NOT passthrough Anthropic cache_control headers on most
 * routes. Use the anthropic_api adapter directly when prompt caching is required.
 *
 * Pricing: OpenRouter publishes per-model rates. See pricing-table.ts for the
 * table-of-fallbacks approach used by cost.ts — if a model is not in the table,
 * usage is still reported but costUsd is null (graceful fallback per R19).
 */

export interface OpenRouterModel {
  id: string;
  label: string;
  /** Source provider for display and routing context. */
  provider: string;
  /** Maximum output tokens (approximate — varies by OpenRouter version). */
  maxOutputTokens: number;
}

export const OPENROUTER_MODELS: OpenRouterModel[] = [
  // Llama 4 family (Meta, released 2025) — strong open-weight multi-modal models
  {
    id: "meta-llama/llama-4-scout-17b-16e-instruct",
    label: "Llama 4 Scout 17B",
    provider: "meta-llama",
    maxOutputTokens: 8192,
  },
  {
    id: "meta-llama/llama-4-maverick-17b-128e-instruct",
    label: "Llama 4 Maverick 17B",
    provider: "meta-llama",
    maxOutputTokens: 8192,
  },

  // Mistral family — strong European models, good for regulated workloads
  {
    id: "mistralai/mistral-large-2411",
    label: "Mistral Large 2411",
    provider: "mistralai",
    maxOutputTokens: 8192,
  },
  {
    id: "mistralai/mistral-small-2501",
    label: "Mistral Small 2501",
    provider: "mistralai",
    maxOutputTokens: 8192,
  },

  // Anthropic via OpenRouter relay — no prompt caching passthrough (documented in agentConfigurationDoc)
  {
    id: "anthropic/claude-opus-4-7",
    label: "Claude Opus 4.7 (via OpenRouter)",
    provider: "anthropic",
    maxOutputTokens: 8192,
  },
  {
    id: "anthropic/claude-sonnet-4-6",
    label: "Claude Sonnet 4.6 (via OpenRouter)",
    provider: "anthropic",
    maxOutputTokens: 8192,
  },

  // OpenAI via OpenRouter relay
  {
    id: "openai/gpt-5",
    label: "GPT-5 (via OpenRouter)",
    provider: "openai",
    maxOutputTokens: 16384,
  },
  {
    id: "openai/gpt-5-mini",
    label: "GPT-5 Mini (via OpenRouter)",
    provider: "openai",
    maxOutputTokens: 16384,
  },

  // Google Gemini family — excellent long-context and multimodal capabilities
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "google",
    maxOutputTokens: 8192,
  },
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "google",
    maxOutputTokens: 8192,
  },

  // DeepSeek — strong coding and reasoning models from China
  {
    id: "deepseek/deepseek-v3",
    label: "DeepSeek V3",
    provider: "deepseek",
    maxOutputTokens: 8192,
  },
  {
    id: "deepseek/deepseek-r1",
    label: "DeepSeek R1",
    provider: "deepseek",
    maxOutputTokens: 8192,
  },

  // Qwen — Alibaba's multilingual model, strong on Asian-language tasks
  {
    id: "qwen/qwen-2.5-72b-instruct",
    label: "Qwen 2.5 72B Instruct",
    provider: "qwen",
    maxOutputTokens: 8192,
  },

  // xAI Grok — strong reasoning + real-time web knowledge
  {
    id: "x-ai/grok-3-latest",
    label: "Grok 3 Latest",
    provider: "x-ai",
    maxOutputTokens: 8192,
  },

  // Perplexity Sonar — optimized for factual retrieval with web grounding
  {
    id: "perplexity/sonar-large",
    label: "Perplexity Sonar Large",
    provider: "perplexity",
    maxOutputTokens: 8192,
  },
];

/** Resolved set of valid model IDs for fast O(1) validation. */
export const OPENROUTER_MODEL_IDS = new Set(OPENROUTER_MODELS.map((m) => m.id));

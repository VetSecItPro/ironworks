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
  /**
   * Model context window in tokens (input + output combined). Drives the
   * compaction trigger threshold — adapters use this to decide when to
   * summarize older transcript turns before they exceed the cliff.
   */
  contextWindowTokens: number;
}

export const OPENROUTER_MODELS: OpenRouterModel[] = [
  // ─── Free tier (OpenRouter ":free" suffix) ─────────────────────────────────
  // Western open-weight models available at zero per-token cost on OpenRouter.
  // Subject to a global free-tier rate limit (1000 req/day for accounts with
  // >$10 in lifetime credits, 50/day otherwise). Pricing-table.ts handles
  // unknown/missing entries gracefully — costUsd = null, usage still tracked.
  {
    id: "openai/gpt-oss-120b:free",
    label: "GPT-OSS 120B (free)",
    provider: "openai",
    maxOutputTokens: 16384,
    contextWindowTokens: 131072,
  },
  {
    id: "openai/gpt-oss-20b:free",
    label: "GPT-OSS 20B (free)",
    provider: "openai",
    maxOutputTokens: 8192,
    contextWindowTokens: 131072,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B Instruct (free)",
    provider: "meta-llama",
    maxOutputTokens: 8192,
    contextWindowTokens: 131072,
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-405b:free",
    label: "Hermes 3 Llama 3.1 405B (free)",
    provider: "nousresearch",
    maxOutputTokens: 8192,
    contextWindowTokens: 131072,
  },
  {
    id: "google/gemma-4-31b-it:free",
    label: "Gemma 4 31B (free)",
    provider: "google",
    maxOutputTokens: 8192,
    contextWindowTokens: 262144,
  },
  {
    id: "google/gemma-3-12b-it:free",
    label: "Gemma 3 12B (free)",
    provider: "google",
    maxOutputTokens: 8192,
    contextWindowTokens: 131072,
  },

  // Mistral family — strong European models, good for regulated workloads
  {
    id: "mistralai/mistral-large-2411",
    label: "Mistral Large 2411",
    provider: "mistralai",
    maxOutputTokens: 8192,
    contextWindowTokens: 131072,
  },

  // OpenAI via OpenRouter relay
  {
    id: "openai/gpt-5",
    label: "GPT-5 (via OpenRouter)",
    provider: "openai",
    maxOutputTokens: 16384,
    contextWindowTokens: 262144,
  },
  {
    id: "openai/gpt-5-mini",
    label: "GPT-5 Mini (via OpenRouter)",
    provider: "openai",
    maxOutputTokens: 16384,
    contextWindowTokens: 262144,
  },

  // Google Gemini family — excellent long-context and multimodal capabilities
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "google",
    maxOutputTokens: 8192,
    contextWindowTokens: 1048576,
  },
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "google",
    maxOutputTokens: 8192,
    contextWindowTokens: 1048576,
  },

  // DeepSeek — strong coding and reasoning models from China
  {
    id: "deepseek/deepseek-r1",
    label: "DeepSeek R1",
    provider: "deepseek",
    maxOutputTokens: 8192,
    contextWindowTokens: 131072,
  },

  // Qwen — Alibaba's multilingual model, strong on Asian-language tasks
  {
    id: "qwen/qwen-2.5-72b-instruct",
    label: "Qwen 2.5 72B Instruct",
    provider: "qwen",
    maxOutputTokens: 8192,
    contextWindowTokens: 131072,
  },
];

/** Resolved set of valid model IDs for fast O(1) validation. */
export const OPENROUTER_MODEL_IDS = new Set(OPENROUTER_MODELS.map((m) => m.id));

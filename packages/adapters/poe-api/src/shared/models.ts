/**
 * Poe-supported model catalog as of Phase A discovery (2026-04-19).
 * Poe's /v1/models returns 376 models; this list captures the tier-1 models
 * confirmed to support tool_calls in our curl probes.
 *
 * Tool-use support caveats:
 * - All listed models support the OpenAI-compat tools/tool_choice params.
 * - Poe relays tools downstream to the native provider; compatibility depends
 *   on whether the underlying provider model supports function calling.
 * - Models prefixed with a provider slug (e.g. "openai/gpt-4o") are Poe's
 *   provider-qualified variants; they behave identically but route explicitly.
 */

export interface PoeModel {
  id: string;
  label: string;
  /** Indicates whether Poe confirmed tool_calls support in Phase A probes. */
  toolsConfirmed: boolean;
}

export const POE_MODELS: PoeModel[] = [
  // Anthropic models on Poe
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", toolsConfirmed: true },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", toolsConfirmed: true },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", toolsConfirmed: true },
  { id: "claude-3-opus", label: "Claude 3 Opus", toolsConfirmed: true },
  // OpenAI models on Poe
  { id: "gpt-5", label: "GPT-5", toolsConfirmed: true },
  { id: "gpt-4o", label: "GPT-4o", toolsConfirmed: true },
  { id: "gpt-4o-mini", label: "GPT-4o mini", toolsConfirmed: true },
  { id: "o4-mini", label: "o4-mini", toolsConfirmed: true },
  // Google models on Poe
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", toolsConfirmed: true },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", toolsConfirmed: true },
  // Meta models on Poe
  { id: "llama-3.1-405b-instruct", label: "Llama 3.1 405B Instruct", toolsConfirmed: false },
  { id: "llama-4-scout", label: "Llama 4 Scout", toolsConfirmed: false },
];

/** Resolved set of valid model IDs for fast O(1) validation. */
export const POE_MODEL_IDS = new Set(POE_MODELS.map((m) => m.id));

/**
 * OpenAI model catalog as of Phase E build (2026-04-19).
 * All models use OpenAI's Chat Completions API at https://api.openai.com/v1/chat/completions.
 *
 * Reasoning models (o4, o4-mini) emit reasoning_tokens in usage and have dedicated pricing.
 * GPT-4o variants are included for backward compatibility with agents migrating from poe-api.
 */

export interface OpenAIModel {
  id: string;
  label: string;
  /**
   * Whether this is a reasoning model (o4 family).
   * Reasoning models bill reasoning_tokens at the same rate as output tokens (E.3).
   */
  isReasoningModel: boolean;
  /**
   * Whether structured outputs (response_format: json_schema) are supported.
   * All GPT-5 and o4 family models support structured outputs.
   */
  supportsStructuredOutputs: boolean;
  /** Maximum output tokens supported by this model. */
  maxOutputTokens: number;
}

export const OPENAI_MODELS: OpenAIModel[] = [
  // GPT-5 family — flagship non-reasoning models
  {
    id: "gpt-5",
    label: "GPT-5",
    isReasoningModel: false,
    supportsStructuredOutputs: true,
    maxOutputTokens: 16384,
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 Mini",
    isReasoningModel: false,
    supportsStructuredOutputs: true,
    maxOutputTokens: 16384,
  },
  {
    id: "gpt-5-nano",
    label: "GPT-5 Nano",
    isReasoningModel: false,
    supportsStructuredOutputs: true,
    maxOutputTokens: 8192,
  },
  {
    id: "chatgpt-latest",
    label: "ChatGPT Latest",
    isReasoningModel: false,
    supportsStructuredOutputs: false,
    maxOutputTokens: 16384,
  },
  // o4 reasoning model family
  {
    id: "o4",
    label: "o4",
    isReasoningModel: true,
    supportsStructuredOutputs: true,
    maxOutputTokens: 32768,
  },
  {
    id: "o4-mini",
    label: "o4 Mini",
    isReasoningModel: true,
    supportsStructuredOutputs: true,
    maxOutputTokens: 65536,
  },
  // Backward-compat entries for agents migrating from gpt-4o on poe-api
  {
    id: "gpt-4o",
    label: "GPT-4o (legacy)",
    isReasoningModel: false,
    supportsStructuredOutputs: true,
    maxOutputTokens: 16384,
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o Mini (legacy)",
    isReasoningModel: false,
    supportsStructuredOutputs: true,
    maxOutputTokens: 16384,
  },
];

/** Resolved set of valid model IDs for fast O(1) validation. */
export const OPENAI_MODEL_IDS = new Set(OPENAI_MODELS.map((m) => m.id));

/** Resolved set of reasoning model IDs for fast billing-path branching. */
export const OPENAI_REASONING_MODEL_IDS = new Set(OPENAI_MODELS.filter((m) => m.isReasoningModel).map((m) => m.id));

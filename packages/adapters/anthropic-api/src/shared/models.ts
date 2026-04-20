/**
 * Anthropic Claude model catalog as of Phase D build (2026-04-19).
 * All models use Anthropic's native Messages API at https://api.anthropic.com/v1/messages.
 *
 * Extended thinking is supported on Opus 4.7 and Sonnet 4.6.
 * Prompt caching is supported on all three models.
 */

export interface AnthropicModel {
  id: string;
  label: string;
  /** Whether the model supports extended thinking (thinking: {type:"enabled",...}). */
  supportsExtendedThinking: boolean;
  /** Maximum output tokens supported by this model. */
  maxOutputTokens: number;
}

export const ANTHROPIC_MODELS: AnthropicModel[] = [
  {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    supportsExtendedThinking: true,
    maxOutputTokens: 32000,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    supportsExtendedThinking: true,
    maxOutputTokens: 16000,
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    supportsExtendedThinking: false,
    maxOutputTokens: 8192,
  },
];

/** Resolved set of valid model IDs for fast O(1) validation. */
export const ANTHROPIC_MODEL_IDS = new Set(ANTHROPIC_MODELS.map((m) => m.id));

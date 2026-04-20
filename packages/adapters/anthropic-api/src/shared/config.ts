import { ANTHROPIC_MODEL_IDS, ANTHROPIC_MODELS } from "./models.js";

// Re-export so consumers only need to import from config.ts
export { ANTHROPIC_MODELS } from "./models.js";

// ---------------------------------------------------------------------------
// Config shape
// ---------------------------------------------------------------------------

export interface AnthropicAdapterConfig {
  /** API key or env-var reference (e.g. "${ANTHROPIC_API_KEY}"). Optional when set
   *  as ADAPTER_ANTHROPIC_API_KEY on the host environment. */
  apiKey?: string;
  /** Anthropic model ID — required. */
  model: string;
  /** Sampling temperature [0, 1]. Optional. Mutually exclusive with extended thinking. */
  temperature?: number;
  /** Max tokens for completion. Optional — defaults to model max. */
  maxTokens?: number;
  /**
   * Prompt caching configuration. When set, cache_control breakpoints are applied
   * to the system prompt block at the specified character offsets, enabling Anthropic's
   * prompt cache and cutting input token costs by ~90% on cache hits (D.4).
   */
  cacheControl?: {
    /**
     * Number of system prompt breakpoints to mark with cache_control:{type:"ephemeral"}.
     * Each breakpoint marks a cache boundary — the portion up to that point is cached.
     * Typically 1 (cache the whole system prompt) or 2 (cache header + tools).
     */
    breakpoints: number;
  };
  /**
   * Extended thinking configuration. When set, Anthropic returns thinking content blocks
   * containing the model's reasoning prior to the final response (D.5).
   * Only supported on claude-opus-4-7 and claude-sonnet-4-6.
   */
  extendedThinking?: {
    /** Token budget for the thinking phase. Minimum 1024. */
    budgetTokens: number;
  };
  /**
   * Skill keys whose content should be injected into the system prompt at execute time.
   * Anthropic API is stateless and cannot sync skill files to disk, so skills are
   * inlined instead of synced (R18 mitigation).
   */
  systemPromptSkills?: string[];
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export type ValidateAnthropicConfigResult =
  | { ok: true; config: AnthropicAdapterConfig }
  | { ok: false; error: string; suggestions?: string[] };

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Validate and coerce raw adapter config into a typed AnthropicAdapterConfig.
 * Returns error details + model suggestions on failure so the UI can surface
 * actionable messages instead of opaque "invalid config" responses.
 */
export function validateAnthropicConfig(raw: unknown): ValidateAnthropicConfigResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Config must be a plain object." };
  }

  const record = raw as Record<string, unknown>;

  // model is required
  if (typeof record.model !== "string" || record.model.trim().length === 0) {
    return {
      ok: false,
      error: "Config requires a non-empty `model` string.",
      suggestions: ANTHROPIC_MODELS.slice(0, 3).map((m) => m.id),
    };
  }

  const model = record.model.trim();

  if (!ANTHROPIC_MODEL_IDS.has(model)) {
    return {
      ok: false,
      error: `Unknown Anthropic model: "${model}". Use one of the supported model IDs.`,
      suggestions: ANTHROPIC_MODELS.map((m) => m.id),
    };
  }

  // temperature optional [0, 1]
  if (record.temperature !== undefined) {
    const temp = record.temperature;
    if (typeof temp !== "number" || !Number.isFinite(temp) || temp < 0 || temp > 1) {
      return {
        ok: false,
        error: `Invalid temperature: ${String(temp)}. Must be a number in [0, 1].`,
      };
    }
  }

  // maxTokens optional positive integer
  if (record.maxTokens !== undefined) {
    const max = record.maxTokens;
    if (typeof max !== "number" || !Number.isFinite(max) || max <= 0 || !Number.isInteger(max)) {
      return {
        ok: false,
        error: `Invalid maxTokens: ${String(max)}. Must be a positive integer.`,
      };
    }
  }

  // cacheControl optional — validate breakpoints is a positive integer
  let cacheControl: AnthropicAdapterConfig["cacheControl"];
  if (record.cacheControl !== undefined) {
    if (typeof record.cacheControl !== "object" || record.cacheControl === null || Array.isArray(record.cacheControl)) {
      return { ok: false, error: "cacheControl must be an object." };
    }
    const cc = record.cacheControl as Record<string, unknown>;
    if (typeof cc.breakpoints !== "number" || !Number.isInteger(cc.breakpoints) || cc.breakpoints < 1) {
      return { ok: false, error: "cacheControl.breakpoints must be a positive integer." };
    }
    cacheControl = { breakpoints: cc.breakpoints };
  }

  // extendedThinking optional — validate budgetTokens >= 1024
  let extendedThinking: AnthropicAdapterConfig["extendedThinking"];
  if (record.extendedThinking !== undefined) {
    if (
      typeof record.extendedThinking !== "object" ||
      record.extendedThinking === null ||
      Array.isArray(record.extendedThinking)
    ) {
      return { ok: false, error: "extendedThinking must be an object." };
    }
    const et = record.extendedThinking as Record<string, unknown>;
    if (typeof et.budgetTokens !== "number" || !Number.isInteger(et.budgetTokens) || et.budgetTokens < 1024) {
      return { ok: false, error: "extendedThinking.budgetTokens must be an integer >= 1024." };
    }
    extendedThinking = { budgetTokens: et.budgetTokens };
  }

  // systemPromptSkills optional string array
  let systemPromptSkills: string[] | undefined;
  if (record.systemPromptSkills !== undefined) {
    if (!Array.isArray(record.systemPromptSkills)) {
      return {
        ok: false,
        error: "systemPromptSkills must be an array of strings.",
      };
    }
    systemPromptSkills = record.systemPromptSkills.filter(
      (s): s is string => typeof s === "string" && s.trim().length > 0,
    );
  }

  // apiKey optional string (may be env-var reference like "${ANTHROPIC_API_KEY}")
  const apiKey =
    typeof record.apiKey === "string" && record.apiKey.trim().length > 0 ? record.apiKey.trim() : undefined;

  const config: AnthropicAdapterConfig = {
    model,
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(record.temperature !== undefined ? { temperature: record.temperature as number } : {}),
    ...(record.maxTokens !== undefined ? { maxTokens: record.maxTokens as number } : {}),
    ...(cacheControl !== undefined ? { cacheControl } : {}),
    ...(extendedThinking !== undefined ? { extendedThinking } : {}),
    ...(systemPromptSkills !== undefined ? { systemPromptSkills } : {}),
  };

  return { ok: true, config };
}

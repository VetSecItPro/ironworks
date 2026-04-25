import { OPENROUTER_MODEL_IDS, OPENROUTER_MODELS } from "./models.js";

// Re-export so consumers only need to import from config.ts
export { OPENROUTER_MODELS } from "./models.js";

// ---------------------------------------------------------------------------
// Config shape
// ---------------------------------------------------------------------------

export interface OpenRouterAdapterConfig {
  /** API key or env-var reference (e.g. "${OPENROUTER_API_KEY}"). Optional when set
   *  as ADAPTER_OPENROUTER_API_KEY on the host environment. */
  apiKey?: string;
  /** OpenRouter model ID — required. */
  model: string;
  /**
   * Optional fallback model ID. When the primary `model` exhausts retries with
   * a rate-limit or server error, the adapter runs one final attempt against
   * this model before surfacing the failure. Free-tier models on OpenRouter
   * are rate-limited per-model (not per-account), so a fallback meaningfully
   * lifts effective throughput for long-running fleets.
   */
  fallbackModel?: string;
  /** Sampling temperature [0, 2]. Optional. */
  temperature?: number;
  /** Max tokens for completion. Optional — defaults to 4096. */
  maxTokens?: number;
  /**
   * HTTP-Referer header sent to OpenRouter. Identifies the app making the request
   * per OpenRouter's recommended convention. Defaults to "https://command.useapex.io".
   */
  httpReferer?: string;
  /**
   * X-Title header sent to OpenRouter. Human-readable app name displayed in usage
   * dashboards on openrouter.ai. Defaults to "IronWorks".
   */
  xTitle?: string;
  /**
   * Skill keys whose content should be injected into the system prompt at execute time.
   * OpenRouter API is stateless and cannot sync skill files to disk like CLI adapters (R18).
   */
  systemPromptSkills?: string[];
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export type ValidateOpenRouterConfigResult =
  | { ok: true; config: OpenRouterAdapterConfig }
  | { ok: false; error: string; suggestions?: string[] };

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Validate and coerce raw adapter config into a typed OpenRouterAdapterConfig.
 * Returns error details + model suggestions on failure so the UI can surface
 * actionable messages instead of opaque "invalid config" responses.
 */
export function validateOpenRouterConfig(raw: unknown): ValidateOpenRouterConfigResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Config must be a plain object." };
  }

  const record = raw as Record<string, unknown>;

  // model is required
  if (typeof record.model !== "string" || record.model.trim().length === 0) {
    return {
      ok: false,
      error: "Config requires a non-empty `model` string.",
      suggestions: OPENROUTER_MODELS.slice(0, 3).map((m) => m.id),
    };
  }

  const model = record.model.trim();

  if (!OPENROUTER_MODEL_IDS.has(model)) {
    return {
      ok: false,
      error: `Unknown OpenRouter model: "${model}". Use one of the supported model IDs.`,
      suggestions: OPENROUTER_MODELS.map((m) => m.id),
    };
  }

  // fallbackModel optional — must be a known model ID if provided. Same registry as primary.
  let fallbackModel: string | undefined;
  if (record.fallbackModel !== undefined) {
    if (typeof record.fallbackModel !== "string" || record.fallbackModel.trim().length === 0) {
      return { ok: false, error: "fallbackModel must be a non-empty string when provided." };
    }
    const fb = record.fallbackModel.trim();
    if (!OPENROUTER_MODEL_IDS.has(fb)) {
      return {
        ok: false,
        error: `Unknown OpenRouter fallbackModel: "${fb}". Use one of the supported model IDs.`,
        suggestions: OPENROUTER_MODELS.map((m) => m.id),
      };
    }
    if (fb === model) {
      return { ok: false, error: "fallbackModel must differ from primary model." };
    }
    fallbackModel = fb;
  }

  // temperature optional [0, 2]
  if (record.temperature !== undefined) {
    const temp = record.temperature;
    if (typeof temp !== "number" || !Number.isFinite(temp) || temp < 0 || temp > 2) {
      return {
        ok: false,
        error: `Invalid temperature: ${String(temp)}. Must be a number in [0, 2].`,
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

  // httpReferer optional string
  const httpReferer =
    typeof record.httpReferer === "string" && record.httpReferer.trim().length > 0
      ? record.httpReferer.trim()
      : undefined;

  // xTitle optional string
  const xTitle =
    typeof record.xTitle === "string" && record.xTitle.trim().length > 0 ? record.xTitle.trim() : undefined;

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

  // apiKey optional string (may be env-var reference like "${OPENROUTER_API_KEY}")
  const apiKey =
    typeof record.apiKey === "string" && record.apiKey.trim().length > 0 ? record.apiKey.trim() : undefined;

  const config: OpenRouterAdapterConfig = {
    model,
    ...(fallbackModel !== undefined ? { fallbackModel } : {}),
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(record.temperature !== undefined ? { temperature: record.temperature as number } : {}),
    ...(record.maxTokens !== undefined ? { maxTokens: record.maxTokens as number } : {}),
    ...(httpReferer !== undefined ? { httpReferer } : {}),
    ...(xTitle !== undefined ? { xTitle } : {}),
    ...(systemPromptSkills !== undefined ? { systemPromptSkills } : {}),
  };

  return { ok: true, config };
}

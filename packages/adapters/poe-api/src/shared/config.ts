import { POE_MODEL_IDS, POE_MODELS } from "./models.js";

// Re-export so consumers only need to import from config.ts
export { POE_MODELS } from "./models.js";

// ---------------------------------------------------------------------------
// Config shape
// ---------------------------------------------------------------------------

export interface PoeAdapterConfig {
  /** API key or env-var reference (e.g. "${POE_API_KEY}"). Optional when set
   *  as ADAPTER_POE_API_KEY on the host environment. */
  apiKey?: string;
  /** Poe model ID — required. */
  model: string;
  /** Sampling temperature [0, 2]. Optional. */
  temperature?: number;
  /** Max tokens for completion. Optional. */
  maxTokens?: number;
  /**
   * Skill keys whose content should be injected into the system prompt at
   * execute time. Poe is stateless and cannot sync skill files to disk, so
   * skills are inlined instead of synced (R18 mitigation).
   */
  systemPromptSkills?: string[];
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export type ValidatePoeConfigResult =
  | { ok: true; config: PoeAdapterConfig }
  | { ok: false; error: string; suggestions?: string[] };

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Validate and coerce raw adapter config into a typed PoeAdapterConfig.
 * Returns error details + model suggestions on failure so the UI can surface
 * actionable messages instead of opaque "invalid config" responses.
 */
export function validatePoeConfig(raw: unknown): ValidatePoeConfigResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Config must be a plain object." };
  }

  const record = raw as Record<string, unknown>;

  // model is required
  if (typeof record.model !== "string" || record.model.trim().length === 0) {
    return {
      ok: false,
      error: "Config requires a non-empty `model` string.",
      suggestions: POE_MODELS.slice(0, 5).map((m) => m.id),
    };
  }

  const model = record.model.trim();

  if (!POE_MODEL_IDS.has(model)) {
    return {
      ok: false,
      error: `Unknown Poe model: "${model}". Use one of the supported model IDs.`,
      suggestions: POE_MODELS.map((m) => m.id),
    };
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

  // apiKey optional string (may be env-var reference like "${POE_API_KEY}")
  const apiKey =
    typeof record.apiKey === "string" && record.apiKey.trim().length > 0 ? record.apiKey.trim() : undefined;

  const config: PoeAdapterConfig = {
    model,
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(record.temperature !== undefined ? { temperature: record.temperature as number } : {}),
    ...(record.maxTokens !== undefined ? { maxTokens: record.maxTokens as number } : {}),
    ...(systemPromptSkills !== undefined ? { systemPromptSkills } : {}),
  };

  return { ok: true, config };
}

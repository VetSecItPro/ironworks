import { OPENAI_MODEL_IDS, OPENAI_MODELS } from "./models.js";

// Re-export so consumers only need to import from config.ts
export { OPENAI_MODELS } from "./models.js";

// ---------------------------------------------------------------------------
// Config shape
// ---------------------------------------------------------------------------

export interface OpenAIAdapterConfig {
  /** API key or env-var reference (e.g. "${OPENAI_API_KEY}"). Optional when set
   *  as ADAPTER_OPENAI_API_KEY on the host environment. */
  apiKey?: string;
  /** OpenAI model ID — required. */
  model: string;
  /** Sampling temperature [0, 2]. Optional. Not applicable to reasoning models. */
  temperature?: number;
  /** Max tokens for completion. Optional — defaults to model max. */
  maxTokens?: number;
  /**
   * Enable structured outputs via response_format: {type: "json_schema", json_schema: {...}}.
   * The schema is passed through to OpenAI as-is (E.4).
   */
  structuredOutputSchema?: {
    /** Schema name — must match [a-zA-Z0-9_-]{1,64} per OpenAI spec. */
    name: string;
    /** JSON Schema object describing the expected response structure. */
    schema: Record<string, unknown>;
    /** When true OpenAI enforces strict schema adherence. Default: true. */
    strict?: boolean;
  };
  /**
   * When true, allow OpenAI to call multiple tools in parallel within a single response.
   * Default: undefined (OpenAI default behaviour).
   * Disable if tool order matters or tools have conflicting side effects.
   */
  parallelToolCalls?: boolean;
  /**
   * Skill keys whose content should be injected into the system prompt at execute time.
   * OpenAI API is stateless and cannot sync skill files to disk like CLI adapters (R18).
   */
  systemPromptSkills?: string[];
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export type ValidateOpenAIConfigResult =
  | { ok: true; config: OpenAIAdapterConfig }
  | { ok: false; error: string; suggestions?: string[] };

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Validate and coerce raw adapter config into a typed OpenAIAdapterConfig.
 * Returns error details + model suggestions on failure so the UI can surface
 * actionable messages instead of opaque "invalid config" responses.
 */
export function validateOpenAIConfig(raw: unknown): ValidateOpenAIConfigResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Config must be a plain object." };
  }

  const record = raw as Record<string, unknown>;

  // model is required
  if (typeof record.model !== "string" || record.model.trim().length === 0) {
    return {
      ok: false,
      error: "Config requires a non-empty `model` string.",
      suggestions: OPENAI_MODELS.slice(0, 3).map((m) => m.id),
    };
  }

  const model = record.model.trim();

  if (!OPENAI_MODEL_IDS.has(model)) {
    return {
      ok: false,
      error: `Unknown OpenAI model: "${model}". Use one of the supported model IDs.`,
      suggestions: OPENAI_MODELS.map((m) => m.id),
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

  // structuredOutputSchema optional — validate required sub-fields
  let structuredOutputSchema: OpenAIAdapterConfig["structuredOutputSchema"];
  if (record.structuredOutputSchema !== undefined) {
    if (
      typeof record.structuredOutputSchema !== "object" ||
      record.structuredOutputSchema === null ||
      Array.isArray(record.structuredOutputSchema)
    ) {
      return { ok: false, error: "structuredOutputSchema must be an object." };
    }
    const sos = record.structuredOutputSchema as Record<string, unknown>;
    if (typeof sos.name !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(sos.name)) {
      return {
        ok: false,
        error: "structuredOutputSchema.name must match [a-zA-Z0-9_-]{1,64} per OpenAI spec.",
      };
    }
    if (typeof sos.schema !== "object" || sos.schema === null || Array.isArray(sos.schema)) {
      return { ok: false, error: "structuredOutputSchema.schema must be a plain object (JSON Schema)." };
    }
    structuredOutputSchema = {
      name: sos.name,
      schema: sos.schema as Record<string, unknown>,
      ...(typeof sos.strict === "boolean" ? { strict: sos.strict } : {}),
    };
  }

  // parallelToolCalls optional boolean
  if (record.parallelToolCalls !== undefined && typeof record.parallelToolCalls !== "boolean") {
    return { ok: false, error: "parallelToolCalls must be a boolean." };
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

  // apiKey optional string (may be env-var reference like "${OPENAI_API_KEY}")
  const apiKey =
    typeof record.apiKey === "string" && record.apiKey.trim().length > 0 ? record.apiKey.trim() : undefined;

  const config: OpenAIAdapterConfig = {
    model,
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(record.temperature !== undefined ? { temperature: record.temperature as number } : {}),
    ...(record.maxTokens !== undefined ? { maxTokens: record.maxTokens as number } : {}),
    ...(structuredOutputSchema !== undefined ? { structuredOutputSchema } : {}),
    ...(record.parallelToolCalls !== undefined ? { parallelToolCalls: record.parallelToolCalls as boolean } : {}),
    ...(systemPromptSkills !== undefined ? { systemPromptSkills } : {}),
  };

  return { ok: true, config };
}

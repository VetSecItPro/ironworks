/**
 * Bidirectional tool-call normalization for HTTP adapters.
 *
 * Providers speak two distinct formats:
 *   - "openai"    — OpenAI, OpenRouter, Poe (OpenAI-compat)
 *   - "anthropic" — Anthropic native
 *
 * This module owns the translation layer so every adapter above it
 * operates on a single generic vocabulary (ToolDefinition / ToolInvocation / ToolResult).
 */

// NodeNext resolution with esModuleInterop requires the named class export when
// Ajv ships a CJS-with-default bundle — the `import Ajv from 'ajv'` default form
// resolves to the module namespace object instead of the constructor.
import { Ajv, type ValidateFunction } from 'ajv';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Generic tool definition (what IronWorks declares an agent can call). */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the args object. */
  parameters: Record<string, unknown>;
}

/** Generic parsed tool invocation (what the model asked us to run). */
export interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/** Generic tool result (what we send back to the model). */
export interface ToolResult {
  toolCallId: string;
  /** IronWorks-internal field; not forwarded to providers. */
  toolName: string;
  /** String form of the tool output. For structured data, stringify to JSON. */
  content: string;
  /** When true, providers are told this was an error (Anthropic sets is_error, OpenAI relies on content). */
  isError: boolean;
}

/** Which wire format to speak. Poe + OpenRouter alias to 'openai'. */
export type ProviderToolFormat = 'openai' | 'anthropic';

// ---------------------------------------------------------------------------
// Outbound: IronWorks → provider (request payload)
// ---------------------------------------------------------------------------

/**
 * Convert IronWorks ToolDefinitions into the provider-specific schema shape
 * that belongs in the request body's `tools` array.
 *
 * OpenAI wraps the definition inside a `function` key; Anthropic uses
 * `input_schema` instead of `parameters` and drops the `type` wrapper.
 * Input objects are never mutated — each conversion allocates fresh objects.
 */
export function toProviderToolDefinitions(
  tools: ToolDefinition[],
  format: ProviderToolFormat,
): unknown[] {
  if (format === 'openai') {
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  // Anthropic drops the outer `type`/`function` wrapper and calls the schema `input_schema`
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

// ---------------------------------------------------------------------------
// Inbound: provider response → IronWorks (parsed tool call)
// ---------------------------------------------------------------------------

/**
 * Parse a single tool-call object from a provider response into the generic
 * ToolInvocation shape consumed by the IronWorks agent runtime.
 *
 * Throws `Error('invalid tool call: <reason>')` on malformed input so callers
 * can convert to an adapter-level validation error before surfacing to users.
 *
 * OpenAI serialises args as a JSON *string* in `function.arguments` — this is
 * the primary source of subtle bugs when adapters forget to parse it.
 * Anthropic passes args as a pre-parsed object in `input`.
 *
 * If calling from an SDK that auto-parses function.arguments into an object,
 * you must re-stringify before calling this function — we expect the raw JSON
 * string form per the wire protocol.
 */
export function fromProviderToolCall(
  call: unknown,
  format: ProviderToolFormat,
): ToolInvocation {
  if (call === null || typeof call !== 'object') {
    throw new Error('invalid tool call: expected object');
  }

  const raw = call as Record<string, unknown>;

  if (format === 'openai') {
    // Validate required OpenAI fields
    if (typeof raw['id'] !== 'string' || raw['id'] === '') {
      throw new Error('invalid tool call: missing id');
    }
    if (raw['type'] !== 'function') {
      throw new Error('invalid tool call: type must be "function"');
    }

    const fn = raw['function'];
    if (fn === null || typeof fn !== 'object') {
      throw new Error('invalid tool call: missing function object');
    }
    const fnObj = fn as Record<string, unknown>;

    if (typeof fnObj['name'] !== 'string' || fnObj['name'] === '') {
      throw new Error('invalid tool call: missing function.name');
    }
    if (typeof fnObj['arguments'] !== 'string') {
      throw new Error('invalid tool call: function.arguments must be a string');
    }

    // Parse the JSON string — empty string is intentionally rejected here
    // so malformed streamed chunks surface immediately rather than silently
    // producing empty args
    const argsString = fnObj['arguments'] as string;
    let args: unknown;
    try {
      args = JSON.parse(argsString);
    } catch {
      throw new Error(
        `invalid tool call: failed to parse function.arguments as JSON: ${argsString.slice(0, 100)}`,
      );
    }

    if (args === null || typeof args !== 'object' || Array.isArray(args)) {
      throw new Error('invalid tool call: parsed arguments must be an object');
    }

    return {
      toolCallId: raw['id'] as string,
      toolName: fnObj['name'] as string,
      args: args as Record<string, unknown>,
    };
  }

  // Anthropic format
  if (raw['type'] !== 'tool_use') {
    throw new Error('invalid tool call: type must be "tool_use"');
  }
  if (typeof raw['id'] !== 'string' || raw['id'] === '') {
    throw new Error('invalid tool call: missing id');
  }
  if (typeof raw['name'] !== 'string' || raw['name'] === '') {
    throw new Error('invalid tool call: missing name');
  }

  const input = raw['input'];
  // Anthropic sends args as a pre-parsed object; null signals a malformed response
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('invalid tool call: input must be a non-null object');
  }

  return {
    toolCallId: raw['id'] as string,
    toolName: raw['name'] as string,
    args: input as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Tool result: IronWorks → provider (message to append after tool execution)
// ---------------------------------------------------------------------------

/**
 * Convert a ToolResult into the message format the provider expects when we
 * return tool output.
 *
 * OpenAI: a standalone message object with `role: "tool"` appended to the
 * messages array.  No error flag — errors are conveyed via content text.
 *
 * Anthropic: a content block of type `tool_result` that lives inside a user
 * message's content array.  Supports an explicit `is_error` boolean so the
 * model can distinguish tool errors from normal output without parsing content.
 */
export function toProviderToolResult(
  result: ToolResult,
  format: ProviderToolFormat,
): Record<string, unknown> {
  if (format === 'openai') {
    // OpenAI has no dedicated error flag; the error text travels in content
    return {
      role: 'tool',
      tool_call_id: result.toolCallId,
      content: result.content,
    };
  }

  // Anthropic: include is_error only when true to keep the object clean
  const block: Record<string, unknown> = {
    type: 'tool_result',
    tool_use_id: result.toolCallId,
    content: result.content,
  };
  if (result.isError) {
    block['is_error'] = true;
  }
  return block;
}

// ---------------------------------------------------------------------------
// Validation: JSON schema check of resolved args before execution
// ---------------------------------------------------------------------------

// Single shared Ajv instance — per Ajv's own README, re-using one instance is
// the canonical pattern; constructing a new one per compilation is wasteful.
// allErrors: true collects all validation errors so agents can correct multiple
// fields in one retry rather than iterating.
// strict: false suppresses warnings on schemas that use non-standard keywords
// (common in OpenAPI-derived tool definitions).
const ajvInstance = new Ajv({ allErrors: true, strict: false });

const MAX_VALIDATOR_CACHE_SIZE = 256;

/**
 * Compiled validators are cached by schema fingerprint (JSON-stringified key)
 * with LRU eviction at 256 entries. Agents reuse the same tool definition for
 * every invocation — paying the Ajv compile cost once per schema instead of
 * once per call. The cap prevents unbounded heap growth when many distinct
 * schemas are encountered (e.g. 1000 schemas * ~40 KB each = ~40 MB).
 */
const ajvValidatorCache = new Map<string, ValidateFunction>();

/** Retrieve or compile a validator for the given schema, maintaining LRU order. */
function getValidator(schema: Record<string, unknown>): ValidateFunction {
  const key = JSON.stringify(schema);
  let validator = ajvValidatorCache.get(key);
  if (validator) {
    // Move to end (LRU). Delete + re-insert is the idiomatic way with Map.
    ajvValidatorCache.delete(key);
    ajvValidatorCache.set(key, validator);
    return validator;
  }
  validator = ajvInstance.compile(schema);
  if (ajvValidatorCache.size >= MAX_VALIDATOR_CACHE_SIZE) {
    // Evict oldest (first in insertion order).
    const firstKey = ajvValidatorCache.keys().next().value;
    if (firstKey !== undefined) ajvValidatorCache.delete(firstKey);
  }
  ajvValidatorCache.set(key, validator);
  return validator;
}

/**
 * Validate `args` against the tool's JSON Schema.
 *
 * Returns `{ valid: true, errors: [] }` on success, or
 * `{ valid: false, errors: string[] }` with human-readable messages on failure.
 *
 * Used by adapters to catch schema violations before the tool function runs,
 * which surfaces clearer errors than letting the tool itself crash.
 */
export function validateToolArgs(
  args: unknown,
  schema: Record<string, unknown>,
): { valid: boolean; errors: string[] } {
  const validator = getValidator(schema);
  const valid = validator(args) as boolean;
  if (valid) return { valid: true, errors: [] };

  const errors = (validator.errors ?? []).map(e =>
    `${e.instancePath} ${e.message}`.trim(),
  );
  return { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Barrel export (namespace style, consistent with other http/* modules)
// ---------------------------------------------------------------------------

export const toolNormalize = {
  toProviderToolDefinitions,
  fromProviderToolCall,
  toProviderToolResult,
  validateToolArgs,
};

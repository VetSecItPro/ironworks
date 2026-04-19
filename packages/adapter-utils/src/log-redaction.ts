import type { TranscriptEntry } from "./types.js";
import {
  redactSecrets as redactStructured,
  redactHeaders,
} from "./http/redaction.js";

export const REDACTED_HOME_PATH_USER = "*";

export interface HomePathRedactionOptions {
  enabled?: boolean;
}

function maskHomePathUserSegment(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return REDACTED_HOME_PATH_USER;
  return `${trimmed[0]}${"*".repeat(Math.max(1, Array.from(trimmed).length - 1))}`;
}

const HOME_PATH_PATTERNS = [
  {
    regex: /\/Users\/([^/\\\s]+)/g,
    replace: (_match: string, user: string) => `/Users/${maskHomePathUserSegment(user)}`,
  },
  {
    regex: /\/home\/([^/\\\s]+)/g,
    replace: (_match: string, user: string) => `/home/${maskHomePathUserSegment(user)}`,
  },
  {
    regex: /([A-Za-z]:\\Users\\)([^\\/\s]+)/g,
    replace: (_match: string, prefix: string, user: string) => `${prefix}${maskHomePathUserSegment(user)}`,
  },
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function redactHomePathUserSegments(text: string, opts?: HomePathRedactionOptions): string {
  if (opts?.enabled === false) return text;
  let result = text;
  for (const pattern of HOME_PATH_PATTERNS) {
    result = result.replace(pattern.regex, pattern.replace);
  }
  return result;
}

export function redactHomePathUserSegmentsInValue<T>(value: T, opts?: HomePathRedactionOptions): T {
  if (typeof value === "string") {
    return redactHomePathUserSegments(value, opts) as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactHomePathUserSegmentsInValue(entry, opts)) as T;
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    redacted[key] = redactHomePathUserSegmentsInValue(entry, opts);
  }
  return redacted as T;
}

/**
 * Universal redactor that picks the right strategy by input type.
 *
 * - string → existing regex-based CLI path redaction (unchanged)
 * - object (plain or array) → schema-aware structured redaction via redactStructured
 * - null / undefined / non-string primitives → returned as-is
 *
 * Prefer calling redactStructured or redactHeaders directly when the shape is
 * known. This function exists for mixed-type logging sites in CLI adapter code
 * that may encounter strings, objects, or primitives from the same log path.
 *
 * @param value - Any value to redact
 * @returns Redacted copy; strings are home-path-redacted, objects are secret-field-redacted
 */
export function redactAny(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  // Strings: run pattern-based secret redaction first (Bearer tokens, sk-ant-* etc),
  // then home-path redaction — both layers apply for full CLI compat
  if (typeof value === "string") {
    const patternRedacted = redactStructured(value) as string;
    return redactHomePathUserSegments(patternRedacted);
  }
  // Objects and arrays (including Error instances) use the schema-aware HTTP redactor,
  // which handles nested keys, Bearer tokens, and all KNOWN_SECRET_PATTERNS
  if (typeof value === "object") return redactStructured(value);
  // Booleans, numbers, bigint, symbol — no secrets possible
  return value;
}

// Re-exported so callers that already know their input shape can use the
// structured redactor or header redactor without importing from http/redaction directly
export { redactStructured, redactHeaders };

export function redactTranscriptEntryPaths(entry: TranscriptEntry, opts?: HomePathRedactionOptions): TranscriptEntry {
  switch (entry.kind) {
    case "assistant":
    case "thinking":
    case "user":
    case "stderr":
    case "system":
    case "stdout":
      return { ...entry, text: redactHomePathUserSegments(entry.text, opts) };
    case "tool_call":
      return {
        ...entry,
        name: redactHomePathUserSegments(entry.name, opts),
        input: redactHomePathUserSegmentsInValue(entry.input, opts),
      };
    case "tool_result":
      return { ...entry, content: redactHomePathUserSegments(entry.content, opts) };
    case "init":
      return {
        ...entry,
        model: redactHomePathUserSegments(entry.model, opts),
        sessionId: redactHomePathUserSegments(entry.sessionId, opts),
      };
    case "result":
      return {
        ...entry,
        text: redactHomePathUserSegments(entry.text, opts),
        subtype: redactHomePathUserSegments(entry.subtype, opts),
        errors: entry.errors.map((error) => redactHomePathUserSegments(error, opts)),
      };
    default:
      return entry;
  }
}

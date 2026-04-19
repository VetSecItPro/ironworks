/**
 * Schema-aware JSON redaction for security-sensitive HTTP payloads.
 *
 * Mitigates R20: regex-on-stderr redaction misses structured JSON payloads where keys
 * appear as nested object fields, headers, or credential patterns inside string leaves.
 *
 * Design:
 * - Path-based: any field whose name (normalized) matches KNOWN_SECRET_PATHS → [REDACTED]
 * - Pattern-based: string leaves are scanned for KNOWN_SECRET_PATTERNS → matched span replaced
 * - Fail-safe: never throws, over-redacts non-plain objects, detects circular refs
 * - Immutable: never mutates inputs
 */

// ─── Exported constants ─────────────────────────────────────────────────────

/**
 * Field-name patterns that unconditionally redact the entire value.
 * Matched case-insensitively after normalizing `-` and `_` to empty string.
 */
export const KNOWN_SECRET_PATHS = [
  'api_key',
  'apiKey',
  'api-key',
  'access_token',
  'accessToken',
  'access-token',
  'refresh_token',
  'refreshToken',
  'refresh-token',
  'token',
  'password',
  'secret',
  'private_key',
  'privateKey',
  'private-key',
  'authorization',
  'cookie',
  'set_cookie',
  'setCookie',
  'set-cookie',
  // HTTP header variants with x- prefix (normalized: x stripped too)
  'x-api-key',
  'x_api_key',
  'xapikey',
] as const;

export type KnownSecretPath = (typeof KNOWN_SECRET_PATHS)[number];

/**
 * Regex patterns (with /g flag) that redact matching spans inside string leaves.
 * Order matters: more specific patterns appear first so they consume their span
 * before the generic fallback can double-match.
 */
export const KNOWN_SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9\-_.]+/g,         // Bearer tokens (captures the whole Bearer <token>)
  /sk-ant-[A-Za-z0-9\-_.]{10,}/g,       // Anthropic API keys
  /sk-proj-[A-Za-z0-9\-_.]{10,}/g,      // OpenAI project-scoped keys
  /sk-or-v1-[A-Za-z0-9\-_.]{10,}/g,     // OpenRouter keys
  /sk-poe-[A-Za-z0-9\-_.]{10,}/g,       // Poe keys
  /sk-[A-Za-z0-9\-_.]{20,}/g,           // Generic OpenAI / catch-all sk-* (placed AFTER specific)
  /cfut_[A-Za-z0-9]{40,}/g,             // Cloudflare API tokens
];

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Normalize a key for secret-path matching: lowercase + strip `-` and `_`. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, '');
}

/** Pre-computed normalized forms of KNOWN_SECRET_PATHS for O(1) lookup. */
const NORMALIZED_SECRET_PATH_SET: ReadonlySet<string> = new Set(
  KNOWN_SECRET_PATHS.map(normalizeKey),
);

function isSecretKey(key: string): boolean {
  return NORMALIZED_SECRET_PATH_SET.has(normalizeKey(key));
}

/**
 * Apply all KNOWN_SECRET_PATTERNS to a string, replacing matched spans.
 * Bearer tokens produce `Bearer [REDACTED]` (the entire match including the prefix
 * is replaced by a form where only the credential part becomes [REDACTED]).
 *
 * Each regex is cloned per call to avoid shared lastIndex state across concurrent
 * invocations (e.g. generator-based stream processing or future async-yield scenarios).
 */
function redactString(value: string): string {
  let result = value;
  for (const pattern of KNOWN_SECRET_PATTERNS) {
    // Clone to avoid shared lastIndex state across concurrent invocations
    const localRegex = new RegExp(pattern.source, pattern.flags);
    result = result.replace(localRegex, (match) => {
      // Preserve "Bearer " prefix so output reads "Bearer [REDACTED]"
      if (/^Bearer\s/i.test(match)) return 'Bearer [REDACTED]';
      return '[REDACTED]';
    });
  }
  return result;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Redact sensitive HTTP request/response headers.
 * Returns a new object; never mutates the input.
 *
 * @param headers - Plain string-keyed / string-valued headers object
 * @returns New headers object with secret values replaced by '[REDACTED]'
 */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (isSecretKey(key)) {
      // Key matched a known secret path → redact entire value
      result[key] = '[REDACTED]';
    } else {
      // Key didn't match → still scan the value for secret patterns (e.g. Bearer tokens,
      // sk-ant-* keys accidentally leaked into non-sensitive headers like X-Debug-Info)
      result[key] = redactString(value);
    }
  }
  return result;
}

/**
 * Deeply redact secrets from any JSON-compatible value.
 *
 * Rules (in priority order):
 * 1. null / undefined → returned as-is
 * 2. Non-string primitives → returned as-is
 * 3. Strings → pattern-scanned; matching spans replaced
 * 4. Arrays → each element recursed; new array returned
 * 5. Plain objects → each key checked; secret keys → '[REDACTED]', others recursed
 * 6. Error instances → serialised to `{ name, message, stack }` with strings pattern-scanned
 * 7. Other non-plain objects (Map, Set, Date, class instances) → '[REDACTED_COMPLEX]'
 * 8. Circular references → '[CIRCULAR]'
 * 9. Any unexpected error → '[REDACTED_UNKNOWN]'
 *
 * @param value - Any value to redact
 * @returns Redacted deep copy (input is never mutated)
 */
export function redactSecrets<T>(value: T): T {
  return _redact(value, new WeakSet()) as T;
}

function _redact(value: unknown, seen: WeakSet<object>): unknown {
  try {
    // 1. null / undefined
    if (value === null) return null;
    if (value === undefined) return undefined;

    const type = typeof value;

    // 2. Non-string primitives
    if (type === 'number' || type === 'boolean' || type === 'bigint' || type === 'symbol') {
      return value;
    }

    // 3. Strings
    if (type === 'string') {
      return redactString(value as string);
    }

    // Everything else is object-like
    if (type !== 'object' && type !== 'function') {
      return value;
    }

    const obj = value as object;

    // Circular reference guard
    if (seen.has(obj)) {
      return '[CIRCULAR]';
    }
    seen.add(obj);

    // 4. Arrays
    if (Array.isArray(obj)) {
      const result = (obj as unknown[]).map((item) => _redact(item, seen));
      seen.delete(obj);
      return result;
    }

    // 6. Error instances
    if (obj instanceof Error) {
      const result = {
        name: obj.name,
        message: redactString(obj.message),
        stack: obj.stack ? redactString(obj.stack) : undefined,
      };
      seen.delete(obj);
      return result;
    }

    // 5. Plain objects only — constructor === Object or null-prototype
    if (obj.constructor === Object || Object.getPrototypeOf(obj) === null) {
      const record = obj as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(record)) {
        result[key] = isSecretKey(key) ? '[REDACTED]' : _redact(val, seen);
      }
      seen.delete(obj);
      return result;
    }

    // 7. Non-plain objects (Map, Set, Date, class instances) — fail-safe over-redact
    seen.delete(obj);
    return '[REDACTED_COMPLEX]';
  } catch {
    // 9. Unexpected error — fail-safe
    return '[REDACTED_UNKNOWN]';
  }
}

// ─── Namespace export (barrel compat) ────────────────────────────────────────

export const redaction = {
  redactSecrets,
  redactHeaders,
  KNOWN_SECRET_PATHS,
  KNOWN_SECRET_PATTERNS,
};

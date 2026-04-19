import { randomUUID } from 'node:crypto';

/**
 * UUID v4 regex for cheap validity checks. Intentionally lax — we accept any
 * well-formed v4 UUID that upstream gave us, we don't enforce our own version.
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Generate a fresh UUID v4 suitable for x-request-id propagation. */
export function createRequestId(): string {
  return randomUUID();
}

/** Context shape for cross-call propagation. */
export interface RequestIdContext {
  requestId?: string;
}

/**
 * Return an existing request ID from context if present and well-formed,
 * otherwise create a new one. Guards against upstream sending malformed
 * values that would poison downstream correlation.
 */
export function getOrCreateRequestId(context?: RequestIdContext): string {
  if (context?.requestId && UUID_V4_REGEX.test(context.requestId)) {
    return context.requestId;
  }
  return createRequestId();
}

/**
 * Extract a request ID from an HTTP response headers bag. Header names are
 * compared case-insensitively. Checks x-request-id first, then request-id.
 * Undici and some HTTP libraries return `string | string[]` for headers
 * (HTTP allows repeated headers of the same name); we take the first value
 * when an array is encountered. Returns undefined if neither header is present.
 */
export function extractRequestId(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    const value = Array.isArray(v) ? v[0] : v;
    if (value !== undefined) normalized[k.toLowerCase()] = value;
  }
  return normalized['x-request-id'] ?? normalized['request-id'];
}

// Barrel compat
export const requestId = { createRequestId, getOrCreateRequestId, extractRequestId };

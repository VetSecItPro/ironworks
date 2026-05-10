import type { CorsOptions } from "cors";

/**
 * Parse a comma-separated list of allowed origins from an env var value.
 *
 * - Splits on commas, trims each entry
 * - Drops empty/whitespace-only entries
 * - Deduplicates while preserving first-seen order
 *
 * NOTE: wildcards (`*`) are NOT supported. A literal `*` in the list will
 * be treated as a literal origin string and never match (browsers never
 * send `Origin: *`), effectively producing a deny-all. To allow any origin,
 * leave IRONWORKS_ALLOWED_ORIGINS unset (development = allow-all,
 * production = reflective + startup warning).
 *
 * Pure function — testable without mocking process.env.
 */
export function parseAllowedOrigins(envValue: string | undefined): string[] {
  if (!envValue) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of envValue.split(",")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

const ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Ironworks-Signature",
  "X-Mailgun-Signature-256",
  "X-Twilio-Email-Event-Webhook-Signature",
  "X-Twilio-Email-Event-Webhook-Timestamp",
  "X-Requested-With",
];

export interface BuildCorsOptionsResult {
  options: CorsOptions;
  /** Non-null when the caller should emit a startup warning. */
  warning: string | null;
}

/**
 * Build CorsOptions from env config.
 *
 * Behavior matrix:
 *   ALLOWED_ORIGINS set       → strict allowlist (echo allowed origins, reject others)
 *   unset + NODE_ENV=development → allow all (origin: true) — preserves dev workflows
 *   unset + NODE_ENV=production  → reflective allow-all + WARNING (don't silently break deploys)
 *
 * The reflective production fallback is intentional: SEC tightening should not
 * break existing production deploys that haven't yet set the env var. The warning
 * makes the unsafe state loud at startup so operators are nudged to configure it.
 */
export function buildCorsOptions(env: { ALLOWED_ORIGINS?: string; NODE_ENV?: string }): BuildCorsOptionsResult {
  const allowlist = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const isProduction = env.NODE_ENV === "production";

  const baseOptions: CorsOptions = {
    credentials: true,
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    optionsSuccessStatus: 204,
  };

  if (allowlist.length > 0) {
    return {
      options: {
        ...baseOptions,
        origin: (origin, callback) => {
          // No origin (curl, server-to-server, same-origin) → pass through
          if (!origin) return callback(null, true);
          if (allowlist.includes(origin)) return callback(null, true);
          // Not in allowlist → cors lib omits the ACAO header
          return callback(null, false);
        },
      },
      warning: null,
    };
  }

  if (isProduction) {
    // SEC-CORS-HIGH-004 fix (2026-05-09): previously this branch fell back to
    // reflective allow-all with credentials enabled, with only a startup
    // warning. That meant any attacker-controlled site could read
    // authenticated responses + drive mutations from logged-in users'
    // browsers. Now we fail-closed: an empty/missing IRONWORKS_ALLOWED_ORIGINS
    // in prod refuses every cross-origin request.
    return {
      options: {
        ...baseOptions,
        origin: (origin, callback) => {
          // No origin = same-origin, curl, server-to-server. Always allowed.
          if (!origin) return callback(null, true);
          // Cross-origin in prod with no allowlist configured = refused.
          // The cors middleware omits ACAO; the browser blocks the response.
          return callback(null, false);
        },
      },
      warning:
        "[cors] IRONWORKS_ALLOWED_ORIGINS is unset in production. Refusing all cross-origin requests. " +
        "Set IRONWORKS_ALLOWED_ORIGINS to a comma-separated list of trusted origins to enable cross-origin browser access.",
    };
  }

  // Dev fallback: allow all
  return {
    options: {
      ...baseOptions,
      origin: true,
    },
    warning: null,
  };
}

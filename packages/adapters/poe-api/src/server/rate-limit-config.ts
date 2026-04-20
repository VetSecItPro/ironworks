/**
 * Rate-limiter configuration for the poe_api adapter.
 *
 * Reads POE_API_RATE_LIMIT_PER_MIN at module init. If unset or invalid, defaults to
 * 60 req/min (safe ceiling for most Poe API plans). The limiter is token-bucket based,
 * so bursts are allowed up to the bucket capacity but sustained throughput is bounded.
 *
 * Why per-adapter env var rather than a global: each provider has independent rate limits
 * and operators may need to throttle one provider without affecting others.
 */

import type { RateLimiter } from "@ironworksai/adapter-utils/http/rate-limiter";
import { createRateLimiter } from "@ironworksai/adapter-utils/http/rate-limiter";

const ENV_KEY = "POE_API_RATE_LIMIT_PER_MIN";
const DEFAULT_RATE_LIMIT_PER_MIN = 60;

/**
 * Read and validate the rate-limit env var.
 * Returns the parsed integer, or DEFAULT_RATE_LIMIT_PER_MIN for missing/invalid values.
 */
export function resolveRateLimitPerMin(): number {
  const raw = process.env[ENV_KEY];
  if (!raw) return DEFAULT_RATE_LIMIT_PER_MIN;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RATE_LIMIT_PER_MIN;
  return parsed;
}

/**
 * Create a rate limiter configured at the given requests-per-minute ceiling.
 * Exported for testing; production code uses the module-level `adapterRateLimiter`.
 */
export function createAdapterRateLimiter(ratePerMin: number): RateLimiter {
  // Convert req/min → tokens/sec for the token-bucket implementation.
  // maxCapacity = ratePerMin allows a full-minute burst on a cold start.
  return createRateLimiter({
    tokensPerSecond: ratePerMin / 60,
    maxCapacity: ratePerMin,
  });
}

/**
 * Module-level rate limiter shared across all execute() calls.
 * Instantiated once at import time so the bucket persists across requests.
 */
export const adapterRateLimiter: RateLimiter = createAdapterRateLimiter(resolveRateLimitPerMin());

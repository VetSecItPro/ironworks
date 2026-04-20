/**
 * Rate-limiter configuration for the openai_api adapter.
 *
 * Reads OPENAI_API_RATE_LIMIT_PER_MIN at module init. If unset or invalid, defaults to
 * 60 req/min. The limiter is token-bucket based — bursts are allowed up to the bucket
 * capacity but sustained throughput is bounded.
 */

import type { RateLimiter } from "@ironworksai/adapter-utils/http/rate-limiter";
import { createRateLimiter } from "@ironworksai/adapter-utils/http/rate-limiter";

const ENV_KEY = "OPENAI_API_RATE_LIMIT_PER_MIN";
const DEFAULT_RATE_LIMIT_PER_MIN = 60;

export function resolveRateLimitPerMin(): number {
  const raw = process.env[ENV_KEY];
  if (!raw) return DEFAULT_RATE_LIMIT_PER_MIN;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RATE_LIMIT_PER_MIN;
  return parsed;
}

export function createAdapterRateLimiter(ratePerMin: number): RateLimiter {
  return createRateLimiter({
    tokensPerSecond: ratePerMin / 60,
    maxCapacity: ratePerMin,
  });
}

export const adapterRateLimiter: RateLimiter = createAdapterRateLimiter(resolveRateLimitPerMin());

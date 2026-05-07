// SEC-ADV-013: simple in-memory sliding window rate limiter for /api/*.
// Extracted from app.ts so it is unit-testable in isolation. The behavior
// must remain identical to the inline version that previously lived in
// createApp() — the limit is generous because in Docker deployments,
// agents + users share the same source IP.

import type { RequestHandler } from "express";

export interface RateLimiterOptions {
  /** Max requests per window per IP. Default 600. */
  limit?: number;
  /** Window length in ms. Default 60_000 (1 minute). */
  windowMs?: number;
  /** Custom clock injection point — primarily for tests. */
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export const RATE_LIMIT_DEFAULT = 600;
export const RATE_WINDOW_MS_DEFAULT = 60_000;

export function rateLimitMiddleware(options: RateLimiterOptions = {}): RequestHandler {
  const limit = options.limit ?? RATE_LIMIT_DEFAULT;
  const windowMs = options.windowMs ?? RATE_WINDOW_MS_DEFAULT;
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();

  return (req, res, next) => {
    // Only rate-limit /api/* and skip preflight.
    if (!req.path.startsWith("/api") || req.method === "OPTIONS") {
      next();
      return;
    }
    // Exempt internal health/heartbeat from rate limits.
    if (req.path === "/api/health" || req.path.includes("/heartbeat")) {
      next();
      return;
    }

    const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    const t = now();
    let bucket = buckets.get(ip);
    if (!bucket || t > bucket.resetAt) {
      bucket = { count: 0, resetAt: t + windowMs };
      buckets.set(ip, bucket);
    }
    bucket.count++;
    if (bucket.count > limit) {
      res.status(429).json({ error: "Too many requests. Try again later." });
      return;
    }

    // Prune stale buckets every ~1000 requests, same as the original inline impl.
    if (bucket.count === 1 && buckets.size > 1000) {
      for (const [k, v] of buckets) {
        if (t > v.resetAt) buckets.delete(k);
      }
    }
    next();
  };
}

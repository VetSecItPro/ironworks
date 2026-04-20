/**
 * G.7 — Rate-limiter env config test for poe_api adapter.
 *
 * Why: the rate limiter is the only guard preventing an IronWorks agent from
 * accidentally hammering a provider's API. If env config is silently ignored,
 * operators have no way to throttle an agent without deploying code changes.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAdapterRateLimiter, resolveRateLimitPerMin } from "../rate-limit-config.js";

describe("resolveRateLimitPerMin (poe_api)", () => {
  const ENV_KEY = "POE_API_RATE_LIMIT_PER_MIN";

  beforeEach(() => {
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it("returns 60 when env var is not set (safe default)", () => {
    expect(resolveRateLimitPerMin()).toBe(60);
  });

  it("returns the parsed integer when env var is set to a valid number", () => {
    process.env[ENV_KEY] = "30";
    expect(resolveRateLimitPerMin()).toBe(30);
  });

  it("returns 60 when env var is set to a non-numeric value", () => {
    process.env[ENV_KEY] = "unlimited";
    expect(resolveRateLimitPerMin()).toBe(60);
  });

  it("returns 60 when env var is set to zero (invalid — would freeze all requests)", () => {
    process.env[ENV_KEY] = "0";
    expect(resolveRateLimitPerMin()).toBe(60);
  });

  it("returns 60 when env var is set to a negative number", () => {
    process.env[ENV_KEY] = "-10";
    expect(resolveRateLimitPerMin()).toBe(60);
  });
});

describe("createAdapterRateLimiter (poe_api)", () => {
  it("returns a rate limiter with acquire / available / reset", () => {
    const rl = createAdapterRateLimiter(60);
    expect(typeof rl.acquire).toBe("function");
    expect(typeof rl.available).toBe("function");
    expect(typeof rl.reset).toBe("function");
  });

  it("queues the second request when limit is 1 req/min", async () => {
    // At 1 req/min the bucket holds 1 token. After acquiring it, the second acquire
    // must wait (queue depth > 0). We cancel via AbortController to avoid blocking.
    const rl = createAdapterRateLimiter(1);
    const KEY = "test-key";

    // First acquire drains the bucket
    await rl.acquire(KEY);
    expect(rl.available(KEY)).toBeLessThan(1);

    // Second acquire would block — abort it to verify it queued
    const ac = new AbortController();
    const p = rl.acquire(KEY, 1, ac.signal);
    ac.abort();
    await expect(p).rejects.toThrow();
  });
});

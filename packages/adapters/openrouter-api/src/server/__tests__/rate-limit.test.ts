/**
 * G.7 — Rate-limiter env config test for openrouter_api adapter.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAdapterRateLimiter, resolveRateLimitPerMin } from "../rate-limit-config.js";

describe("resolveRateLimitPerMin (openrouter_api)", () => {
  const ENV_KEY = "OPENROUTER_API_RATE_LIMIT_PER_MIN";

  beforeEach(() => {
    delete process.env[ENV_KEY];
  });
  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it("returns 60 when env var is not set", () => {
    expect(resolveRateLimitPerMin()).toBe(60);
  });

  it("returns the parsed integer when env var is a valid number", () => {
    process.env[ENV_KEY] = "200";
    expect(resolveRateLimitPerMin()).toBe(200);
  });

  it("returns 60 when env var is non-numeric", () => {
    process.env[ENV_KEY] = "no-limit";
    expect(resolveRateLimitPerMin()).toBe(60);
  });

  it("returns 60 when env var is zero or negative", () => {
    process.env[ENV_KEY] = "0";
    expect(resolveRateLimitPerMin()).toBe(60);
    process.env[ENV_KEY] = "-100";
    expect(resolveRateLimitPerMin()).toBe(60);
  });
});

describe("createAdapterRateLimiter (openrouter_api)", () => {
  it("returns a rate limiter with acquire / available / reset", () => {
    const rl = createAdapterRateLimiter(60);
    expect(typeof rl.acquire).toBe("function");
    expect(typeof rl.available).toBe("function");
    expect(typeof rl.reset).toBe("function");
  });

  it("queues the second request when limit is 1 req/min", async () => {
    const rl = createAdapterRateLimiter(1);
    const KEY = "openrouter-test";
    await rl.acquire(KEY);
    const ac = new AbortController();
    const p = rl.acquire(KEY, 1, ac.signal);
    ac.abort();
    await expect(p).rejects.toThrow();
  });
});

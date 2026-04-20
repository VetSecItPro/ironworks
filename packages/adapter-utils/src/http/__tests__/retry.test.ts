import { describe, expect, it, vi } from "vitest";
import {
  HttpAdapterAuthError,
  HttpAdapterConfigError,
  HttpAdapterNetworkError,
  HttpAdapterRateLimitError,
  HttpAdapterServerError,
  HttpAdapterStreamBreak,
  HttpAdapterTimeoutError,
} from "../errors.js";
import { DEFAULT_RETRY_POLICY, type RetryContext, runWithRetry } from "../retry.js";

describe("runWithRetry — happy path", () => {
  it("returns the function result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await runWithRetry(fn, { policy: DEFAULT_RETRY_POLICY });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls fn with the RetryContext including attempt number (0-indexed)", async () => {
    const fn = vi.fn(async (ctx: RetryContext) => `attempt-${ctx.attempt}`);
    const result = await runWithRetry(fn, { policy: DEFAULT_RETRY_POLICY });
    expect(result).toBe("attempt-0");
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ attempt: 0 }));
  });
});

describe("runWithRetry — retryable errors", () => {
  it("retries HttpAdapterServerError up to maxRetries (policy.maxRetries=3 → 4 total attempts)", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 4) throw new HttpAdapterServerError("500", { status: 500 });
      return "ok";
    });
    const result = await runWithRetry(fn, {
      policy: { ...DEFAULT_RETRY_POLICY, maxRetries: 3, baseDelayMs: 1 },
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("retries HttpAdapterRateLimitError and respects retryAfterMs", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new HttpAdapterRateLimitError("429", { retryAfterMs: 50 });
      return "ok";
    });
    const start = Date.now();
    const result = await runWithRetry(fn, {
      policy: { ...DEFAULT_RETRY_POLICY, baseDelayMs: 1 },
    });
    const elapsed = Date.now() - start;
    expect(result).toBe("ok");
    expect(elapsed).toBeGreaterThanOrEqual(40); // retryAfterMs honored (allow timer skew)
  });

  it("retries HttpAdapterTimeoutError once by default", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new HttpAdapterTimeoutError("timeout");
      return "ok";
    });
    const result = await runWithRetry(fn, {
      policy: { ...DEFAULT_RETRY_POLICY, baseDelayMs: 1 },
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxRetries, rethrows the final error", async () => {
    const fn = vi.fn(async () => {
      throw new HttpAdapterServerError("persistent", { status: 503 });
    });
    await expect(
      runWithRetry(fn, {
        policy: { ...DEFAULT_RETRY_POLICY, maxRetries: 2, baseDelayMs: 1 },
      }),
    ).rejects.toBeInstanceOf(HttpAdapterServerError);
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("exponential backoff with jitter — delays grow roughly 2x", async () => {
    const delays: number[] = [];
    const fn = vi.fn(async (_ctx: RetryContext) => {
      delays.push(Date.now());
      throw new HttpAdapterServerError("keep failing", { status: 500 });
    });
    await expect(
      runWithRetry(fn, {
        policy: { ...DEFAULT_RETRY_POLICY, maxRetries: 3, baseDelayMs: 50, jitterRatio: 0 },
      }),
    ).rejects.toBeDefined();
    // delays: [t0, t0+50, t0+50+100, t0+50+100+200] → gaps: 50, 100, 200 (approximate)
    const gaps = [delays[1] - delays[0], delays[2] - delays[1], delays[3] - delays[2]];
    expect(gaps[0]).toBeGreaterThanOrEqual(40);
    expect(gaps[1]).toBeGreaterThanOrEqual(90);
    expect(gaps[2]).toBeGreaterThanOrEqual(180);
  });
});

describe("runWithRetry — non-retryable errors", () => {
  it("does NOT retry HttpAdapterAuthError", async () => {
    const fn = vi.fn(async () => {
      throw new HttpAdapterAuthError("bad key");
    });
    await expect(runWithRetry(fn, { policy: DEFAULT_RETRY_POLICY })).rejects.toBeInstanceOf(HttpAdapterAuthError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry HttpAdapterConfigError", async () => {
    const fn = vi.fn(async () => {
      throw new HttpAdapterConfigError("missing key");
    });
    await expect(runWithRetry(fn, { policy: DEFAULT_RETRY_POLICY })).rejects.toBeInstanceOf(HttpAdapterConfigError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry HttpAdapterNetworkError by default (non-retryable)", async () => {
    const fn = vi.fn(async () => {
      throw new HttpAdapterNetworkError("ENOTFOUND");
    });
    await expect(runWithRetry(fn, { policy: DEFAULT_RETRY_POLICY })).rejects.toBeInstanceOf(HttpAdapterNetworkError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries HttpAdapterNetworkError when marked retryable (transient)", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new HttpAdapterNetworkError("ECONNRESET", { retryable: true });
      return "ok";
    });
    const result = await runWithRetry(fn, {
      policy: { ...DEFAULT_RETRY_POLICY, baseDelayMs: 1 },
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry generic Error (not an HttpAdapterError)", async () => {
    const fn = vi.fn(async () => {
      throw new Error("mystery");
    });
    await expect(runWithRetry(fn, { policy: DEFAULT_RETRY_POLICY })).rejects.toBeInstanceOf(Error);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("R16 — no retry after tool-call emitted", () => {
  it("does NOT retry HttpAdapterStreamBreak when toolCallEmitted=true", async () => {
    const fn = vi.fn(async () => {
      throw new HttpAdapterStreamBreak("disconnect after tool use", {
        toolCallEmitted: true,
      });
    });
    await expect(runWithRetry(fn, { policy: DEFAULT_RETRY_POLICY })).rejects.toBeInstanceOf(HttpAdapterStreamBreak);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry HttpAdapterStreamBreak when toolCallEmitted=false either (stream_break is inherently non-retryable)", async () => {
    const fn = vi.fn(async () => {
      throw new HttpAdapterStreamBreak("disconnect before tool use", {
        toolCallEmitted: false,
      });
    });
    await expect(runWithRetry(fn, { policy: DEFAULT_RETRY_POLICY })).rejects.toBeInstanceOf(HttpAdapterStreamBreak);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry retryable errors if toolCallFlag.emitted was set during the attempt", async () => {
    // Shared flag mutated by the fn (simulating SSE parser marking toolCallEmitted mid-stream)
    const toolCallFlag = { emitted: false };
    let attempts = 0;
    const fn = vi.fn(async (ctx: RetryContext) => {
      attempts++;
      if (attempts === 1) {
        // Simulate: upstream emitted a tool_call, THEN connection dropped with a 500
        ctx.toolCallFlag.emitted = true;
        throw new HttpAdapterServerError("disconnect after tool_call", { status: 500 });
      }
      return "ok";
    });
    await expect(runWithRetry(fn, { policy: DEFAULT_RETRY_POLICY, toolCallFlag })).rejects.toBeInstanceOf(
      HttpAdapterServerError,
    );
    expect(fn).toHaveBeenCalledTimes(1);
    expect(toolCallFlag.emitted).toBe(true);
  });

  it("retryable errors DO retry when toolCallFlag.emitted is false", async () => {
    const toolCallFlag = { emitted: false };
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new HttpAdapterServerError("first attempt", { status: 503 });
      return "ok";
    });
    const result = await runWithRetry(fn, {
      policy: { ...DEFAULT_RETRY_POLICY, baseDelayMs: 1 },
      toolCallFlag,
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(toolCallFlag.emitted).toBe(false);
  });
});

describe("runWithRetry — observability", () => {
  it("fires onRetry callback before each retry", async () => {
    const onRetry = vi.fn();
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) throw new HttpAdapterServerError("500", { status: 500 });
      return "ok";
    });
    await runWithRetry(fn, {
      policy: { ...DEFAULT_RETRY_POLICY, maxRetries: 3, baseDelayMs: 1 },
      onRetry,
    });
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: expect.any(Number),
        error: expect.any(HttpAdapterServerError),
        delayMs: expect.any(Number),
      }),
    );
  });

  it("respects totalTimeoutMs — gives up if cumulative delay + attempts exceed cap", async () => {
    const fn = vi.fn(async () => {
      throw new HttpAdapterServerError("slow", { status: 503 });
    });
    const start = Date.now();
    await expect(
      runWithRetry(fn, {
        policy: {
          ...DEFAULT_RETRY_POLICY,
          maxRetries: 10,
          baseDelayMs: 100,
          totalTimeoutMs: 250,
        },
      }),
    ).rejects.toBeDefined();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(400); // gave up well before 10 retries * 100ms could finish
  });

  it("supports abortSignal — aborts mid-retry", async () => {
    const ac = new AbortController();
    const fn = vi.fn(async () => {
      throw new HttpAdapterServerError("keep retrying", { status: 500 });
    });
    setTimeout(() => ac.abort(), 30);
    await expect(
      runWithRetry(fn, {
        policy: { ...DEFAULT_RETRY_POLICY, maxRetries: 5, baseDelayMs: 50 },
        abortSignal: ac.signal,
      }),
    ).rejects.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Listener-leak regression (Finding 1)
// ---------------------------------------------------------------------------

/**
 * Wraps an AbortSignal to count unmatched addEventListener / removeEventListener
 * calls. The delta must be zero after all sleeps complete on normal expiry.
 */
function makeTrackedAbortController() {
  const ac = new AbortController();
  let adds = 0;
  let removes = 0;
  const origAdd = ac.signal.addEventListener.bind(ac.signal);
  const origRemove = ac.signal.removeEventListener.bind(ac.signal);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ac.signal as any).addEventListener = (...args: Parameters<typeof origAdd>) => {
    adds++;
    return origAdd(...args);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ac.signal as any).removeEventListener = (...args: Parameters<typeof origRemove>) => {
    removes++;
    return origRemove(...args);
  };
  return { ac, getDelta: () => adds - removes };
}

describe("sleep — abort listener cleanup", () => {
  it("does not leak abort listeners on normal timer expiry", async () => {
    const { ac, getDelta } = makeTrackedAbortController();
    for (let i = 0; i < 10; i++) {
      let attempts = 0;
      await runWithRetry(
        async () => {
          attempts++;
          // Force a retry on the first attempt so sleep() is called at least once per iteration.
          if (attempts === 1) throw new HttpAdapterServerError("transient", { status: 503 });
          return "ok";
        },
        {
          policy: { ...DEFAULT_RETRY_POLICY, baseDelayMs: 1 },
          abortSignal: ac.signal,
        },
      );
    }
    // Each sleep adds one listener and must remove it on normal expiry — delta stays zero.
    expect(getDelta()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Negative / zero retryAfterMs clamping (Finding 2)
// ---------------------------------------------------------------------------

describe("runWithRetry — retryAfterMs edge cases", () => {
  it("treats negative retryAfterMs as 0 (defensive clamp)", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new HttpAdapterRateLimitError("broken", { retryAfterMs: -500 });
      return "ok";
    });
    const start = Date.now();
    const result = await runWithRetry(fn, {
      policy: { ...DEFAULT_RETRY_POLICY, baseDelayMs: 1 },
    });
    const elapsed = Date.now() - start;
    expect(result).toBe("ok");
    // Negative value clamped to 0 means near-immediate retry, not a half-second wait.
    expect(elapsed).toBeLessThan(100);
  });

  it("treats zero retryAfterMs as immediate retry", async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new HttpAdapterRateLimitError("zero", { retryAfterMs: 0 });
      return "ok";
    });
    const result = await runWithRetry(fn, {
      policy: { ...DEFAULT_RETRY_POLICY, baseDelayMs: 1 },
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("DEFAULT_RETRY_POLICY", () => {
  it("has sensible defaults", () => {
    expect(DEFAULT_RETRY_POLICY.maxRetries).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_RETRY_POLICY.maxRetries).toBeLessThanOrEqual(5);
    expect(DEFAULT_RETRY_POLICY.baseDelayMs).toBeGreaterThan(0);
    expect(DEFAULT_RETRY_POLICY.jitterRatio).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_RETRY_POLICY.jitterRatio).toBeLessThanOrEqual(1);
  });
});

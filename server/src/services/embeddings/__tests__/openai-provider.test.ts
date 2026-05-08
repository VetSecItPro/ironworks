import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "../providers/openai.js";

/**
 * We inject a no-op `sleep` fn into the provider so we don't have to fight
 * fake timers + microtasks across retry boundaries. The retry logic still
 * runs through every attempt; we just collapse the wait to zero so tests
 * complete quickly. A separate test asserts which delays were requested.
 */

function vec(n: number, fill = 0): number[] {
  return Array.from({ length: n }, () => fill);
}

function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenAIProvider", () => {
  // The spy is recreated each test so the global beforeEach hook from
  // setupFiles can run real fetch (some service singletons trigger network
  // on first import - spying at module load breaks them).
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockReset();
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("constructor rejects empty apiKey", () => {
    expect(() => new OpenAIProvider("")).toThrow(/non-empty apiKey/);
  });

  it("derives 1536 dims for text-embedding-3-small by default", () => {
    const p = new OpenAIProvider("sk-test");
    expect(p.name).toBe("openai");
    expect(p.model).toBe("text-embedding-3-small");
    expect(p.dims).toBe(1536);
  });

  it("uses override dims when provided", () => {
    const p = new OpenAIProvider("sk-test", "custom-model", { dims: 999 });
    expect(p.dims).toBe(999);
  });

  it("embed: happy path returns the vector", async () => {
    const p = new OpenAIProvider("sk-test", "text-embedding-3-small", {
      dims: 4,
      sleep: async () => {},
    });
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, { data: [{ embedding: [0.1, 0.2, 0.3, 0.4], index: 0 }] }),
    );
    const out = await p.embed("hello");
    expect(out).toEqual([0.1, 0.2, 0.3, 0.4]);

    // Verify request shape
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init?.body as string)).toEqual({
      input: "hello",
      model: "text-embedding-3-small",
    });
  });

  it("embed: throws on dim mismatch", async () => {
    const p = new OpenAIProvider("sk-test", "text-embedding-3-small", {
      dims: 4,
      sleep: async () => {},
    });
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, { data: [{ embedding: [0.1, 0.2] }] }),
    );
    await expect(p.embed("x")).rejects.toThrow(/dim mismatch.*got 2.*expected 4/);
  });

  it("embed: 429 retries up to 3 attempts then throws", async () => {
    const sleeps: number[] = [];
    const p = new OpenAIProvider("sk-test", "text-embedding-3-small", {
      dims: 4,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    fetchSpy.mockResolvedValue(mockResponse(429, { error: "rate limit" }));
    await expect(p.embed("x")).rejects.toThrow(/429.*after 3 attempts/);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    // 429 backoff schedule: 10s, 30s (2 sleeps between 3 attempts).
    expect(sleeps).toEqual([10_000, 30_000]);
  });

  it("embed: 500 retries with exponential backoff then succeeds", async () => {
    const sleeps: number[] = [];
    const p = new OpenAIProvider("sk-test", "text-embedding-3-small", {
      dims: 4,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    fetchSpy
      .mockResolvedValueOnce(mockResponse(500, { error: "boom" }))
      .mockResolvedValueOnce(mockResponse(503, { error: "still" }))
      .mockResolvedValueOnce(
        mockResponse(200, { data: [{ embedding: vec(4, 0.5) }] }),
      );
    const out = await p.embed("x");
    expect(out).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1_000, 2_000]);
  });

  it("embed: 401 throws immediately without retry", async () => {
    const p = new OpenAIProvider("sk-test", "text-embedding-3-small", {
      dims: 4,
      sleep: async () => {},
    });
    fetchSpy.mockResolvedValueOnce(mockResponse(401, { error: "unauthorized" }));
    await expect(p.embed("x")).rejects.toThrow(/openai 401/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("embed: 400 throws immediately without retry", async () => {
    const p = new OpenAIProvider("sk-test", "text-embedding-3-small", {
      dims: 4,
      sleep: async () => {},
    });
    fetchSpy.mockResolvedValueOnce(mockResponse(400, { error: "bad request" }));
    await expect(p.embed("x")).rejects.toThrow(/openai 400/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("embed: timeout aborts and retries", async () => {
    const sleeps: number[] = [];
    const p = new OpenAIProvider("sk-test", "text-embedding-3-small", {
      dims: 4,
      timeoutMs: 5,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    // First two attempts hang past the 5ms timeout (AbortController fires);
    // third attempt resolves quickly.
    fetchSpy.mockImplementation((_url, init) => {
      const signal = (init as RequestInit).signal as AbortSignal;
      const callIndex = fetchSpy.mock.calls.length;
      if (callIndex < 3) {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }
      return Promise.resolve(
        mockResponse(200, { data: [{ embedding: vec(4, 1) }] }),
      );
    });
    const out = await p.embed("x");
    expect(out).toEqual([1, 1, 1, 1]);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1_000, 2_000]);
  });

  it("embedBatch: chunks into 256-input requests", async () => {
    const p = new OpenAIProvider("sk-test", "text-embedding-3-small", {
      dims: 2,
      sleep: async () => {},
    });
    const inputs = Array.from({ length: 600 }, (_, i) => `t${i}`);
    fetchSpy.mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as {
        input: string[];
      };
      return mockResponse(200, {
        data: body.input.map((_, i) => ({ embedding: [i, i], index: i })),
      });
    });

    const out = await p.embedBatch(inputs);
    expect(out).toHaveLength(600);
    // 600 inputs at 256/batch → 3 requests (256 + 256 + 88).
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const sizes = fetchSpy.mock.calls.map((c) => {
      const body = JSON.parse((c[1] as RequestInit).body as string) as {
        input: string[];
      };
      return body.input.length;
    });
    expect(sizes).toEqual([256, 256, 88]);
  });

  it("embedBatch: empty input returns empty array without calling fetch", async () => {
    const p = new OpenAIProvider("sk-test", "text-embedding-3-small", {
      dims: 4,
      sleep: async () => {},
    });
    const out = await p.embedBatch([]);
    expect(out).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("embedBatch: throws on count mismatch", async () => {
    const p = new OpenAIProvider("sk-test", "text-embedding-3-small", {
      dims: 2,
      sleep: async () => {},
    });
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, { data: [{ embedding: [1, 2] }] }),
    );
    await expect(p.embedBatch(["a", "b"])).rejects.toThrow(/returned 1 .* for 2/);
  });

  it("embedBatch: re-orders by `index` if upstream returns out of order", async () => {
    const p = new OpenAIProvider("sk-test", "text-embedding-3-small", {
      dims: 2,
      sleep: async () => {},
    });
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, {
        data: [
          { embedding: [9, 9], index: 1 },
          { embedding: [0, 0], index: 0 },
        ],
      }),
    );
    const out = await p.embedBatch(["a", "b"]);
    expect(out).toEqual([
      [0, 0],
      [9, 9],
    ]);
  });
});

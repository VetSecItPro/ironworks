import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "../providers/ollama.js";

function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OllamaProvider", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockReset();
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("constructor rejects empty baseUrl", () => {
    expect(() => new OllamaProvider("")).toThrow(/non-empty baseUrl/);
  });

  it("derives 768 dims for nomic-embed-text by default", () => {
    const p = new OllamaProvider("http://localhost:11434/api/embeddings");
    expect(p.name).toBe("ollama");
    expect(p.model).toBe("nomic-embed-text");
    expect(p.dims).toBe(768);
  });

  it("uses override dims when provided", () => {
    const p = new OllamaProvider("http://x", "custom", undefined, { dims: 42 });
    expect(p.dims).toBe(42);
  });

  it("embed: happy path sends { prompt, model } and returns vector", async () => {
    const p = new OllamaProvider("http://x/api/embeddings", "nomic-embed-text", undefined, {
      dims: 3,
      sleep: async () => {},
    });
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { embedding: [1, 2, 3] }));
    const out = await p.embed("hi");
    expect(out).toEqual([1, 2, 3]);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://x/api/embeddings");
    expect(JSON.parse(init?.body as string)).toEqual({
      prompt: "hi",
      model: "nomic-embed-text",
    });
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("embed: includes Authorization header when apiKey provided", async () => {
    const p = new OllamaProvider("http://x/api/embeddings", "nomic-embed-text", "key-abc", {
      dims: 2,
      sleep: async () => {},
    });
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { embedding: [1, 2] }));
    await p.embed("hi");
    const headers = fetchSpy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer key-abc");
  });

  it("embed: 429 retries with rate-limit backoff", async () => {
    const sleeps: number[] = [];
    const p = new OllamaProvider("http://x", "nomic-embed-text", undefined, {
      dims: 2,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    fetchSpy
      .mockResolvedValueOnce(mockResponse(429, {}))
      .mockResolvedValueOnce(mockResponse(429, {}))
      .mockResolvedValueOnce(mockResponse(200, { embedding: [7, 7] }));
    const out = await p.embed("x");
    expect(out).toEqual([7, 7]);
    expect(sleeps).toEqual([10_000, 30_000]);
  });

  it("embed: 500 retries exponentially then throws", async () => {
    const sleeps: number[] = [];
    const p = new OllamaProvider("http://x", "nomic-embed-text", undefined, {
      dims: 2,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    fetchSpy.mockResolvedValue(mockResponse(503, { error: "down" }));
    await expect(p.embed("x")).rejects.toThrow(/ollama 503/);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1_000, 2_000]);
  });

  it("embed: 404 throws immediately (no retry)", async () => {
    const p = new OllamaProvider("http://x", "nomic-embed-text", undefined, {
      dims: 2,
      sleep: async () => {},
    });
    fetchSpy.mockResolvedValueOnce(mockResponse(404, { error: "no model" }));
    await expect(p.embed("x")).rejects.toThrow(/ollama 404/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("embed: throws on dim mismatch", async () => {
    const p = new OllamaProvider("http://x", "nomic-embed-text", undefined, {
      dims: 4,
      sleep: async () => {},
    });
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { embedding: [1, 2] }));
    await expect(p.embed("x")).rejects.toThrow(/dim mismatch.*got 2.*expected 4/);
  });

  it("embed: throws when response has no embedding", async () => {
    const p = new OllamaProvider("http://x", "nomic-embed-text", undefined, {
      dims: 2,
      sleep: async () => {},
    });
    fetchSpy.mockResolvedValueOnce(mockResponse(200, {}));
    await expect(p.embed("x")).rejects.toThrow(/no embedding/);
  });

  it("embedBatch: calls embed sequentially (one fetch per input)", async () => {
    const p = new OllamaProvider("http://x", "nomic-embed-text", undefined, {
      dims: 2,
      sleep: async () => {},
    });
    fetchSpy.mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as {
        prompt: string;
      };
      return mockResponse(200, { embedding: [body.prompt.length, 0] });
    });
    const out = await p.embedBatch(["a", "bb", "ccc"]);
    expect(out).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

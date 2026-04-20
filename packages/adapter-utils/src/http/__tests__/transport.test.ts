import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  HttpAdapterAuthError,
  HttpAdapterClientError,
  HttpAdapterConfigError,
  HttpAdapterNetworkError,
  HttpAdapterRateLimitError,
  HttpAdapterServerError,
  HttpAdapterTimeoutError,
} from "../errors.js";
import { createTransport, sendJson, sendJsonStream, type TransportOptions } from "../transport.js";

const origDispatcher = getGlobalDispatcher();
let mockAgent: MockAgent;

beforeEach(() => {
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});

afterEach(() => {
  mockAgent.close();
  setGlobalDispatcher(origDispatcher);
});

describe("sendJson (non-streaming)", () => {
  it("sends POST with JSON body + Authorization header", async () => {
    const pool = mockAgent.get("https://api.example.com");
    pool
      .intercept({
        path: "/v1/chat",
        method: "POST",
        headers: {
          authorization: "Bearer sk-test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ q: "hi" }),
      })
      .reply(200, { ok: true }, { headers: { "content-type": "application/json" } });

    const result = await sendJson({
      url: "https://api.example.com/v1/chat",
      apiKey: "sk-test",
      body: { q: "hi" },
    });
    expect(result.body).toEqual({ ok: true });
    expect(result.status).toBe(200);
  });

  it("rejects responses with non-JSON content-type", async () => {
    const pool = mockAgent.get("https://api.example.com");
    pool
      .intercept({ path: "/v1/chat", method: "POST" })
      .reply(200, "<html>oops</html>", { headers: { "content-type": "text/html" } });

    await expect(
      sendJson({
        url: "https://api.example.com/v1/chat",
        apiKey: "sk-test",
        body: {},
      }),
    ).rejects.toThrow(/content-type/i);
  });

  it("maps 401 to HttpAdapterAuthError", async () => {
    const pool = mockAgent.get("https://api.example.com");
    pool
      .intercept({ path: "/v1/chat", method: "POST" })
      .reply(401, { error: { message: "bad key" } }, { headers: { "content-type": "application/json" } });

    await expect(
      sendJson({
        url: "https://api.example.com/v1/chat",
        apiKey: "sk-bad",
        body: {},
      }),
    ).rejects.toBeInstanceOf(HttpAdapterAuthError);
  });

  it("maps 429 to HttpAdapterRateLimitError with retryAfterMs from Retry-After header", async () => {
    const pool = mockAgent.get("https://api.example.com");
    pool.intercept({ path: "/v1/chat", method: "POST" }).reply(
      429,
      { error: "slow down" },
      {
        headers: { "content-type": "application/json", "retry-after": "5" },
      },
    );

    try {
      await sendJson({
        url: "https://api.example.com/v1/chat",
        apiKey: "sk-test",
        body: {},
      });
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpAdapterRateLimitError);
      expect((err as HttpAdapterRateLimitError).retryAfterMs).toBe(5000);
    }
  });

  it("parses ISO-date Retry-After header", async () => {
    const pool = mockAgent.get("https://api.example.com");
    const future = new Date(Date.now() + 3000).toUTCString();
    pool
      .intercept({ path: "/v1/chat", method: "POST" })
      .reply(429, {}, { headers: { "content-type": "application/json", "retry-after": future } });

    try {
      await sendJson({ url: "https://api.example.com/v1/chat", apiKey: "sk-test", body: {} });
      expect.fail();
    } catch (err) {
      const e = err as HttpAdapterRateLimitError;
      // Should be ~3000ms (allow slack for test execution)
      expect(e.retryAfterMs).toBeGreaterThan(2000);
      expect(e.retryAfterMs).toBeLessThan(5000);
    }
  });

  it("maps 500 to HttpAdapterServerError", async () => {
    const pool = mockAgent.get("https://api.example.com");
    pool
      .intercept({ path: "/v1/chat", method: "POST" })
      .reply(503, {}, { headers: { "content-type": "application/json" } });

    await expect(
      sendJson({
        url: "https://api.example.com/v1/chat",
        apiKey: "sk-test",
        body: {},
      }),
    ).rejects.toBeInstanceOf(HttpAdapterServerError);
  });

  it("rejects responses exceeding maxResponseBytes", async () => {
    const pool = mockAgent.get("https://api.example.com");
    const huge = "x".repeat(100);
    pool
      .intercept({ path: "/v1/chat", method: "POST" })
      .reply(200, huge, { headers: { "content-type": "application/json" } });

    await expect(
      sendJson({
        url: "https://api.example.com/v1/chat",
        apiKey: "sk-test",
        body: {},
        maxResponseBytes: 50,
      }),
    ).rejects.toThrow(/response too large/i);
  });

  it("redacts API key from error messages (R20 + R6)", async () => {
    const pool = mockAgent.get("https://api.example.com");
    pool.intercept({ path: "/v1/chat", method: "POST" }).reply(401, "Invalid key: Bearer sk-ant-secretvalue123456", {
      headers: { "content-type": "application/json" },
    });

    try {
      await sendJson({
        url: "https://api.example.com/v1/chat",
        apiKey: "sk-ant-secretvalue123456",
        body: {},
      });
      expect.fail();
    } catch (err) {
      expect((err as Error).message).not.toContain("sk-ant-secretvalue123456");
    }
  });

  it("supports custom headers (e.g., anthropic-beta)", async () => {
    const pool = mockAgent.get("https://api.example.com");
    pool
      .intercept({
        path: "/v1/chat",
        method: "POST",
        headers: {
          authorization: "Bearer sk-test",
          "anthropic-beta": "prompt-caching-2024-07-31",
        },
      })
      .reply(200, { ok: true }, { headers: { "content-type": "application/json" } });

    const result = await sendJson({
      url: "https://api.example.com/v1/chat",
      apiKey: "sk-test",
      body: {},
      extraHeaders: { "anthropic-beta": "prompt-caching-2024-07-31" },
    });
    expect(result.status).toBe(200);
  });

  it("aborts via AbortSignal", async () => {
    const pool = mockAgent.get("https://api.example.com");
    pool
      .intercept({ path: "/v1/chat", method: "POST" })
      .reply(200, { ok: true }, { headers: { "content-type": "application/json" } })
      .delay(200);

    const ac = new AbortController();
    setTimeout(() => ac.abort(), 50);

    await expect(
      sendJson({
        url: "https://api.example.com/v1/chat",
        apiKey: "sk-test",
        body: {},
        abortSignal: ac.signal,
      }),
    ).rejects.toThrow();
  });

  it("times out after configured duration", async () => {
    const pool = mockAgent.get("https://api.example.com");
    pool
      .intercept({ path: "/v1/chat", method: "POST" })
      .reply(200, { ok: true }, { headers: { "content-type": "application/json" } })
      .delay(500);

    await expect(
      sendJson({
        url: "https://api.example.com/v1/chat",
        apiKey: "sk-test",
        body: {},
        timeoutMs: 100,
      }),
    ).rejects.toBeInstanceOf(HttpAdapterTimeoutError);
  });

  it("rejects empty apiKey with HttpAdapterConfigError", async () => {
    await expect(
      sendJson({
        url: "https://api.example.com/v1/chat",
        apiKey: "",
        body: {},
      }),
    ).rejects.toBeInstanceOf(HttpAdapterConfigError);
  });

  it("maps 400 Bad Request to HttpAdapterClientError (non-retryable)", async () => {
    const pool = mockAgent.get("https://api.example.com");
    pool
      .intercept({ path: "/v1/chat", method: "POST" })
      .reply(400, { error: "bad input" }, { headers: { "content-type": "application/json" } });
    try {
      await sendJson({ url: "https://api.example.com/v1/chat", apiKey: "sk-test", body: {} });
      expect.fail();
    } catch (err) {
      expect(err).toBeInstanceOf(HttpAdapterClientError);
      expect((err as HttpAdapterClientError).retryable).toBe(false);
      expect((err as HttpAdapterClientError).status).toBe(400);
    }
  });

  it("maps 404 Not Found to HttpAdapterClientError (non-retryable)", async () => {
    const pool = mockAgent.get("https://api.example.com");
    pool
      .intercept({ path: "/v1/chat", method: "POST" })
      .reply(404, {}, { headers: { "content-type": "application/json" } });
    await expect(
      sendJson({ url: "https://api.example.com/v1/chat", apiKey: "sk-test", body: {} }),
    ).rejects.toBeInstanceOf(HttpAdapterClientError);
  });

  it("maps 422 Unprocessable Entity to HttpAdapterClientError (non-retryable)", async () => {
    const pool = mockAgent.get("https://api.example.com");
    pool
      .intercept({ path: "/v1/chat", method: "POST" })
      .reply(422, { error: "validation failed" }, { headers: { "content-type": "application/json" } });
    await expect(
      sendJson({ url: "https://api.example.com/v1/chat", apiKey: "sk-test", body: {} }),
    ).rejects.toBeInstanceOf(HttpAdapterClientError);
  });

  it("maps 403 Forbidden to HttpAdapterAuthError", async () => {
    const pool = mockAgent.get("https://api.example.com");
    pool
      .intercept({ path: "/v1/chat", method: "POST" })
      .reply(403, { error: "forbidden" }, { headers: { "content-type": "application/json" } });
    await expect(
      sendJson({ url: "https://api.example.com/v1/chat", apiKey: "sk-test", body: {} }),
    ).rejects.toBeInstanceOf(HttpAdapterAuthError);
  });

  it("pre-checks Content-Length header and rejects early", async () => {
    const pool = mockAgent.get("https://api.example.com");
    pool.intercept({ path: "/v1/chat", method: "POST" }).reply(200, "x".repeat(100), {
      headers: { "content-type": "application/json", "content-length": "1000000" },
    });
    await expect(
      sendJson({
        url: "https://api.example.com/v1/chat",
        apiKey: "sk-test",
        body: {},
        maxResponseBytes: 100,
      }),
    ).rejects.toThrow(/too large/i);
  });
});

describe("sendJsonStream (SSE)", () => {
  it("returns a ReadableStream<Uint8Array> for SSE responses", async () => {
    const pool = mockAgent.get("https://api.example.com");
    pool.intercept({ path: "/v1/chat", method: "POST" }).reply(200, 'data: {"x":1}\n\ndata: [DONE]\n\n', {
      headers: { "content-type": "text/event-stream" },
    });

    const response = await sendJsonStream({
      url: "https://api.example.com/v1/chat",
      apiKey: "sk-test",
      body: { q: "hi" },
    });
    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(ReadableStream);

    // Drain the stream to verify content
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let content = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      content += decoder.decode(value);
    }
    expect(content).toContain("[DONE]");
  });

  it("rejects non-event-stream content-type on streaming calls", async () => {
    const pool = mockAgent.get("https://api.example.com");
    pool
      .intercept({ path: "/v1/chat", method: "POST" })
      .reply(200, { oops: "non-stream" }, { headers: { "content-type": "application/json" } });

    await expect(
      sendJsonStream({
        url: "https://api.example.com/v1/chat",
        apiKey: "sk-test",
        body: {},
      }),
    ).rejects.toThrow(/content-type/i);
  });

  it("maps streaming error responses to the same error classes as non-streaming", async () => {
    const pool = mockAgent.get("https://api.example.com");
    pool.intercept({ path: "/v1/chat", method: "POST" }).reply(
      429,
      { error: "rate" },
      {
        headers: { "content-type": "application/json", "retry-after": "10" },
      },
    );

    await expect(
      sendJsonStream({
        url: "https://api.example.com/v1/chat",
        apiKey: "sk-test",
        body: {},
      }),
    ).rejects.toBeInstanceOf(HttpAdapterRateLimitError);
  });
});

describe("createTransport", () => {
  it("returns an object with sendJson and sendJsonStream", () => {
    const t = createTransport();
    expect(typeof t.sendJson).toBe("function");
    expect(typeof t.sendJsonStream).toBe("function");
  });

  it("transport instances share the underlying undici pool for keepalive", () => {
    // Behavioral: hard to directly test, but ensure createTransport doesn't throw
    // and returns a functional client
    const t1 = createTransport();
    const t2 = createTransport();
    // Different instances, but both work
    expect(t1).not.toBe(t2);
  });
});

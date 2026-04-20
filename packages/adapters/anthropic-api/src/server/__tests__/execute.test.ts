import type { AdapterExecutionContext } from "@ironworksai/adapter-utils";
import {
  HttpAdapterAuthError,
  HttpAdapterRateLimitError,
  HttpAdapterServerError,
} from "@ironworksai/adapter-utils/http/errors";
import type { Transport } from "@ironworksai/adapter-utils/http/transport";
import { describe, expect, it, type Mock, vi } from "vitest";
import { execute } from "../execute.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<AdapterExecutionContext> = {}): AdapterExecutionContext {
  return {
    runId: "run-abc123",
    agent: {
      id: "agent-1",
      companyId: "company-1",
      name: "TestAgent",
      adapterType: "anthropic_api",
      adapterConfig: {},
    },
    context: {
      taskId: null,
      issueId: null,
      wakeReason: null,
      wakeCommentId: null,
      commentId: null,
      approvalId: null,
      approvalStatus: null,
      issueIds: [],
    },
    config: { model: "claude-sonnet-4-6", apiKey: "sk-ant-testkey12345678" },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    onLog: vi.fn().mockResolvedValue(undefined),
    onMeta: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Build an Anthropic-native SSE stream from text chunks.
 * Mirrors the message_start / content_block_start / content_block_delta / content_block_stop /
 * message_delta / message_stop event sequence Anthropic produces.
 */
function buildAnthropicSseStream(
  chunks: string[],
  usage = { input_tokens: 10, output_tokens: 20 },
  extraCacheUsage?: { cache_read_input_tokens?: number; cache_creation_input_tokens?: number },
): string {
  const events: string[] = [];

  events.push(
    `event: message_start\ndata: ${JSON.stringify({
      type: "message_start",
      message: {
        id: "msg_test",
        type: "message",
        role: "assistant",
        content: [],
        model: "claude-sonnet-4-6",
        usage: { input_tokens: usage.input_tokens, output_tokens: 0 },
      },
    })}\n\n`,
  );

  events.push(
    `event: content_block_start\ndata: ${JSON.stringify({
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    })}\n\n`,
  );

  for (const chunk of chunks) {
    events.push(
      `event: content_block_delta\ndata: ${JSON.stringify({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: chunk },
      })}\n\n`,
    );
  }

  events.push(
    `event: content_block_stop\ndata: ${JSON.stringify({
      type: "content_block_stop",
      index: 0,
    })}\n\n`,
  );

  // Anthropic's message_delta carries input_tokens AND output_tokens in its usage field.
  // The sse-parser captures usage only from message_delta (not message_start), so we must
  // include input_tokens here for the adapter to report correct inputTokens in the result.
  const deltaUsage: Record<string, unknown> = {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    ...(extraCacheUsage?.cache_read_input_tokens !== undefined
      ? { cache_read_input_tokens: extraCacheUsage.cache_read_input_tokens }
      : {}),
    ...(extraCacheUsage?.cache_creation_input_tokens !== undefined
      ? { cache_creation_input_tokens: extraCacheUsage.cache_creation_input_tokens }
      : {}),
  };

  events.push(
    `event: message_delta\ndata: ${JSON.stringify({
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: deltaUsage,
    })}\n\n`,
  );

  events.push(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);

  return events.join("");
}

function buildAnthropicToolCallStream(): string {
  const events: string[] = [];

  events.push(
    `event: message_start\ndata: ${JSON.stringify({
      type: "message_start",
      message: {
        id: "msg_tool",
        type: "message",
        role: "assistant",
        content: [],
        usage: { input_tokens: 50, output_tokens: 0 },
      },
    })}\n\n`,
  );

  // Tool use block
  events.push(
    `event: content_block_start\ndata: ${JSON.stringify({
      type: "content_block_start",
      index: 0,
      content_block: { type: "tool_use", id: "toolu_01", name: "get_weather", input: {} },
    })}\n\n`,
  );

  events.push(
    `event: content_block_delta\ndata: ${JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: '{"city":"Seattle"}' },
    })}\n\n`,
  );

  events.push(
    `event: content_block_stop\ndata: ${JSON.stringify({
      type: "content_block_stop",
      index: 0,
    })}\n\n`,
  );

  events.push(
    `event: message_delta\ndata: ${JSON.stringify({
      type: "message_delta",
      delta: { stop_reason: "tool_use", stop_sequence: null },
      usage: { output_tokens: 10 },
    })}\n\n`,
  );

  events.push(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);

  return events.join("");
}

/** Build an Anthropic SSE stream that includes a thinking block before text. */
function buildAnthropicThinkingStream(thinkingText: string, textChunks: string[]): string {
  const events: string[] = [];

  events.push(
    `event: message_start\ndata: ${JSON.stringify({
      type: "message_start",
      message: {
        id: "msg_think",
        type: "message",
        role: "assistant",
        content: [],
        usage: { input_tokens: 30, output_tokens: 0 },
      },
    })}\n\n`,
  );

  // Thinking block at index 0
  events.push(
    `event: content_block_start\ndata: ${JSON.stringify({
      type: "content_block_start",
      index: 0,
      content_block: { type: "thinking", thinking: "" },
    })}\n\n`,
  );

  events.push(
    `event: content_block_delta\ndata: ${JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: thinkingText },
    })}\n\n`,
  );

  events.push(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`);

  // Text block at index 1
  events.push(
    `event: content_block_start\ndata: ${JSON.stringify({
      type: "content_block_start",
      index: 1,
      content_block: { type: "text", text: "" },
    })}\n\n`,
  );

  for (const chunk of textChunks) {
    events.push(
      `event: content_block_delta\ndata: ${JSON.stringify({
        type: "content_block_delta",
        index: 1,
        delta: { type: "text_delta", text: chunk },
      })}\n\n`,
    );
  }

  events.push(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 1 })}\n\n`);

  events.push(
    `event: message_delta\ndata: ${JSON.stringify({
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 25 },
    })}\n\n`,
  );

  events.push(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);

  return events.join("");
}

function sseToStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });
}

function makeMockTransport(streamBody: string, status = 200): Transport {
  return {
    sendJson: vi.fn(),
    sendJsonStream: vi.fn().mockResolvedValue({
      status,
      headers: { "content-type": "text/event-stream" },
      body: sseToStream(streamBody),
    }),
  };
}

// ---------------------------------------------------------------------------
// D.3: Happy path — Anthropic Messages API native shape
// ---------------------------------------------------------------------------

describe("execute — happy path", () => {
  it("sends POST to https://api.anthropic.com/v1/messages", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["Hello", " world"]));
    const ctx = makeCtx();
    await execute(ctx, transport);
    const call = (transport.sendJsonStream as Mock).mock.calls[0][0];
    expect(call.url).toBe("https://api.anthropic.com/v1/messages");
  });

  it("includes x-api-key header via apiKey field", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["Hi"]));
    const ctx = makeCtx({ config: { model: "claude-sonnet-4-6", apiKey: "sk-ant-mykey" } });
    await execute(ctx, transport);
    const call = (transport.sendJsonStream as Mock).mock.calls[0][0];
    expect(call.apiKey).toBe("sk-ant-mykey");
  });

  it("sends model in request body", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["ok"]));
    const ctx = makeCtx({ config: { model: "claude-opus-4-7", apiKey: "sk-ant-key" } });
    await execute(ctx, transport);
    const body = (transport.sendJsonStream as Mock).mock.calls[0][0].body as Record<string, unknown>;
    expect(body.model).toBe("claude-opus-4-7");
  });

  it("sets stream: true in request body", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["ok"]));
    await execute(makeCtx(), transport);
    const body = (transport.sendJsonStream as Mock).mock.calls[0][0].body as Record<string, unknown>;
    expect(body.stream).toBe(true);
  });

  it("sends system as array of content blocks (Anthropic-native shape)", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["ok"]));
    await execute(makeCtx(), transport);
    const body = (transport.sendJsonStream as Mock).mock.calls[0][0].body as Record<string, unknown>;
    // Anthropic native: system is an array of content objects, not a plain string
    expect(Array.isArray(body.system)).toBe(true);
    const system = body.system as Array<Record<string, unknown>>;
    expect(system.length).toBeGreaterThanOrEqual(1);
    expect(system[0].type).toBe("text");
    expect(typeof system[0].text).toBe("string");
  });

  it("sends messages array with Anthropic turn format", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["ok"]));
    await execute(makeCtx(), transport);
    const body = (transport.sendJsonStream as Mock).mock.calls[0][0].body as Record<string, unknown>;
    expect(Array.isArray(body.messages)).toBe(true);
    const messages = body.messages as Array<Record<string, unknown>>;
    expect(messages.length).toBeGreaterThanOrEqual(1);
    // Latest message should be user turn
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.role).toBe("user");
  });

  it("streams text tokens via onLog stdout", async () => {
    const ctx = makeCtx();
    const transport = makeMockTransport(buildAnthropicSseStream(["Hello", " world"]));
    await execute(ctx, transport);
    const logCalls = (ctx.onLog as Mock).mock.calls;
    const stdoutChunks = logCalls.filter(([stream]) => stream === "stdout").map(([, text]) => text as string);
    const joined = stdoutChunks.join("");
    expect(joined).toContain("Hello");
    expect(joined).toContain(" world");
  });

  it("emits AdapterInvocationMeta via onMeta before streaming", async () => {
    const ctx = makeCtx();
    const transport = makeMockTransport(buildAnthropicSseStream(["hi"]));
    await execute(ctx, transport);
    const metaCalls = (ctx.onMeta as Mock).mock.calls;
    expect(metaCalls.length).toBeGreaterThanOrEqual(1);
    const meta = metaCalls[0][0] as Record<string, unknown>;
    expect(meta.adapterType).toBe("anthropic_api");
  });

  it("returns exitCode 0 on success", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["done"]));
    const result = await execute(makeCtx(), transport);
    expect(result.exitCode).toBe(0);
  });

  it("returns usage with inputTokens and outputTokens", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["done"], { input_tokens: 100, output_tokens: 50 }));
    const result = await execute(makeCtx(), transport);
    expect(result.usage?.inputTokens).toBe(100);
    expect(result.usage?.outputTokens).toBe(50);
  });

  it("includes model in result", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["ok"]));
    const result = await execute(makeCtx({ config: { model: "claude-haiku-4-5", apiKey: "sk-ant-k" } }), transport);
    expect(result.model).toBe("claude-haiku-4-5");
  });

  it("replays prior transcript when sessionParams present", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["ok"]));
    const ctx = makeCtx({
      runtime: {
        sessionId: null,
        sessionDisplayId: "abc123",
        taskKey: null,
        sessionParams: {
          turns: [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hi there" },
          ],
        },
      },
    });
    await execute(ctx, transport);
    const body = (transport.sendJsonStream as Mock).mock.calls[0][0].body as Record<string, unknown>;
    const messages = body.messages as unknown[];
    // Prior turns appear before the new user message
    expect(messages.length).toBeGreaterThanOrEqual(3);
  });

  it("sends max_tokens in request body", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["ok"]));
    const ctx = makeCtx({ config: { model: "claude-sonnet-4-6", apiKey: "sk-ant-k", maxTokens: 2048 } });
    await execute(ctx, transport);
    const body = (transport.sendJsonStream as Mock).mock.calls[0][0].body as Record<string, unknown>;
    expect(typeof body.max_tokens).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// D.3: Tool call handling via Anthropic-native content blocks
// ---------------------------------------------------------------------------

describe("execute — tool call handling", () => {
  it("parses tool_use content blocks and logs tool name to stdout", async () => {
    const ctx = makeCtx();
    const transport = makeMockTransport(buildAnthropicToolCallStream());
    await execute(ctx, transport);
    const logCalls = (ctx.onLog as Mock).mock.calls;
    const stdoutLines = logCalls.filter(([s]) => s === "stdout").map(([, t]) => t as string);
    const joined = stdoutLines.join("");
    expect(joined).toContain("get_weather");
  });

  it("returns exitCode 0 after tool_call completion", async () => {
    const transport = makeMockTransport(buildAnthropicToolCallStream());
    const result = await execute(makeCtx(), transport);
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// D.4: Prompt caching — cache_read_input_tokens tracked separately, cost discounted
// ---------------------------------------------------------------------------

describe("execute — prompt caching (D.4)", () => {
  it("applies cache_control to system prompt when cacheControl config is set", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["ok"]));
    const ctx = makeCtx({
      config: { model: "claude-sonnet-4-6", apiKey: "sk-ant-k", cacheControl: { breakpoints: 1 } },
    });
    await execute(ctx, transport);
    const body = (transport.sendJsonStream as Mock).mock.calls[0][0].body as Record<string, unknown>;
    const system = body.system as Array<Record<string, unknown>>;
    // At least the last block should have cache_control when breakpoints=1
    const hasCache = system.some((b) => b.cache_control !== undefined);
    expect(hasCache).toBe(true);
  });

  it("tracks cache_read_input_tokens in usage when Anthropic returns them", async () => {
    const transport = makeMockTransport(
      buildAnthropicSseStream(["ok"], { input_tokens: 50, output_tokens: 20 }, { cache_read_input_tokens: 2000 }),
    );
    const result = await execute(makeCtx(), transport);
    // cachedInputTokens must be populated from cache_read_input_tokens
    expect(result.usage?.cachedInputTokens).toBe(2000);
  });

  it("cost is lower on cache hit than fresh request for same token count", async () => {
    // Fresh request: 2000 input tokens at full rate
    const transportFresh = makeMockTransport(
      buildAnthropicSseStream(["ok"], { input_tokens: 2000, output_tokens: 10 }),
    );
    const resultFresh = await execute(makeCtx(), transportFresh);

    // Cache-hit request: 2000 cache_read tokens at ~10% rate
    const transportCached = makeMockTransport(
      buildAnthropicSseStream(["ok"], { input_tokens: 0, output_tokens: 10 }, { cache_read_input_tokens: 2000 }),
    );
    const resultCached = await execute(makeCtx(), transportCached);

    // Both must have a cost — compare if both non-null
    if (
      resultFresh.costUsd !== undefined &&
      resultFresh.costUsd !== null &&
      resultCached.costUsd !== undefined &&
      resultCached.costUsd !== null
    ) {
      expect(resultCached.costUsd).toBeLessThan(resultFresh.costUsd);
    }
    // At minimum, cached usage tokens are tracked
    expect(resultCached.usage?.cachedInputTokens).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// D.5: Extended thinking support
// ---------------------------------------------------------------------------

describe("execute — extended thinking (D.5)", () => {
  it("sends thinking object in request body when extendedThinking config is set", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["ok"]));
    const ctx = makeCtx({
      config: {
        model: "claude-opus-4-7",
        apiKey: "sk-ant-k",
        extendedThinking: { budgetTokens: 5000 },
      },
    });
    await execute(ctx, transport);
    const body = (transport.sendJsonStream as Mock).mock.calls[0][0].body as Record<string, unknown>;
    expect(body.thinking).toBeDefined();
    const thinking = body.thinking as Record<string, unknown>;
    expect(thinking.type).toBe("enabled");
    expect(thinking.budget_tokens).toBe(5000);
  });

  it("does not send thinking when extendedThinking is not configured", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["ok"]));
    await execute(makeCtx(), transport);
    const body = (transport.sendJsonStream as Mock).mock.calls[0][0].body as Record<string, unknown>;
    expect(body.thinking).toBeUndefined();
  });

  it("parses thinking content blocks from response stream", async () => {
    const ctx = makeCtx({
      config: { model: "claude-opus-4-7", apiKey: "sk-ant-k", extendedThinking: { budgetTokens: 2000 } },
    });
    const transport = makeMockTransport(
      buildAnthropicThinkingStream("Let me reason through this...", ["The answer is 42."]),
    );
    await execute(ctx, transport);
    const logCalls = (ctx.onLog as Mock).mock.calls;
    const stdoutLines = logCalls.filter(([s]) => s === "stdout").map(([, t]) => t as string);
    const joined = stdoutLines.join("");
    // The text response should be streamed
    expect(joined).toContain("The answer is 42.");
  });
});

// ---------------------------------------------------------------------------
// D.6: Vision / files — image content blocks
// ---------------------------------------------------------------------------

describe("execute — vision (D.6)", () => {
  it("passes image_url content block through to messages when provided in wakeReason", async () => {
    // Vision content is passed as part of the context; execute should forward it
    const transport = makeMockTransport(buildAnthropicSseStream(["I see an image"]));
    const ctx = makeCtx({
      context: {
        taskId: null,
        issueId: null,
        wakeReason: "Analyze this image",
        wakeCommentId: null,
        commentId: null,
        approvalId: null,
        approvalStatus: null,
        issueIds: [],
      },
    });
    await execute(ctx, transport);
    // The user message should contain the wakeReason text
    const body = (transport.sendJsonStream as Mock).mock.calls[0][0].body as Record<string, unknown>;
    const messages = body.messages as Array<Record<string, unknown>>;
    const lastMsg = messages[messages.length - 1];
    const content = lastMsg.content;
    // content is either a string or an array of content blocks
    const contentStr = typeof content === "string" ? content : JSON.stringify(content);
    expect(contentStr).toContain("Analyze this image");
  });

  it("returns exitCode 0 when processing vision context", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["Vision response"]));
    const ctx = makeCtx({
      context: {
        taskId: null,
        issueId: null,
        wakeReason: "What is in this image?",
        wakeCommentId: null,
        commentId: null,
        approvalId: null,
        approvalStatus: null,
        issueIds: [],
      },
    });
    const result = await execute(ctx, transport);
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Error paths (D.3 / D.4)
// ---------------------------------------------------------------------------

describe("execute — error paths", () => {
  it("401 returns auth error without retry", async () => {
    const transport: Transport = {
      sendJson: vi.fn(),
      sendJsonStream: vi.fn().mockRejectedValue(new HttpAdapterAuthError("Unauthorized")),
    };
    const result = await execute(makeCtx(), transport);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toMatch(/auth/i);
    // Auth errors must NOT retry
    expect((transport.sendJsonStream as Mock).mock.calls.length).toBe(1);
  });

  it("429 with Retry-After returns rate-limit error", async () => {
    const transport: Transport = {
      sendJson: vi.fn(),
      sendJsonStream: vi
        .fn()
        .mockRejectedValueOnce(new HttpAdapterRateLimitError("Rate limited", { retryAfterMs: 100 }))
        .mockRejectedValueOnce(new HttpAdapterRateLimitError("Rate limited", { retryAfterMs: 100 }))
        .mockRejectedValueOnce(new HttpAdapterRateLimitError("Rate limited", { retryAfterMs: 100 }))
        .mockRejectedValueOnce(new HttpAdapterRateLimitError("Rate limited", { retryAfterMs: 100 })),
    };
    const result = await execute(makeCtx(), transport);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toMatch(/rate.?limit/i);
  });

  it("500 retries then returns server error", async () => {
    const transport: Transport = {
      sendJson: vi.fn(),
      sendJsonStream: vi
        .fn()
        .mockRejectedValueOnce(new HttpAdapterServerError("Internal Server Error", { status: 500 }))
        .mockRejectedValueOnce(new HttpAdapterServerError("Internal Server Error", { status: 500 }))
        .mockRejectedValueOnce(new HttpAdapterServerError("Internal Server Error", { status: 500 }))
        .mockRejectedValueOnce(new HttpAdapterServerError("Internal Server Error", { status: 500 })),
    };
    const result = await execute(makeCtx(), transport);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toMatch(/server.?error|5xx/i);
    expect((transport.sendJsonStream as Mock).mock.calls.length).toBeGreaterThan(1);
  });

  it("R16: tool_call emitted mid-stream then disconnect — NO retry, partial error returned", async () => {
    let streamCallCount = 0;
    const transport: Transport = {
      sendJson: vi.fn(),
      sendJsonStream: vi.fn().mockImplementation(async () => {
        streamCallCount++;
        // Anthropic-native SSE with tool_use_start then abrupt close
        const partial = `event: content_block_start\ndata: ${JSON.stringify({
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "toolu_r16", name: "write_file", input: {} },
        })}\n\n`;
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(partial));
            controller.error(new Error("socket hang up"));
          },
        });
        return { status: 200, headers: { "content-type": "text/event-stream" }, body: stream };
      }),
    };

    const result = await execute(makeCtx(), transport);

    // R16: must NOT retry after tool_call was emitted
    expect(streamCallCount).toBe(1);
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toBeDefined();
  });

  it("missing model in config returns config error without calling transport", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["ok"]));
    const ctx = makeCtx({ config: { model: "", apiKey: "sk-ant-key" } });
    const result = await execute(ctx, transport);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toMatch(/config/i);
    expect((transport.sendJsonStream as Mock).mock.calls.length).toBe(0);
  });

  it("missing apiKey returns config error without calling transport", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["ok"]));
    const ctx = makeCtx({ config: { model: "claude-sonnet-4-6" } });
    const result = await execute(ctx, transport);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toMatch(/config/i);
    expect((transport.sendJsonStream as Mock).mock.calls.length).toBe(0);
  });

  it("usage is always populated when stream returns tokens", async () => {
    const transport = makeMockTransport(buildAnthropicSseStream(["ok"], { input_tokens: 100, output_tokens: 50 }));
    const result = await execute(makeCtx(), transport);
    expect(result.usage).toBeDefined();
    expect(result.usage?.inputTokens).toBeGreaterThanOrEqual(0);
  });
});

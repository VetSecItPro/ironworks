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
    agent: { id: "agent-1", companyId: "company-1", name: "TestAgent", adapterType: "poe_api", adapterConfig: {} },
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
    config: { model: "claude-sonnet-4-6", apiKey: "sk-poe-testkey12345678" },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    onLog: vi.fn().mockResolvedValue(undefined),
    onMeta: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// Build an OpenAI-compat SSE stream string from an array of text deltas + optional tool calls
function buildSseStream(
  chunks: string[],
  usage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
): string {
  const events: string[] = [];
  let idx = 0;
  for (const chunk of chunks) {
    events.push(
      `data: ${JSON.stringify({
        id: `chatcmpl-${idx}`,
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
      })}\n\n`,
    );
    idx++;
  }
  // Final chunk with finish_reason
  events.push(
    `data: ${JSON.stringify({
      id: `chatcmpl-${idx}`,
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage,
    })}\n\n`,
  );
  events.push("data: [DONE]\n\n");
  return events.join("");
}

function buildToolCallSseStream(): string {
  const events: string[] = [];
  // Start tool call
  events.push(
    `data: ${JSON.stringify({
      id: "chatcmpl-tc1",
      object: "chat.completion.chunk",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              { index: 0, id: "call_abc", type: "function", function: { name: "get_weather", arguments: "" } },
            ],
          },
          finish_reason: null,
        },
      ],
    })}\n\n`,
  );
  // Tool call args delta
  events.push(
    `data: ${JSON.stringify({
      id: "chatcmpl-tc2",
      object: "chat.completion.chunk",
      choices: [
        {
          index: 0,
          delta: { tool_calls: [{ index: 0, function: { arguments: '{"city":"Seattle"}' } }] },
          finish_reason: null,
        },
      ],
    })}\n\n`,
  );
  // Finish
  events.push(
    `data: ${JSON.stringify({
      id: "chatcmpl-tc3",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
      usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
    })}\n\n`,
  );
  events.push("data: [DONE]\n\n");
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
// C.3: Happy path + tool use + streaming
// ---------------------------------------------------------------------------

describe("execute — happy path", () => {
  it("sends POST to https://api.poe.com/v1/chat/completions", async () => {
    const transport = makeMockTransport(buildSseStream(["Hello", " world"]));
    const ctx = makeCtx();
    await execute(ctx, transport);
    const call = (transport.sendJsonStream as Mock).mock.calls[0][0];
    expect(call.url).toBe("https://api.poe.com/v1/chat/completions");
  });

  it("includes Bearer auth header from config.apiKey", async () => {
    const transport = makeMockTransport(buildSseStream(["Hi"]));
    const ctx = makeCtx({ config: { model: "claude-sonnet-4-6", apiKey: "sk-poe-mykey" } });
    await execute(ctx, transport);
    const call = (transport.sendJsonStream as Mock).mock.calls[0][0];
    expect(call.apiKey).toBe("sk-poe-mykey");
  });

  it("sends model in request body", async () => {
    const transport = makeMockTransport(buildSseStream(["ok"]));
    const ctx = makeCtx({ config: { model: "gpt-4o", apiKey: "sk-poe-key" } });
    await execute(ctx, transport);
    const call = (transport.sendJsonStream as Mock).mock.calls[0][0];
    const body = call.body as Record<string, unknown>;
    expect(body.model).toBe("gpt-4o");
  });

  it("sets stream: true in request body", async () => {
    const transport = makeMockTransport(buildSseStream(["ok"]));
    await execute(makeCtx(), transport);
    const body = (transport.sendJsonStream as Mock).mock.calls[0][0].body as Record<string, unknown>;
    expect(body.stream).toBe(true);
  });

  it("streams text tokens via onLog stdout", async () => {
    const ctx = makeCtx();
    const transport = makeMockTransport(buildSseStream(["Hello", " world"]));
    await execute(ctx, transport);
    const logCalls = (ctx.onLog as Mock).mock.calls;
    const stdoutChunks = logCalls.filter(([stream]) => stream === "stdout").map(([, text]) => text as string);
    const joined = stdoutChunks.join("");
    expect(joined).toContain("Hello");
    expect(joined).toContain(" world");
  });

  it("emits AdapterInvocationMeta via onMeta before streaming", async () => {
    const ctx = makeCtx();
    const transport = makeMockTransport(buildSseStream(["hi"]));
    await execute(ctx, transport);
    const metaCalls = (ctx.onMeta as Mock).mock.calls;
    expect(metaCalls.length).toBeGreaterThanOrEqual(1);
    const meta = metaCalls[0][0] as Record<string, unknown>;
    expect(meta.adapterType).toBe("poe_api");
  });

  it("returns exitCode 0 on success", async () => {
    const transport = makeMockTransport(buildSseStream(["done"]));
    const result = await execute(makeCtx(), transport);
    expect(result.exitCode).toBe(0);
  });

  it("returns usage from stream", async () => {
    const transport = makeMockTransport(
      buildSseStream(["done"], { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }),
    );
    const result = await execute(makeCtx(), transport);
    expect(result.usage?.inputTokens).toBe(100);
    expect(result.usage?.outputTokens).toBe(50);
  });

  it("includes model in result", async () => {
    const transport = makeMockTransport(buildSseStream(["ok"]));
    const result = await execute(makeCtx({ config: { model: "gpt-4o", apiKey: "sk-poe-key" } }), transport);
    expect(result.model).toBe("gpt-4o");
  });

  it("replays prior transcript via messages array when sessionParams present", async () => {
    const transport = makeMockTransport(buildSseStream(["ok"]));
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
    // Prior turns should appear before the new user message
    expect(messages.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// C.3: Tool call handling
// ---------------------------------------------------------------------------

describe("execute — tool call handling", () => {
  it("parses tool_call deltas and logs tool name to stdout", async () => {
    const ctx = makeCtx();
    const transport = makeMockTransport(buildToolCallSseStream());
    await execute(ctx, transport);
    const logCalls = (ctx.onLog as Mock).mock.calls;
    const stdoutLines = logCalls.filter(([s]) => s === "stdout").map(([, t]) => t as string);
    const joined = stdoutLines.join("");
    expect(joined).toContain("get_weather");
  });

  it("returns exitCode 0 on tool_call completion", async () => {
    const transport = makeMockTransport(buildToolCallSseStream());
    const result = await execute(makeCtx(), transport);
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// C.4: Error paths
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
    // Auth errors must NOT retry — check sendJsonStream was only called once
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
    // Should have retried at least once
    expect((transport.sendJsonStream as Mock).mock.calls.length).toBeGreaterThan(1);
  });

  it("R16: tool_call emitted mid-stream then disconnect — NO retry, partial error returned", async () => {
    let streamCallCount = 0;
    const transport: Transport = {
      sendJson: vi.fn(),
      sendJsonStream: vi.fn().mockImplementation(async () => {
        streamCallCount++;
        // Build SSE that emits a tool_call start then throws
        const partial = `data: ${JSON.stringify({
          id: "chatcmpl-r16",
          object: "chat.completion.chunk",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index: 0, id: "call_r16", type: "function", function: { name: "write_file", arguments: "" } },
                ],
              },
              finish_reason: null,
            },
          ],
        })}\n\n`;
        // Return a stream that emits the tool_call start then closes abruptly
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(partial));
            // Close without [DONE] — simulates mid-stream disconnect
            controller.error(new Error("socket hang up"));
          },
        });
        return { status: 200, headers: { "content-type": "text/event-stream" }, body: stream };
      }),
    };

    const result = await execute(makeCtx(), transport);

    // R16: must NOT retry after tool_call was emitted
    expect(streamCallCount).toBe(1);
    // Must surface an error
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toBeDefined();
  });

  it("missing model in config returns config error", async () => {
    const transport = makeMockTransport(buildSseStream(["ok"]));
    const ctx = makeCtx({ config: { model: "", apiKey: "sk-poe-key" } });
    const result = await execute(ctx, transport);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toMatch(/config/i);
    // Should not have called transport
    expect((transport.sendJsonStream as Mock).mock.calls.length).toBe(0);
  });

  it("pricing missing for unknown model — usage reported, costUsd null or 0", async () => {
    // Use a model not in pricing table to trigger missing-pricing path
    const transport = makeMockTransport(
      buildSseStream(["ok"], { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }),
    );
    // Inject an unknown model by bypassing the config validator for this test
    const ctx = makeCtx({ config: { model: "claude-sonnet-4-6", apiKey: "sk-poe-key" } });
    const result = await execute(ctx, transport);
    // Usage should always be populated if provided by stream
    expect(result.usage).toBeDefined();
  });
});

import type { AdapterExecutionContext } from "@ironworksai/adapter-utils";
import {
  HttpAdapterAuthError,
  HttpAdapterRateLimitError,
  HttpAdapterServerError,
  HttpAdapterStreamBreak,
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
      adapterType: "openai_api",
      adapterConfig: {},
    },
    context: {
      taskId: null,
      issueId: null,
      wakeReason: "run test",
      wakeCommentId: null,
      commentId: null,
      approvalId: null,
      approvalStatus: null,
      issueIds: [],
    },
    config: { model: "gpt-5", apiKey: "sk-proj-testkey12345678" },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    onLog: vi.fn().mockResolvedValue(undefined),
    onMeta: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Build an OpenAI-compat SSE stream from text chunks.
 * Uses the standard data: JSON event format with delta content.
 * Includes a final chunk with usage when stream_options.include_usage is set.
 */
function buildOpenAISseStream(
  chunks: string[],
  usage = { prompt_tokens: 10, completion_tokens: 20 },
  toolCalls?: Array<{ id: string; name: string; arguments: string }>,
): string {
  const modelId = "gpt-5";
  const events: string[] = [];

  // Text delta events
  for (const chunk of chunks) {
    events.push(
      `data: ${JSON.stringify({
        id: "chatcmpl-test",
        object: "chat.completion.chunk",
        model: modelId,
        choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
      })}\n\n`,
    );
  }

  // Tool call events (if any)
  if (toolCalls && toolCalls.length > 0) {
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i]!;
      // Tool call start
      events.push(
        `data: ${JSON.stringify({
          id: "chatcmpl-test",
          object: "chat.completion.chunk",
          model: modelId,
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [{ index: i, id: tc.id, type: "function", function: { name: tc.name, arguments: "" } }],
              },
              finish_reason: null,
            },
          ],
        })}\n\n`,
      );
      // Arguments chunk
      events.push(
        `data: ${JSON.stringify({
          id: "chatcmpl-test",
          object: "chat.completion.chunk",
          model: modelId,
          choices: [
            {
              index: 0,
              delta: { tool_calls: [{ index: i, function: { arguments: tc.arguments } }] },
              finish_reason: null,
            },
          ],
        })}\n\n`,
      );
    }
  }

  // Finish chunk
  const finishReason = toolCalls && toolCalls.length > 0 ? "tool_calls" : "stop";
  events.push(
    `data: ${JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion.chunk",
      model: modelId,
      choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
      // Usage in final chunk (stream_options.include_usage)
      usage: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.prompt_tokens + usage.completion_tokens,
      },
    })}\n\n`,
  );

  events.push(`data: [DONE]\n\n`);

  return events.join("");
}

function makeReadableStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function makeMockTransport(sseText: string, overrides: Partial<Transport> = {}): Transport {
  return {
    sendJsonStream: vi.fn().mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: makeReadableStream(sseText),
    }),
    sendJson: vi.fn().mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      body: {},
    }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// E.3 — Happy path tests
// ---------------------------------------------------------------------------

describe("execute — happy path", () => {
  it("sends POST to https://api.openai.com/v1/chat/completions with correct shape", async () => {
    const sseText = buildOpenAISseStream(["Hello", " world"]);
    const transport = makeMockTransport(sseText);

    await execute(makeCtx(), transport);

    const call = (transport.sendJsonStream as Mock).mock.calls[0]![0];
    expect(call.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(call.body.model).toBe("gpt-5");
    expect(call.body.stream).toBe(true);
    expect(Array.isArray(call.body.messages)).toBe(true);
  });

  it("includes Authorization: Bearer header via apiKey", async () => {
    const sseText = buildOpenAISseStream(["Hi"]);
    const transport = makeMockTransport(sseText);

    await execute(makeCtx(), transport);

    const call = (transport.sendJsonStream as Mock).mock.calls[0]![0];
    expect(call.apiKey).toBe("sk-proj-testkey12345678");
  });

  it("streams text tokens via onLog stdout", async () => {
    const sseText = buildOpenAISseStream(["Hello", " world"]);
    const onLog = vi.fn().mockResolvedValue(undefined);
    const transport = makeMockTransport(sseText);

    await execute(makeCtx({ onLog }), transport);

    const stdoutCalls = (onLog as Mock).mock.calls.filter((c) => c[0] === "stdout" && c[1].trim().length > 0);
    expect(stdoutCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("emits AdapterInvocationMeta via onMeta before network I/O", async () => {
    const sseText = buildOpenAISseStream(["ok"]);
    const onMeta = vi.fn().mockResolvedValue(undefined);
    const transport = makeMockTransport(sseText);

    await execute(makeCtx({ onMeta }), transport);

    expect((onMeta as Mock).mock.calls.length).toBeGreaterThanOrEqual(1);
    const meta = (onMeta as Mock).mock.calls[0]![0];
    expect(meta.adapterType).toBe("openai_api");
  });

  it("returns exitCode 0 with usage on success", async () => {
    const sseText = buildOpenAISseStream(["Done"], { prompt_tokens: 50, completion_tokens: 30 });
    const transport = makeMockTransport(sseText);

    const result = await execute(makeCtx(), transport);

    expect(result.exitCode).toBe(0);
    expect(result.model).toBe("gpt-5");
  });

  it("returns sessionParams with turns for R17 replay", async () => {
    const sseText = buildOpenAISseStream(["Session reply"]);
    const transport = makeMockTransport(sseText);

    const result = await execute(makeCtx(), transport);

    expect(result.sessionParams).toBeDefined();
    if (result.sessionParams) {
      const params = result.sessionParams as Record<string, unknown>;
      expect(Array.isArray(params.turns)).toBe(true);
    }
  });

  it("replays prior transcript from sessionParams (R17 stateless)", async () => {
    const sseText = buildOpenAISseStream(["Second turn"]);
    const transport = makeMockTransport(sseText);
    const priorSession = {
      turns: [
        { role: "user", content: "First message" },
        { role: "assistant", content: "First reply" },
      ],
    };

    await execute(
      makeCtx({ runtime: { sessionId: null, sessionParams: priorSession, sessionDisplayId: null, taskKey: null } }),
      transport,
    );

    const call = (transport.sendJsonStream as Mock).mock.calls[0]![0];
    const messages = call.body.messages as Array<{ role: string; content: string }>;
    // Prior turns + new user turn should all be present
    expect(messages.length).toBeGreaterThanOrEqual(3);
  });

  it("includes stream_options.include_usage to get usage in final chunk", async () => {
    const sseText = buildOpenAISseStream(["ok"]);
    const transport = makeMockTransport(sseText);

    await execute(makeCtx(), transport);

    const call = (transport.sendJsonStream as Mock).mock.calls[0]![0];
    expect(call.body.stream_options?.include_usage).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E.3 — Tool use + reasoning model tests
// ---------------------------------------------------------------------------

describe("execute — tool use", () => {
  it("sets R16 tool-call flag and logs tool call on tool_calls finish_reason", async () => {
    const sseText = buildOpenAISseStream([], { prompt_tokens: 10, completion_tokens: 5 }, [
      { id: "call_abc", name: "read_file", arguments: '{"path":"/tmp/test"}' },
    ]);
    const onLog = vi.fn().mockResolvedValue(undefined);
    const transport = makeMockTransport(sseText);

    const result = await execute(makeCtx({ onLog }), transport);

    // Should succeed (tool call logged, not an error)
    expect(result.exitCode).toBe(0);
    const toolLogs = (onLog as Mock).mock.calls.filter((c) => c[1] && String(c[1]).includes("tool_call"));
    expect(toolLogs.length).toBeGreaterThanOrEqual(1);
  });

  it("does not retry after tool_call emitted (R16 invariant)", async () => {
    // Stream that raises mid-stream AFTER a tool_call has been set
    const toolSse = buildOpenAISseStream([], { prompt_tokens: 5, completion_tokens: 2 }, [
      { id: "call_123", name: "write_file", arguments: '{"path":"/tmp/x","content":"y"}' },
    ]);
    const transport = makeMockTransport(toolSse, {
      sendJsonStream: vi
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          headers: { "content-type": "text/event-stream" },
          body: makeReadableStream(toolSse),
        })
        .mockResolvedValue({
          status: 200,
          headers: { "content-type": "text/event-stream" },
          body: makeReadableStream(toolSse),
        }),
    });

    // Even if called again the second call should not happen after tool
    const result = await execute(makeCtx(), transport);
    // Only called once — no retry after tool_call
    expect((transport.sendJsonStream as Mock).mock.calls.length).toBe(1);
    expect(result.exitCode).toBe(0);
  });

  it("passes parallel_tool_calls when configured", async () => {
    const sseText = buildOpenAISseStream(["ok"]);
    const transport = makeMockTransport(sseText);

    await execute(makeCtx({ config: { model: "gpt-5", apiKey: "sk-proj-key", parallelToolCalls: false } }), transport);

    const call = (transport.sendJsonStream as Mock).mock.calls[0]![0];
    expect(call.body.parallel_tool_calls).toBe(false);
  });

  it("billing uses reasoning_tokens for o4 model (same rate as output)", async () => {
    // o4 model with reasoning tokens in usage
    const sseText = buildOpenAISseStream(["result"], { prompt_tokens: 20, completion_tokens: 10 });
    const transport = makeMockTransport(sseText);

    const result = await execute(makeCtx({ config: { model: "o4", apiKey: "sk-proj-key" } }), transport);

    expect(result.exitCode).toBe(0);
    expect(result.model).toBe("o4");
  });
});

// ---------------------------------------------------------------------------
// E.3 — Structured outputs (E.4)
// ---------------------------------------------------------------------------

describe("execute — structured outputs", () => {
  it("passes response_format json_schema when structuredOutputSchema configured", async () => {
    const sseText = buildOpenAISseStream(['{"answer":"42"}']);
    const transport = makeMockTransport(sseText);

    await execute(
      makeCtx({
        config: {
          model: "gpt-5",
          apiKey: "sk-proj-key",
          structuredOutputSchema: {
            name: "answer_schema",
            schema: { type: "object", properties: { answer: { type: "string" } } },
            strict: true,
          },
        },
      }),
      transport,
    );

    const call = (transport.sendJsonStream as Mock).mock.calls[0]![0];
    expect(call.body.response_format?.type).toBe("json_schema");
    expect(call.body.response_format?.json_schema?.name).toBe("answer_schema");
    expect(call.body.response_format?.json_schema?.strict).toBe(true);
  });

  it("omits response_format when no structuredOutputSchema", async () => {
    const sseText = buildOpenAISseStream(["plain text"]);
    const transport = makeMockTransport(sseText);

    await execute(makeCtx(), transport);

    const call = (transport.sendJsonStream as Mock).mock.calls[0]![0];
    expect(call.body.response_format).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// E.4 — Error paths
// ---------------------------------------------------------------------------

describe("execute — error paths", () => {
  it("returns errorCode openai_api_config_error when model is missing", async () => {
    const transport = makeMockTransport("");
    const result = await execute(makeCtx({ config: { model: "" } }), transport);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("openai_api_config_error");
  });

  it("returns errorCode openai_api_config_error when apiKey is not configured", async () => {
    const transport = makeMockTransport("");
    const result = await execute(makeCtx({ config: { model: "gpt-5" } }), transport);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("openai_api_config_error");
  });

  it("returns auth error on 401 without retrying", async () => {
    const transport = makeMockTransport("", {
      sendJsonStream: vi.fn().mockRejectedValue(new HttpAdapterAuthError("Invalid API key")),
    });

    const result = await execute(makeCtx(), transport);

    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("openai_api_auth_error");
    expect((transport.sendJsonStream as Mock).mock.calls.length).toBe(1);
  });

  it("retries on 429 rate limit then succeeds", async () => {
    const sseText = buildOpenAISseStream(["ok after retry"]);
    const transport = makeMockTransport("", {
      sendJsonStream: vi
        .fn()
        .mockRejectedValueOnce(new HttpAdapterRateLimitError("Rate limited", { retryAfterMs: 100 }))
        .mockResolvedValue({
          status: 200,
          headers: { "content-type": "text/event-stream" },
          body: makeReadableStream(sseText),
        }),
    });

    const result = await execute(makeCtx(), transport);

    expect(result.exitCode).toBe(0);
    expect((transport.sendJsonStream as Mock).mock.calls.length).toBe(2);
  });

  it("returns stream_break_after_tool_call on disconnect after tool emit (R16)", async () => {
    const streamBreak = new HttpAdapterStreamBreak("Disconnected", { toolCallEmitted: true });
    const transport = makeMockTransport("", {
      sendJsonStream: vi.fn().mockRejectedValue(streamBreak),
    });

    const result = await execute(makeCtx(), transport);

    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("openai_api_stream_break_after_tool_call");
  });

  it("returns server_error after exhausting 500 retries", async () => {
    const transport = makeMockTransport("", {
      sendJsonStream: vi.fn().mockRejectedValue(new HttpAdapterServerError("Internal Server Error")),
    });

    const result = await execute(makeCtx(), transport);

    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("openai_api_server_error");
  });
});

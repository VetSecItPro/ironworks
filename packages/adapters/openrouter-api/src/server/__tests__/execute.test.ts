import type { AdapterExecutionContext } from "@ironworksai/adapter-utils";
import { HttpAdapterAuthError, HttpAdapterStreamBreak } from "@ironworksai/adapter-utils/http/errors";
import type { Transport } from "@ironworksai/adapter-utils/http/transport";
import { describe, expect, it, vi } from "vitest";
import { execute } from "../execute.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmptyStreamTransport(): Transport {
  return {
    sendJsonStream: vi.fn().mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: new ReadableStream({
        start(c) {
          c.close();
        },
      }),
    }),
    sendJson: vi.fn(),
  };
}

function makeBaseCtx(configOverrides: Record<string, unknown> = {}): AdapterExecutionContext {
  return {
    runId: "run-test-123",
    agent: {
      id: "agent-1",
      companyId: "company-1",
      name: "TestAgent",
      adapterType: "openrouter_api",
      adapterConfig: {},
    },
    config: {
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      apiKey: "sk-or-v1-validtestkey12345",
      ...configOverrides,
    },
    context: {
      taskId: null,
      issueId: null,
      wakeReason: "test",
      wakeCommentId: null,
      commentId: null,
      approvalId: null,
      approvalStatus: null,
      issueIds: [],
    },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    onLog: vi.fn().mockResolvedValue(undefined),
    onMeta: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("execute", () => {
  it("returns exitCode 0 on empty stream (no tokens emitted)", async () => {
    const transport = makeEmptyStreamTransport();
    const ctx = makeBaseCtx();
    const result = await execute(ctx, transport);
    expect(result.exitCode).toBe(0);
    expect(result.provider).toBe("openrouter");
    expect(result.model).toBe("meta-llama/llama-4-scout-17b-16e-instruct");
  });

  it("returns config error when model is missing", async () => {
    const transport = makeEmptyStreamTransport();
    const ctx = makeBaseCtx({ model: "" });
    const result = await execute(ctx, transport);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("openrouter_api_config_error");
    expect((transport.sendJsonStream as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("returns config error when apiKey is missing from config and env", async () => {
    const transport = makeEmptyStreamTransport();
    const ctx = makeBaseCtx({ apiKey: undefined });
    // Ensure env var is not set during test
    const prev = process.env.ADAPTER_OPENROUTER_API_KEY;
    delete process.env.ADAPTER_OPENROUTER_API_KEY;
    const result = await execute(ctx, transport);
    if (prev !== undefined) process.env.ADAPTER_OPENROUTER_API_KEY = prev;
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("openrouter_api_config_error");
  });

  it("returns auth error on 401", async () => {
    const transport: Transport = {
      sendJsonStream: vi.fn().mockRejectedValue(new HttpAdapterAuthError("Unauthorized")),
      sendJson: vi.fn(),
    };
    const ctx = makeBaseCtx();
    const result = await execute(ctx, transport);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("openrouter_api_auth_error");
  });

  it("returns stream_break_after_tool_call and does NOT retry when R16 flag is set", async () => {
    // Simulate a stream break where the tool call flag was already set
    const streamBreak = new HttpAdapterStreamBreak("stream break", { toolCallEmitted: true });
    const transport: Transport = {
      sendJsonStream: vi.fn().mockRejectedValue(streamBreak),
      sendJson: vi.fn(),
    };
    const ctx = makeBaseCtx();
    const result = await execute(ctx, transport);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("openrouter_api_stream_break_after_tool_call");
    // Only 1 attempt — no retry after tool_call
    expect((transport.sendJsonStream as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("calls onMeta before network I/O", async () => {
    const transport = makeEmptyStreamTransport();
    const ctx = makeBaseCtx();
    await execute(ctx, transport);
    const onMeta = ctx.onMeta as ReturnType<typeof vi.fn>;
    expect(onMeta.mock.calls.length).toBeGreaterThan(0);
    const [metaArg] = onMeta.mock.calls[0] as [{ adapterType: string }];
    expect(metaArg.adapterType).toBe("openrouter_api");
  });

  it("sends HTTP-Referer and X-Title headers on every request", async () => {
    const transport = makeEmptyStreamTransport();
    const ctx = makeBaseCtx();
    await execute(ctx, transport);
    const sendJsonStream = transport.sendJsonStream as ReturnType<typeof vi.fn>;
    const [callOpts] = sendJsonStream.mock.calls[0] as [{ extraHeaders?: Record<string, string> }];
    expect(callOpts.extraHeaders?.["HTTP-Referer"]).toBeDefined();
    expect(callOpts.extraHeaders?.["X-Title"]).toBeDefined();
  });

  it("uses configured httpReferer and xTitle when provided", async () => {
    const transport = makeEmptyStreamTransport();
    const ctx = makeBaseCtx({ httpReferer: "https://my-app.example.com", xTitle: "MyApp" });
    await execute(ctx, transport);
    const sendJsonStream = transport.sendJsonStream as ReturnType<typeof vi.fn>;
    const [callOpts] = sendJsonStream.mock.calls[0] as [{ extraHeaders?: Record<string, string> }];
    expect(callOpts.extraHeaders?.["HTTP-Referer"]).toBe("https://my-app.example.com");
    expect(callOpts.extraHeaders?.["X-Title"]).toBe("MyApp");
  });
});

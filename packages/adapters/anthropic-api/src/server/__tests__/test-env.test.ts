import { HttpAdapterAuthError, HttpAdapterNetworkError } from "@ironworksai/adapter-utils/http/errors";
import type { Transport } from "@ironworksai/adapter-utils/http/transport";
import { describe, expect, it, vi } from "vitest";
import { testEnvironment } from "../test.js";

function makeMockTransport(overrides: Partial<Transport> = {}): Transport {
  return {
    sendJsonStream: vi.fn().mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: new ReadableStream({
        start(controller) {
          // Minimal message_stop SSE response for the probe
          const encoder = new TextEncoder();
          const data = `event: message_stop\ndata: {"type":"message_stop"}\n\n`;
          controller.enqueue(encoder.encode(data));
          controller.close();
        },
      }),
    }),
    sendJson: vi.fn().mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      body: { id: "msg_probe", type: "message", role: "assistant", content: [{ type: "text", text: "ok" }] },
    }),
    ...overrides,
  };
}

function makeCtx(configOverrides: Record<string, unknown> = {}) {
  return {
    adapterType: "anthropic_api" as const,
    config: { model: "claude-haiku-4-5", apiKey: "sk-ant-validkey12345", ...configOverrides },
  };
}

describe("testEnvironment", () => {
  it("returns pass when probe POST to /v1/messages succeeds", async () => {
    const transport = makeMockTransport();
    const result = await testEnvironment(makeCtx(), transport);
    expect(result.status).toBe("pass");
    expect(result.adapterType).toBe("anthropic_api");
    expect(result.testedAt).toBeTruthy();
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("anthropic_api_probe_ok");
  });

  it("returns fail when apiKey is missing", async () => {
    const transport = makeMockTransport();
    const result = await testEnvironment(makeCtx({ apiKey: undefined }), transport);
    expect(result.status).toBe("fail");
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("anthropic_api_key_missing");
    // No network call without a key
    expect((transport.sendJson as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("returns fail on 401 auth error", async () => {
    const transport = makeMockTransport({
      sendJson: vi.fn().mockRejectedValue(new HttpAdapterAuthError("Invalid API key")),
    });
    const result = await testEnvironment(makeCtx(), transport);
    expect(result.status).toBe("fail");
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("anthropic_api_auth_failed");
  });

  it("returns fail when network is unreachable", async () => {
    const transport = makeMockTransport({
      sendJson: vi.fn().mockRejectedValue(new HttpAdapterNetworkError("ENOTFOUND api.anthropic.com")),
    });
    const result = await testEnvironment(makeCtx(), transport);
    expect(result.status).toBe("fail");
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("anthropic_api_network_error");
  });

  it("includes anthropic_api_key_present info check on success", async () => {
    const transport = makeMockTransport();
    const result = await testEnvironment(makeCtx(), transport);
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("anthropic_api_key_present");
  });
});

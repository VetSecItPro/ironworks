import {
  HttpAdapterAuthError,
  HttpAdapterNetworkError,
  HttpAdapterServerError,
} from "@ironworksai/adapter-utils/http/errors";
import type { Transport } from "@ironworksai/adapter-utils/http/transport";
import { describe, expect, it, vi } from "vitest";
import { testEnvironment } from "../test.js";

function makeMockTransport(overrides: Partial<Transport> = {}): Transport {
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
    sendJson: vi.fn().mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      body: { id: "gen-test", choices: [{ message: { content: "ok" } }] },
    }),
    ...overrides,
  };
}

function makeCtx(configOverrides: Record<string, unknown> = {}) {
  return {
    adapterType: "openrouter_api" as const,
    config: {
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      apiKey: "sk-or-v1-validtestkey12345",
      ...configOverrides,
    },
  };
}

describe("testEnvironment", () => {
  it("returns pass when POST probe succeeds with valid key", async () => {
    const transport = makeMockTransport();
    const result = await testEnvironment(makeCtx(), transport);
    expect(result.status).toBe("pass");
    expect(result.adapterType).toBe("openrouter_api");
    expect(result.testedAt).toBeTruthy();
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("openrouter_api_probe_ok");
  });

  it("returns fail and skips network when apiKey is missing", async () => {
    const transport = makeMockTransport();
    const result = await testEnvironment(makeCtx({ apiKey: undefined }), transport);
    expect(result.status).toBe("fail");
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("openrouter_api_key_missing");
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
    expect(codes).toContain("openrouter_api_auth_failed");
  });

  it("returns fail when network is unreachable", async () => {
    const transport = makeMockTransport({
      sendJson: vi.fn().mockRejectedValue(new HttpAdapterNetworkError("ENOTFOUND openrouter.ai")),
    });
    const result = await testEnvironment(makeCtx(), transport);
    expect(result.status).toBe("fail");
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("openrouter_api_network_error");
  });

  it("returns fail on 500 server error", async () => {
    const transport = makeMockTransport({
      sendJson: vi.fn().mockRejectedValue(new HttpAdapterServerError("Internal Server Error")),
    });
    const result = await testEnvironment(makeCtx(), transport);
    expect(result.status).toBe("fail");
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("openrouter_api_probe_failed");
  });

  it("includes openrouter_api_key_present info check on success", async () => {
    const transport = makeMockTransport();
    const result = await testEnvironment(makeCtx(), transport);
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("openrouter_api_key_present");
  });

  it("sends HTTP-Referer and X-Title on the probe request", async () => {
    const transport = makeMockTransport();
    await testEnvironment(makeCtx(), transport);
    const sendJson = transport.sendJson as ReturnType<typeof vi.fn>;
    const [opts] = sendJson.mock.calls[0] as [{ extraHeaders?: Record<string, string> }];
    expect(opts.extraHeaders?.["HTTP-Referer"]).toBeDefined();
    expect(opts.extraHeaders?.["X-Title"]).toBeDefined();
  });
});

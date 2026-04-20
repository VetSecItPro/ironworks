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
      body: { object: "list", data: [{ id: "gpt-5" }] },
    }),
    ...overrides,
  };
}

function makeCtx(configOverrides: Record<string, unknown> = {}) {
  return {
    adapterType: "openai_api" as const,
    config: { model: "gpt-5", apiKey: "sk-proj-validkey12345", ...configOverrides },
  };
}

describe("testEnvironment", () => {
  it("returns pass when GET /v1/models probe succeeds with valid key", async () => {
    const transport = makeMockTransport();
    const result = await testEnvironment(makeCtx(), transport);
    expect(result.status).toBe("pass");
    expect(result.adapterType).toBe("openai_api");
    expect(result.testedAt).toBeTruthy();
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("openai_api_probe_ok");
  });

  it("returns fail and skips network when apiKey is missing", async () => {
    const transport = makeMockTransport();
    const result = await testEnvironment(makeCtx({ apiKey: undefined }), transport);
    expect(result.status).toBe("fail");
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("openai_api_key_missing");
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
    expect(codes).toContain("openai_api_auth_failed");
  });

  it("returns fail when network is unreachable", async () => {
    const transport = makeMockTransport({
      sendJson: vi.fn().mockRejectedValue(new HttpAdapterNetworkError("ENOTFOUND api.openai.com")),
    });
    const result = await testEnvironment(makeCtx(), transport);
    expect(result.status).toBe("fail");
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("openai_api_network_error");
  });

  it("returns fail on 500 server error", async () => {
    const transport = makeMockTransport({
      sendJson: vi.fn().mockRejectedValue(new HttpAdapterServerError("Internal Server Error")),
    });
    const result = await testEnvironment(makeCtx(), transport);
    expect(result.status).toBe("fail");
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("openai_api_probe_failed");
  });

  it("includes openai_api_key_present info check on success", async () => {
    const transport = makeMockTransport();
    const result = await testEnvironment(makeCtx(), transport);
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("openai_api_key_present");
  });
});

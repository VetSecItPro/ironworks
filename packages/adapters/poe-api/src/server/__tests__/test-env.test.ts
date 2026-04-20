import { describe, expect, it, vi } from "vitest";
import type { Transport } from "@ironworksai/adapter-utils/http/transport";
import { HttpAdapterAuthError, HttpAdapterNetworkError } from "@ironworksai/adapter-utils/http/errors";
import { testEnvironment } from "../test.js";

function makeMockTransport(overrides: Partial<Transport> = {}): Transport {
  return {
    sendJson: vi.fn().mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      body: { object: "list", data: [{ id: "claude-sonnet-4-6" }, { id: "gpt-4o" }] },
    }),
    sendJsonStream: vi.fn(),
    ...overrides,
  };
}

function makeCtx(configOverrides: Record<string, unknown> = {}) {
  return {
    adapterType: "poe_api" as const,
    config: { model: "claude-sonnet-4-6", apiKey: "sk-poe-validkey12345", ...configOverrides },
  };
}

describe("testEnvironment", () => {
  it("returns pass when GET /v1/models succeeds with valid key", async () => {
    const transport = makeMockTransport();
    const result = await testEnvironment(makeCtx(), transport);
    expect(result.status).toBe("pass");
    expect(result.adapterType).toBe("poe_api");
    expect(result.testedAt).toBeTruthy();
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("poe_api_models_ok");
  });

  it("returns fail when apiKey is missing", async () => {
    const transport = makeMockTransport();
    const result = await testEnvironment(makeCtx({ apiKey: undefined }), transport);
    expect(result.status).toBe("fail");
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("poe_api_key_missing");
    // Should not make network call without a key
    expect((transport.sendJson as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("returns fail on 401 auth error", async () => {
    const transport = makeMockTransport({
      sendJson: vi.fn().mockRejectedValue(new HttpAdapterAuthError("Invalid API key")),
    });
    const result = await testEnvironment(makeCtx(), transport);
    expect(result.status).toBe("fail");
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("poe_api_auth_failed");
  });

  it("returns fail when network is unreachable", async () => {
    const transport = makeMockTransport({
      sendJson: vi.fn().mockRejectedValue(new HttpAdapterNetworkError("ENOTFOUND api.poe.com")),
    });
    const result = await testEnvironment(makeCtx(), transport);
    expect(result.status).toBe("fail");
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("poe_api_network_error");
  });

  it("includes model count in info check when probe succeeds", async () => {
    const transport = makeMockTransport({
      sendJson: vi.fn().mockResolvedValue({
        status: 200,
        headers: {},
        body: { data: new Array(376).fill({ id: "some-model" }) },
      }),
    });
    const result = await testEnvironment(makeCtx(), transport);
    expect(result.status).toBe("pass");
    const info = result.checks.find((c) => c.code === "poe_api_models_ok");
    expect(info?.message).toMatch(/376/);
  });

  it("returns pass even when model count is zero (graceful degradation)", async () => {
    const transport = makeMockTransport({
      sendJson: vi.fn().mockResolvedValue({
        status: 200,
        headers: {},
        body: { data: [] },
      }),
    });
    const result = await testEnvironment(makeCtx(), transport);
    expect(result.status).toBe("pass");
  });
});

/**
 * G.8 — Kill-switch test for openrouter_api adapter.
 *
 * Why: operators need a zero-downtime way to disable a specific provider without
 * redeploying. The kill-switch env var is the escape hatch. Tests verify the pre-flight
 * guard fires before any network I/O (no transport calls should be made when disabled).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DISABLE_ENV_KEY = "ADAPTER_DISABLE_OPENROUTER_API";

describe("openrouter_api kill-switch (G.8)", () => {
  beforeEach(() => {
    delete process.env[DISABLE_ENV_KEY];
  });

  afterEach(() => {
    delete process.env[DISABLE_ENV_KEY];
    vi.resetModules();
  });

  it("testEnvironment returns fail when kill-switch is active", async () => {
    process.env[DISABLE_ENV_KEY] = "1";
    const { testEnvironment } = await import("../test.js");
    const mockTransport = { sendJson: vi.fn(), sendJsonStream: vi.fn() };
    const result = await testEnvironment(
      { adapterType: "openrouter_api", config: { apiKey: "sk-or-test" } },
      mockTransport as never,
    );
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.code === "openrouter_api_disabled")).toBe(true);
    expect(mockTransport.sendJson).not.toHaveBeenCalled();
  });

  it("testEnvironment proceeds normally when kill-switch is not set", async () => {
    // No ADAPTER_DISABLE_OPENROUTER_API set — should attempt network probe (will fail, that is ok)
    const { testEnvironment } = await import("../test.js");
    const mockTransport = {
      sendJson: vi.fn().mockRejectedValue(new Error("network unreachable")),
      sendJsonStream: vi.fn(),
    };
    const result = await testEnvironment({ adapterType: "openrouter_api", config: {} }, mockTransport as never);
    // Should NOT have the kill-switch check code
    expect(result.checks.every((c) => c.code !== "openrouter_api_disabled")).toBe(true);
  });

  it("execute returns disabled error when kill-switch is active", async () => {
    process.env[DISABLE_ENV_KEY] = "1";
    const { execute } = await import("../execute.js");
    const mockTransport = { sendJson: vi.fn(), sendJsonStream: vi.fn() };
    const ctx = {
      runId: "run-1",
      agent: { id: "a1", companyId: "c1", name: "Test", adapterType: "openrouter_api", adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { apiKey: "sk-or-test", model: "openai/gpt-oss-120b:free" },
      context: { taskId: "t1", issueId: "i1", wakeReason: "test", issueIds: [] },
      onLog: async () => {},
    };
    const result = await execute(ctx as never, mockTransport as never);
    expect(result.exitCode).toBe(1);
    expect(result.errorCode).toBe("openrouter_api_disabled");
    expect(mockTransport.sendJsonStream).not.toHaveBeenCalled();
  });

  it("execute proceeds normally when kill-switch is not set", async () => {
    // No kill-switch — should NOT return disabled error (it will fail on auth, that is ok)
    const { execute } = await import("../execute.js");
    const mockTransport = {
      sendJson: vi.fn(),
      sendJsonStream: vi.fn().mockRejectedValue(new Error("no network")),
    };
    const ctx = {
      runId: "run-1",
      agent: { id: "a1", companyId: "c1", name: "Test", adapterType: "openrouter_api", adapterConfig: {} },
      runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
      config: { apiKey: "sk-or-test", model: "openai/gpt-oss-120b:free" },
      context: { taskId: "t1", issueId: "i1", wakeReason: "test", issueIds: [] },
      onLog: async () => {},
    };
    const result = await execute(ctx as never, mockTransport as never);
    expect(result.errorCode).not.toBe("openrouter_api_disabled");
  });
});

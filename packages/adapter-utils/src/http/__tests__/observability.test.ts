import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetDefaultObserver,
  type AdapterCallEvent,
  createObserver,
  emitCallEvent,
  type TelemetrySink,
} from "../observability.js";

describe("createObserver (default stdout sink)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutWrite: ReturnType<typeof vi.spyOn<any, any>>;
  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });
  afterEach(() => stdoutWrite.mockRestore());

  it("emits one JSON line per event", () => {
    const observer = createObserver({ sink: "stdout" });
    observer.emit({
      timestamp: "2026-04-19T12:00:00Z",
      request_id: "req-123",
      workspace_id: "ws-abc",
      adapter_type: "poe_api",
      model: "claude-sonnet-4.6",
      duration_ms: 1234,
      status: "success",
      token_usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      cost_usd: 0.0005,
    });
    expect(stdoutWrite).toHaveBeenCalledTimes(1);
    const emitted = stdoutWrite.mock.calls[0][0] as string;
    expect(emitted).toMatch(/\n$/); // newline-terminated
    const parsed = JSON.parse(emitted.trim());
    expect(parsed.request_id).toBe("req-123");
    expect(parsed.status).toBe("success");
  });

  it("redacts potential secrets in event payload via the shared redactor", () => {
    const observer = createObserver({ sink: "stdout" });
    observer.emit({
      timestamp: "2026-04-19T12:00:00Z",
      request_id: "req-456",
      workspace_id: "ws-abc",
      adapter_type: "poe_api",
      model: "claude-sonnet-4.6",
      duration_ms: 100,
      status: "error",
      error_code: "auth_failed",
      error_detail: "Invalid key: Bearer sk-ant-secretvalue1234567", // should get scrubbed
    });
    const emitted = stdoutWrite.mock.calls[0][0] as string;
    expect(emitted).not.toContain("sk-ant-secretvalue1234567");
  });

  it("includes all required fields in the emitted JSON", () => {
    const observer = createObserver({ sink: "stdout" });
    observer.emit({
      timestamp: "2026-04-19T12:00:00Z",
      request_id: "req-789",
      workspace_id: "ws-xyz",
      adapter_type: "openai",
      model: "gpt-4",
      duration_ms: 500,
      status: "success",
      cache_hit: true,
      user_triggered_by: "user-001",
    });
    const emitted = stdoutWrite.mock.calls[0][0] as string;
    const parsed = JSON.parse(emitted.trim());
    expect(parsed.workspace_id).toBe("ws-xyz");
    expect(parsed.adapter_type).toBe("openai");
    expect(parsed.cache_hit).toBe(true);
    expect(parsed.user_triggered_by).toBe("user-001");
  });

  it("numeric fields survive redaction intact", () => {
    const observer = createObserver({ sink: "stdout" });
    observer.emit({
      timestamp: "2026-04-19T12:00:00Z",
      request_id: "req-numeric",
      workspace_id: "w",
      adapter_type: "poe_api",
      model: "x",
      duration_ms: 999,
      status: "success",
      cost_usd: 0.0315,
      token_usage: { promptTokens: 500, completionTokens: 1000, totalTokens: 1500 },
    });
    const emitted = stdoutWrite.mock.calls[0][0] as string;
    const parsed = JSON.parse(emitted.trim());
    expect(parsed.cost_usd).toBe(0.0315);
    expect(parsed.token_usage.totalTokens).toBe(1500);
    expect(parsed.duration_ms).toBe(999);
  });

  it("circular reference in context does not crash emit", () => {
    const observer = createObserver({ sink: "stdout" });
    const circular: Record<string, unknown> = { name: "outer" };
    circular.self = circular;
    expect(() => {
      observer.emit({
        timestamp: "2026-04-19T12:00:00Z",
        request_id: "req-circular",
        workspace_id: "w",
        adapter_type: "poe_api",
        model: "x",
        duration_ms: 0,
        status: "success",
        context: circular,
      });
    }).not.toThrow();
    // Either full event or degraded fallback was written
    expect(stdoutWrite).toHaveBeenCalled();
    const emitted = (stdoutWrite.mock.calls[0][0] as string).trim();
    const parsed = JSON.parse(emitted);
    expect(parsed.request_id).toBe("req-circular");
  });
});

describe("createObserver (none sink)", () => {
  it("is a no-op", () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const observer = createObserver({ sink: "none" });
    observer.emit({
      timestamp: "2026-04-19T12:00:00Z",
      request_id: "r",
      workspace_id: "w",
      adapter_type: "poe_api",
      model: "x",
      duration_ms: 0,
      status: "success",
    });
    expect(stdoutWrite).not.toHaveBeenCalled();
    stdoutWrite.mockRestore();
  });
});

/** Typed fetch mock that matches the `typeof fetch` signature for ObserverOptions. */
type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

describe("createObserver (http sink)", () => {
  it("POSTs events to the configured URL", async () => {
    const fetchSpy: FetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    const observer = createObserver({
      sink: "http:https://telemetry.example.com/collect",
      fetchImpl: fetchSpy,
    });
    observer.emit({
      timestamp: "2026-04-19T12:00:00Z",
      request_id: "req-1",
      workspace_id: "w",
      adapter_type: "poe_api",
      model: "x",
      duration_ms: 0,
      status: "success",
    });
    // emit is synchronous (fire-and-forget POST); flush waits for inflight
    await observer.flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://telemetry.example.com/collect");
    expect(init?.method).toBe("POST");
  });

  it("does not throw if the collector is unreachable", async () => {
    const fetchSpy: FetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    const observer = createObserver({
      sink: "http:https://telemetry.example.com/collect",
      fetchImpl: fetchSpy,
    });
    // Should not throw even when sink errors
    expect(() => {
      observer.emit({
        timestamp: "2026-04-19T12:00:00Z",
        request_id: "req-1",
        workspace_id: "w",
        adapter_type: "poe_api",
        model: "x",
        duration_ms: 0,
        status: "success",
      });
    }).not.toThrow();
    // flush may return the error for tests that care
    await expect(observer.flush()).resolves.toBeUndefined();
  });

  it("sends Content-Type application/json header and x-ironworks-source header", async () => {
    const fetchSpy: FetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    const observer = createObserver({
      sink: "http:https://telemetry.example.com/collect",
      fetchImpl: fetchSpy,
    });
    observer.emit({
      timestamp: "2026-04-19T12:00:00Z",
      request_id: "req-ct",
      workspace_id: "w",
      adapter_type: "poe_api",
      model: "x",
      duration_ms: 10,
      status: "success",
    });
    await observer.flush();
    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.headers).toMatchObject({
      "content-type": "application/json",
      "x-ironworks-source": "adapter-utils",
    });
  });

  it("drops events + warns when inflight Set exceeds cap", async () => {
    // Use a fetch that never resolves
    const pending: Array<(v: Response) => void> = [];
    const fetchSpy = vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve)));
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const observer = createObserver({
      sink: "http:https://telemetry.example.com/collect",
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    // Spam 300 events (cap is 256)
    for (let i = 0; i < 300; i++) {
      observer.emit({
        timestamp: new Date().toISOString(),
        request_id: `req-${i}`,
        workspace_id: "w",
        adapter_type: "poe_api",
        model: "x",
        duration_ms: 0,
        status: "success",
      });
    }
    // Only up to 256 should have been dispatched
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(256);
    // At least one stderr warning about dropping
    const warningFired = stderrWrite.mock.calls.some(
      (call) => (call[0] as string).includes("telemetry queue full") || (call[0] as string).includes("dropped"),
    );
    expect(warningFired).toBe(true);
    // Resolve pending to not leak
    // biome-ignore lint/suspicious/useIterableCallbackReturn: forEach side-effect, no return needed
    pending.forEach((r) => r(new Response("ok", { status: 200 })));
    await observer.flush();
    stderrWrite.mockRestore();
  });
});

describe("env-based observer (process.env.IRONWORKS_TELEMETRY_SINK)", () => {
  const origSink = process.env.IRONWORKS_TELEMETRY_SINK;
  afterEach(() => {
    if (origSink === undefined) delete process.env.IRONWORKS_TELEMETRY_SINK;
    else process.env.IRONWORKS_TELEMETRY_SINK = origSink;
    // Reset the module-level default observer so next test picks up env changes
    _resetDefaultObserver();
  });

  it("default (env unset) uses stdout sink", () => {
    delete process.env.IRONWORKS_TELEMETRY_SINK;
    _resetDefaultObserver();
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    emitCallEvent({
      timestamp: "2026-04-19T12:00:00Z",
      request_id: "r",
      workspace_id: "w",
      adapter_type: "poe_api",
      model: "x",
      duration_ms: 0,
      status: "success",
    });
    expect(stdoutWrite).toHaveBeenCalled();
    stdoutWrite.mockRestore();
  });

  it("env=none silences emit", () => {
    process.env.IRONWORKS_TELEMETRY_SINK = "none";
    _resetDefaultObserver();
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    emitCallEvent({
      timestamp: "2026-04-19T12:00:00Z",
      request_id: "r",
      workspace_id: "w",
      adapter_type: "poe_api",
      model: "x",
      duration_ms: 0,
      status: "success",
    });
    expect(stdoutWrite).not.toHaveBeenCalled();
    stdoutWrite.mockRestore();
  });

  it("invalid sink URL falls back to stdout with stderr warning", () => {
    process.env.IRONWORKS_TELEMETRY_SINK = "http:garbage";
    _resetDefaultObserver();
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    emitCallEvent({
      timestamp: "2026-04-19T12:00:00Z",
      request_id: "r",
      workspace_id: "w",
      adapter_type: "poe_api",
      model: "x",
      duration_ms: 0,
      status: "success",
    });
    // Warning was written to stderr at construction time
    expect(stderrWrite).toHaveBeenCalled();
    // Event went to stdout (fallback)
    expect(stdoutWrite).toHaveBeenCalled();
    stderrWrite.mockRestore();
    stdoutWrite.mockRestore();
  });
});

describe("AdapterCallEvent shape", () => {
  it("validates required fields present", () => {
    // This is a compile-time check via TypeScript; runtime assertion optional
    const minimal: AdapterCallEvent = {
      timestamp: "2026-04-19T12:00:00Z",
      request_id: "r",
      workspace_id: "w",
      adapter_type: "poe_api",
      model: "x",
      duration_ms: 0,
      status: "success",
    };
    expect(minimal).toBeDefined();
  });

  it("accepts all optional fields without type error", () => {
    const full: AdapterCallEvent = {
      timestamp: "2026-04-19T12:00:00Z",
      request_id: "req-full",
      workspace_id: "ws-full",
      adapter_type: "anthropic",
      model: "claude-opus-4",
      duration_ms: 2500,
      status: "error",
      token_usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      cost_usd: 0.0025,
      cache_hit: false,
      error_code: "rate_limit",
      error_detail: "Too many requests",
      user_triggered_by: "user-999",
      context: { run_id: "run-abc", pipeline: "test" },
    };
    expect(full.error_code).toBe("rate_limit");
  });
});

// Verify the TelemetrySink type accepts the documented values
describe("TelemetrySink type guard", () => {
  it("accepts stdout, none, and http: prefix", () => {
    const sinks: TelemetrySink[] = ["stdout", "none", "http:https://example.com"];
    expect(sinks).toHaveLength(3);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "../middleware/logger.js";

import { __resetAlerterStateForTests, postAlert } from "./alerter.js";

// Capture original env so we can restore it after each test — tests mutate
// IRONWORKS_ALERT_WEBHOOK_URL / IRONWORKS_ALERT_FORMAT and the singleton-reset
// setup file does not own this env surface.
const ORIGINAL_ENV = { ...process.env };

describe("postAlert", () => {
  beforeEach(() => {
    __resetAlerterStateForTests();
    delete process.env.IRONWORKS_ALERT_WEBHOOK_URL;
    delete process.env.IRONWORKS_ALERT_FORMAT;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("no-ops when IRONWORKS_ALERT_WEBHOOK_URL is unset", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));
    await postAlert({ severity: "warn", source: "test", message: "hello" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("wraps event in Slack-compatible payload by default", async () => {
    process.env.IRONWORKS_ALERT_WEBHOOK_URL = "https://example.com/hook";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));

    await postAlert({ severity: "error", source: "uncaught", message: "boom", details: { foo: 1 } });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://example.com/hook");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    expect(typeof body.text).toBe("string");
    expect(body.text).toContain("uncaught");
    expect(body.text).toContain("boom");
    // Severity tag should appear in the text so multi-line Slack rendering still
    // surfaces it without requiring blocks support.
    expect(body.text.toLowerCase()).toContain("error");
  });

  it("posts raw AlertEvent JSON when IRONWORKS_ALERT_FORMAT=raw", async () => {
    process.env.IRONWORKS_ALERT_WEBHOOK_URL = "https://example.com/hook";
    process.env.IRONWORKS_ALERT_FORMAT = "raw";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));

    await postAlert({ severity: "warn", source: "heap-monitor", message: "snapshot" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]![1];
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({ severity: "warn", source: "heap-monitor", message: "snapshot" });
    // Raw mode must NOT add the Slack `text` wrapper.
    expect(body.text).toBeUndefined();
  });

  it("rate-limits a second alert with same (source, severity) within the 5min window", async () => {
    process.env.IRONWORKS_ALERT_WEBHOOK_URL = "https://example.com/hook";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));

    await postAlert({ severity: "warn", source: "heap-monitor", message: "first" });
    await postAlert({ severity: "warn", source: "heap-monitor", message: "second" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("allows alert from a different source within the rate-limit window", async () => {
    process.env.IRONWORKS_ALERT_WEBHOOK_URL = "https://example.com/hook";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));

    await postAlert({ severity: "warn", source: "heap-monitor", message: "first" });
    await postAlert({ severity: "warn", source: "uncaught", message: "different source" });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("allows alert with same source but different severity within window", async () => {
    process.env.IRONWORKS_ALERT_WEBHOOK_URL = "https://example.com/hook";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));

    await postAlert({ severity: "warn", source: "heap-monitor", message: "first" });
    await postAlert({ severity: "error", source: "heap-monitor", message: "escalated" });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("logs warn but does not throw when fetch fails", async () => {
    process.env.IRONWORKS_ALERT_WEBHOOK_URL = "https://example.com/hook";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined as never);

    await expect(postAlert({ severity: "error", source: "uncaught", message: "boom" })).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("logs warn but does not throw when fetch returns non-2xx", async () => {
    process.env.IRONWORKS_ALERT_WEBHOOK_URL = "https://example.com/hook";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined as never);

    await expect(postAlert({ severity: "warn", source: "test", message: "x" })).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("passes an AbortSignal to fetch so a slow webhook is bounded", async () => {
    process.env.IRONWORKS_ALERT_WEBHOOK_URL = "https://example.com/hook";

    // Capture the signal handed to fetch. The 5s deadline is enforced by
    // Node's built-in AbortSignal.timeout — exercising the full 5s wall-clock
    // wait in a unit test is wasteful and flaky. Instead we assert the
    // contract: a fetch-level signal is wired up. The behavioural failure
    // path (abort surfaces as rejection, gets logged-not-thrown) is already
    // covered by the "fetch failure logs warn but does not throw" case above.
    let capturedSignal: AbortSignal | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation((_url: string | URL | Request, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return Promise.resolve(new Response("", { status: 200 }));
    });

    await postAlert({ severity: "warn", source: "test", message: "slow" });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });
});

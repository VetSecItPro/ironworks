import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _resetAllForTesting, checkAndIncrement, resetCounter, snapshot } from "../daily-quota.js";

const ENV_KEY = "OPENROUTER_API_DAILY_AGENT_CAP";

describe("daily-quota", () => {
  beforeEach(() => {
    _resetAllForTesting();
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    _resetAllForTesting();
    delete process.env[ENV_KEY];
  });

  it("first call increments to 1 and is allowed", () => {
    const r = checkAndIncrement("agent-1");
    expect(r.allowed).toBe(true);
    expect(r.countToday).toBe(1);
  });

  it("subsequent calls increment monotonically", () => {
    checkAndIncrement("agent-1");
    checkAndIncrement("agent-1");
    const r = checkAndIncrement("agent-1");
    expect(r.allowed).toBe(true);
    expect(r.countToday).toBe(3);
  });

  it("blocks at the configured cap", () => {
    process.env[ENV_KEY] = "3";
    expect(checkAndIncrement("agent-1").allowed).toBe(true); // 1
    expect(checkAndIncrement("agent-1").allowed).toBe(true); // 2
    expect(checkAndIncrement("agent-1").allowed).toBe(true); // 3
    const r = checkAndIncrement("agent-1");
    expect(r.allowed).toBe(false);
    expect(r.countToday).toBe(3);
    expect(r.cap).toBe(3);
  });

  it("cap=0 disables the limiter entirely", () => {
    process.env[ENV_KEY] = "0";
    for (let i = 0; i < 10_000; i++) {
      const r = checkAndIncrement("agent-1");
      expect(r.allowed).toBe(true);
    }
  });

  it("null agentId bypasses the limiter (for adhoc test calls)", () => {
    process.env[ENV_KEY] = "1";
    expect(checkAndIncrement(null).allowed).toBe(true);
    expect(checkAndIncrement(null).allowed).toBe(true);
    expect(checkAndIncrement(null).allowed).toBe(true);
  });

  it("counts are independent per agent", () => {
    process.env[ENV_KEY] = "2";
    checkAndIncrement("a"); // a=1
    checkAndIncrement("a"); // a=2
    expect(checkAndIncrement("a").allowed).toBe(false);
    // b is independent — still under cap
    expect(checkAndIncrement("b").allowed).toBe(true);
    expect(checkAndIncrement("b").allowed).toBe(true);
    expect(checkAndIncrement("b").allowed).toBe(false);
  });

  it("resetCounter clears one agent without affecting others", () => {
    process.env[ENV_KEY] = "1";
    checkAndIncrement("a"); // a=1, capped
    checkAndIncrement("b"); // b=1, capped
    expect(checkAndIncrement("a").allowed).toBe(false);
    resetCounter("a");
    expect(checkAndIncrement("a").allowed).toBe(true);
    // b is untouched
    expect(checkAndIncrement("b").allowed).toBe(false);
  });

  it("snapshot reports current counters", () => {
    checkAndIncrement("a");
    checkAndIncrement("b");
    checkAndIncrement("a");
    const snap = snapshot();
    expect(snap.find((s) => s.agentId === "a")?.count).toBe(2);
    expect(snap.find((s) => s.agentId === "b")?.count).toBe(1);
  });

  it("invalid env var falls back to default cap", () => {
    process.env[ENV_KEY] = "not-a-number";
    const r = checkAndIncrement("agent-1");
    expect(r.cap).toBeGreaterThan(0); // default
  });
});

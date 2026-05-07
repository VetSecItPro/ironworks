import { describe, expect, it } from "vitest";
import { isGeminiTurnLimitResult, isGeminiUnknownSessionError, parseGeminiJsonl } from "./parse.js";

describe("parseGeminiJsonl", () => {
  it("extracts session id, assistant text, and usage from result events", () => {
    const stdout = [
      JSON.stringify({
        type: "assistant",
        session_id: "sess_1",
        message: { content: [{ type: "output_text", text: "hello from gemini" }] },
      }),
      JSON.stringify({
        type: "result",
        session_id: "sess_1",
        usage: { input_tokens: 50, cached_input_tokens: 10, output_tokens: 20 },
        total_cost_usd: 0.005,
      }),
    ].join("\n");

    const parsed = parseGeminiJsonl(stdout);
    expect(parsed.sessionId).toBe("sess_1");
    expect(parsed.summary).toBe("hello from gemini");
    expect(parsed.usage).toEqual({ inputTokens: 50, cachedInputTokens: 10, outputTokens: 20 });
    expect(parsed.costUsd).toBeCloseTo(0.005, 6);
    expect(parsed.errorMessage).toBeNull();
  });

  it("captures error messages from error events", () => {
    const stdout = JSON.stringify({ type: "error", error: { message: "model busy" } });
    const parsed = parseGeminiJsonl(stdout);
    expect(parsed.errorMessage).toBe("model busy");
  });

  it("survives blank and malformed lines", () => {
    const parsed = parseGeminiJsonl("\n  \nnot json\n");
    expect(parsed.sessionId).toBeNull();
    expect(parsed.summary).toBe("");
  });
});

describe("isGeminiUnknownSessionError", () => {
  it("matches resume-failure phrases on stdout or stderr", () => {
    expect(isGeminiUnknownSessionError("unknown session", "")).toBe(true);
    expect(isGeminiUnknownSessionError("", "checkpoint xyz not found")).toBe(true);
    expect(isGeminiUnknownSessionError("failed to resume", "")).toBe(true);
  });

  it("returns false for unrelated output", () => {
    expect(isGeminiUnknownSessionError("ok", "ok")).toBe(false);
  });
});

describe("isGeminiTurnLimitResult", () => {
  it("returns true when exit code is 53", () => {
    expect(isGeminiTurnLimitResult(null, 53)).toBe(true);
  });

  it("matches turn_limit / max_turns status fields", () => {
    expect(isGeminiTurnLimitResult({ status: "turn_limit" })).toBe(true);
    expect(isGeminiTurnLimitResult({ status: "MAX_TURNS" })).toBe(true);
  });

  it("matches turn-limit phrasing in error fields", () => {
    expect(isGeminiTurnLimitResult({ error: "exceeded maximum turns" })).toBe(true);
  });

  it("returns false for unrelated payloads", () => {
    expect(isGeminiTurnLimitResult({ status: "ok" })).toBe(false);
    expect(isGeminiTurnLimitResult(null)).toBe(false);
  });
});

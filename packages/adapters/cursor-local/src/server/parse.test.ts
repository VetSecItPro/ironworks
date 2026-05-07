import { describe, expect, it } from "vitest";
import { isCursorUnknownSessionError, parseCursorJsonl } from "./parse.js";

describe("parseCursorJsonl", () => {
  it("extracts session id, assistant text, usage, and cost from a result event", () => {
    const stdout = [
      JSON.stringify({
        type: "assistant",
        session_id: "sess_1",
        message: { content: [{ type: "output_text", text: "hi from cursor" }] },
      }),
      JSON.stringify({
        type: "result",
        session_id: "sess_1",
        usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 6 },
        total_cost_usd: 0.0012,
      }),
    ].join("\n");

    const parsed = parseCursorJsonl(stdout);
    expect(parsed.sessionId).toBe("sess_1");
    expect(parsed.summary).toBe("hi from cursor");
    expect(parsed.usage).toEqual({ inputTokens: 10, cachedInputTokens: 4, outputTokens: 6 });
    expect(parsed.costUsd).toBeCloseTo(0.0012, 6);
    expect(parsed.errorMessage).toBeNull();
  });

  it("captures error messages from is_error result events", () => {
    const stdout = JSON.stringify({
      type: "result",
      session_id: "sess_2",
      is_error: true,
      error: { message: "model unavailable" },
    });
    const parsed = parseCursorJsonl(stdout);
    expect(parsed.errorMessage).toBe("model unavailable");
  });

  it("ignores blank and malformed lines without throwing", () => {
    const parsed = parseCursorJsonl("\n   \nnot json\n");
    expect(parsed.sessionId).toBeNull();
    expect(parsed.summary).toBe("");
    expect(parsed.usage).toEqual({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
  });
});

describe("isCursorUnknownSessionError", () => {
  it("matches resume-failure phrases on stdout or stderr", () => {
    expect(isCursorUnknownSessionError("unknown session", "")).toBe(true);
    expect(isCursorUnknownSessionError("", "chat sess_xyz not found")).toBe(true);
    expect(isCursorUnknownSessionError("could not resume", "")).toBe(true);
  });

  it("returns false for unrelated output", () => {
    expect(isCursorUnknownSessionError("everything fine", "no errors")).toBe(false);
  });
});

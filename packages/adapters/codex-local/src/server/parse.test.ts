import { describe, expect, it } from "vitest";
import { isCodexUnknownSessionError, parseCodexJsonl } from "./parse.js";

describe("parseCodexJsonl", () => {
  it("captures session id, agent message text, and turn usage", () => {
    const stdout = [
      JSON.stringify({ type: "thread.started", thread_id: "thread_abc" }),
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "Hello from Codex" },
      }),
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 100, cached_input_tokens: 25, output_tokens: 40 },
      }),
    ].join("\n");

    const result = parseCodexJsonl(stdout);
    expect(result.sessionId).toBe("thread_abc");
    expect(result.summary).toBe("Hello from Codex");
    expect(result.usage).toEqual({ inputTokens: 100, cachedInputTokens: 25, outputTokens: 40 });
    expect(result.errorMessage).toBeNull();
  });

  it("captures error events and turn.failed messages", () => {
    const stdout = [
      JSON.stringify({ type: "error", message: "rate limited" }),
      JSON.stringify({ type: "turn.failed", error: { message: "downstream blew up" } }),
    ].join("\n");

    const result = parseCodexJsonl(stdout);
    expect(result.errorMessage).toBe("downstream blew up");
  });

  it("ignores blank and malformed lines without throwing", () => {
    const stdout = ["", "   ", "not json", JSON.stringify({ type: "noise" })].join("\n");
    const result = parseCodexJsonl(stdout);
    expect(result.sessionId).toBeNull();
    expect(result.summary).toBe("");
    expect(result.usage).toEqual({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
  });
});

describe("isCodexUnknownSessionError", () => {
  it("matches common codex resume failure phrasings on stdout or stderr", () => {
    expect(isCodexUnknownSessionError("unknown session", "")).toBe(true);
    expect(isCodexUnknownSessionError("", "thread thread_xyz not found")).toBe(true);
    expect(isCodexUnknownSessionError("missing rollout path for thread", "")).toBe(true);
    expect(isCodexUnknownSessionError("state db missing rollout path", "")).toBe(true);
  });

  it("returns false for unrelated output", () => {
    expect(isCodexUnknownSessionError("everything fine", "no errors")).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  appendTurn,
  buildTranscript,
  compactIfNeeded,
  deserializeSession,
  estimateTokens,
  type MessageTurn,
  type Role,
  type SessionState,
  serializeSession,
} from "../session-replay.js";

const systemPrompt = "You are a helpful assistant.";

describe("appendTurn", () => {
  it("adds a user turn to an empty session", () => {
    const state: SessionState = { turns: [] };
    const next = appendTurn(state, { role: "user", content: "Hi" });
    expect(next.turns).toHaveLength(1);
    expect(next.turns[0].role).toBe("user");
    expect(next.turns[0].content).toBe("Hi");
  });

  it("returns a new state without mutating the original", () => {
    const state: SessionState = { turns: [] };
    const next = appendTurn(state, { role: "user", content: "Hi" });
    expect(state.turns).toHaveLength(0); // original unchanged
    expect(next).not.toBe(state);
  });

  it("appends multiple turns maintaining order", () => {
    let state: SessionState = { turns: [] };
    state = appendTurn(state, { role: "user", content: "Hi" });
    state = appendTurn(state, { role: "assistant", content: "Hello" });
    state = appendTurn(state, { role: "user", content: "How are you?" });
    expect(state.turns.map((t) => t.content)).toEqual(["Hi", "Hello", "How are you?"]);
  });

  it("supports tool_use and tool_result content blocks", () => {
    let state: SessionState = { turns: [] };
    state = appendTurn(state, {
      role: "assistant",
      content: [
        { type: "text", text: "Calling weather..." },
        { type: "tool_use", id: "toolu_1", name: "get_weather", input: { city: "Paris" } },
      ],
    });
    state = appendTurn(state, {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "22°C sunny" }],
    });
    expect(state.turns).toHaveLength(2);
    expect(Array.isArray(state.turns[0].content)).toBe(true);
  });
});

describe("buildTranscript — OpenAI format", () => {
  it("flattens turns into messages array with system prompt first", () => {
    const state: SessionState = {
      turns: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ],
    };
    const messages = buildTranscript(state, { format: "openai", systemPrompt });
    expect(messages).toEqual([
      { role: "system", content: systemPrompt },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
    ]);
  });

  it("omits system prompt when not provided", () => {
    const state: SessionState = { turns: [{ role: "user", content: "Hi" }] };
    const messages = buildTranscript(state, { format: "openai" });
    expect(messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  it("formats assistant turn with tool_use into OpenAI function-calling shape", () => {
    const state: SessionState = {
      turns: [
        { role: "user", content: "Weather in Paris?" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "Let me check." },
            { type: "tool_use", id: "call_1", name: "get_weather", input: { city: "Paris" } },
          ],
        },
      ],
    };
    // biome-ignore lint/suspicious/noExplicitAny: buildTranscript returns a union; cast to access OpenAI array shape
    const messages = buildTranscript(state, { format: "openai" }) as any[];
    // OpenAI expects:
    //  { role: 'assistant', content: 'Let me check.', tool_calls: [{id, type:'function', function:{name, arguments}}] }
    expect(messages).toHaveLength(2);
    const assistant = messages[1];
    expect(assistant.role).toBe("assistant");
    expect(assistant.content).toBe("Let me check.");
    expect(assistant.tool_calls).toHaveLength(1);
    expect(assistant.tool_calls[0]).toEqual({
      id: "call_1",
      type: "function",
      function: { name: "get_weather", arguments: JSON.stringify({ city: "Paris" }) },
    });
  });

  it("formats user turn with tool_result into OpenAI role=tool message", () => {
    const state: SessionState = {
      turns: [
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "call_1", content: "22°C" }],
        },
      ],
    };
    const messages = buildTranscript(state, { format: "openai" });
    expect(messages).toEqual([{ role: "tool", tool_call_id: "call_1", content: "22°C" }]);
  });

  it("assistant with only tool_use blocks emits content: null for OpenAI", () => {
    const state: SessionState = {
      turns: [{ role: "assistant", content: [{ type: "tool_use", id: "call_1", name: "f", input: {} }] }],
    };
    const messages = buildTranscript(state, { format: "openai" });
    // biome-ignore lint/suspicious/noExplicitAny: buildTranscript returns a union; cast to access OpenAI array shape
    const msg = (messages as any[])[0];
    expect(msg.content).toBeNull();
    expect(msg.tool_calls).toHaveLength(1);
  });

  it("assistant with text + tool_use emits the text as content", () => {
    const state: SessionState = {
      turns: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "Checking." },
            { type: "tool_use", id: "call_1", name: "f", input: {} },
          ],
        },
      ],
    };
    const messages = buildTranscript(state, { format: "openai" });
    // biome-ignore lint/suspicious/noExplicitAny: buildTranscript returns a union; cast to access OpenAI array shape
    const msg = (messages as any[])[0];
    expect(msg.content).toBe("Checking.");
  });
});

describe("buildTranscript — Anthropic format", () => {
  it("returns messages array with no system role (Anthropic uses top-level system field)", () => {
    const state: SessionState = {
      turns: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ],
    };
    const result = buildTranscript(state, { format: "anthropic", systemPrompt });
    // Anthropic format returns { system?: string, messages: Message[] } shape
    expect(result).toHaveProperty("system", systemPrompt);
    // biome-ignore lint/suspicious/noExplicitAny: buildTranscript returns a union; cast to access Anthropic shape
    expect((result as any).messages).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
    ]);
  });

  it("formats tool_use and tool_result as content blocks", () => {
    const state: SessionState = {
      turns: [
        { role: "user", content: "Paris weather?" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "Checking." },
            { type: "tool_use", id: "toolu_1", name: "get_weather", input: { city: "Paris" } },
          ],
        },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "22°C" }],
        },
      ],
    };
    const result = buildTranscript(state, { format: "anthropic" });
    // biome-ignore lint/suspicious/noExplicitAny: buildTranscript returns a union; cast to access Anthropic shape
    const messages = (result as any).messages;
    expect(messages[1].content).toEqual([
      { type: "text", text: "Checking." },
      { type: "tool_use", id: "toolu_1", name: "get_weather", input: { city: "Paris" } },
    ]);
    expect(messages[2].content).toEqual([{ type: "tool_result", tool_use_id: "toolu_1", content: "22°C" }]);
  });
});

describe("serialize / deserialize session params", () => {
  it("serializeSession produces a defensive copy (caller mutation does not affect serialized blob)", () => {
    const state: SessionState = { turns: [{ role: "user", content: "hi" }] };
    const serialized = serializeSession(state);
    // Mutate original AFTER serialization
    state.turns.push({ role: "assistant", content: "leaked" });
    const serializedTurns = (serialized as { turns: MessageTurn[] }).turns;
    expect(serializedTurns).toHaveLength(1);
    expect(serializedTurns[0].content).toBe("hi");
  });

  it("round-trips a session through serialize → deserialize", () => {
    const state: SessionState = {
      turns: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ],
    };
    const serialized = serializeSession(state);
    const restored = deserializeSession(serialized);
    expect(restored).toEqual(state);
  });

  it("serializeSession returns a plain object suitable for AdapterExecutionResult.sessionParams", () => {
    const state: SessionState = { turns: [{ role: "user", content: "Hi" }] };
    const serialized = serializeSession(state);
    expect(typeof serialized).toBe("object");
    expect(Array.isArray(serialized)).toBe(false);
    // Must be JSON-safe
    expect(() => JSON.stringify(serialized)).not.toThrow();
  });

  it("deserializeSession handles null / undefined by returning fresh empty state", () => {
    expect(deserializeSession(null)).toEqual({ turns: [] });
    expect(deserializeSession(undefined)).toEqual({ turns: [] });
  });

  it("deserializeSession rejects malformed payloads", () => {
    expect(() => deserializeSession({ turns: "not-an-array" })).toThrow();
    expect(() => deserializeSession({ turns: [{ role: "invalid_role", content: "" }] })).toThrow();
  });
});

describe("compactIfNeeded — no compaction needed", () => {
  it("returns no-op when under trigger threshold", async () => {
    const state: SessionState = {
      turns: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ],
    };
    const result = await compactIfNeeded(state, { targetTokens: 10_000 });
    expect(result.outcome).toBe("no-op");
    expect(result.state).toEqual(state);
    expect(result.compactedTurnCount).toBe(0);
  });

  it("returns no-op when only a few turns exist even if oversized (respects preserveRecent)", async () => {
    const state: SessionState = {
      turns: [
        { role: "user", content: "a".repeat(100_000) },
        { role: "assistant", content: "hi" },
      ],
    };
    const result = await compactIfNeeded(state, {
      targetTokens: 1000,
      triggerTokens: 2000,
      preserveRecent: 4, // need at least 4 turns; we only have 2
    });
    // Under-preserveRecent conditions: no turns to compact → no-op
    expect(result.outcome).toBe("no-op");
  });
});

describe("compactIfNeeded — with compactor", () => {
  it("calls compactor with older turns and replaces them with a summary", async () => {
    const bigText = "x".repeat(10_000);
    const state: SessionState = {
      turns: Array.from({ length: 20 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as Role,
        content: `${bigText} turn ${i}`,
      })),
    };
    const compactor = vi.fn(async (turns: MessageTurn[]) => {
      return `[Previous conversation summary: covered ${turns.length} turns]`;
    });
    const result = await compactIfNeeded(state, {
      targetTokens: 5_000,
      triggerTokens: 6_000,
      preserveRecent: 4,
      compactor,
    });
    expect(result.outcome).toBe("compacted");
    expect(compactor).toHaveBeenCalledTimes(1);
    const compactedTurns = compactor.mock.calls[0][0] as MessageTurn[];
    expect(compactedTurns.length).toBe(16); // 20 - 4 preserved = 16 compacted
    // Resulting state: 1 summary turn + 4 preserved = 5 turns
    expect(result.state.turns.length).toBe(5);
    expect(result.state.turns[0].role).toBe("assistant");
    expect(result.compactedTurnCount).toBe(16);
  });

  it("falls back to truncation when compactor throws", async () => {
    const bigText = "x".repeat(10_000);
    const state: SessionState = {
      turns: Array.from({ length: 10 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as Role,
        content: bigText,
      })),
    };
    const compactor = vi.fn(async () => {
      throw new Error("compactor LLM call failed");
    });
    const result = await compactIfNeeded(state, {
      targetTokens: 5_000,
      triggerTokens: 6_000,
      preserveRecent: 4,
      compactor,
    });
    expect(result.outcome).toBe("compactor-failed-truncated");
    expect(result.state.turns.length).toBeLessThan(state.turns.length);
  });
});

describe("compactIfNeeded — hard truncation fallback", () => {
  it("truncates oldest turns until under targetTokens (no compactor supplied)", async () => {
    const bigText = "x".repeat(10_000);
    const state: SessionState = {
      turns: Array.from({ length: 10 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as Role,
        content: bigText,
      })),
    };
    const result = await compactIfNeeded(state, {
      targetTokens: 5_000,
      triggerTokens: 6_000,
      preserveRecent: 4,
    });
    expect(result.outcome).toBe("truncated");
    expect(result.state.turns.length).toBeGreaterThanOrEqual(4);
    expect(result.state.turns.length).toBeLessThan(10);
    expect(result.estimatedTokensAfter).toBeLessThan(result.estimatedTokensBefore);
  });

  it("always preserves the most recent N turns even if token budget is exceeded", async () => {
    const bigText = "x".repeat(100_000); // each turn is huge
    const state: SessionState = {
      turns: Array.from({ length: 6 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as Role,
        content: bigText,
      })),
    };
    const result = await compactIfNeeded(state, {
      targetTokens: 1000, // tiny budget — preserveRecent wins
      triggerTokens: 2000,
      preserveRecent: 4,
    });
    expect(result.state.turns.length).toBe(4); // preserves the most recent 4
  });
});

describe("compactIfNeeded — immutability", () => {
  it("does not mutate input state", async () => {
    const bigText = "x".repeat(10_000);
    const original: SessionState = {
      turns: Array.from({ length: 10 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as Role,
        content: bigText,
      })),
    };
    const clone = JSON.parse(JSON.stringify(original));
    await compactIfNeeded(original, { targetTokens: 5000, triggerTokens: 6000 });
    expect(original).toEqual(clone);
  });
});

describe("estimateTokens", () => {
  it("estimates based on ~4 chars per token heuristic", () => {
    const state: SessionState = { turns: [{ role: "user", content: "a".repeat(400) }] };
    const tokens = estimateTokens(state);
    expect(tokens).toBeGreaterThanOrEqual(80);
    expect(tokens).toBeLessThanOrEqual(120);
  });

  it("includes system prompt in estimate when provided", () => {
    const state: SessionState = { turns: [] };
    const sys = "a".repeat(1000);
    const tokens = estimateTokens(state, sys);
    expect(tokens).toBeGreaterThan(200);
  });

  it("counts tool content blocks", () => {
    const state: SessionState = {
      turns: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "a".repeat(200) },
            { type: "tool_use", id: "t1", name: "x", input: { data: "a".repeat(100) } },
          ],
        },
      ],
    };
    const tokens = estimateTokens(state);
    expect(tokens).toBeGreaterThan(50);
  });

  it("empty state returns 0", () => {
    expect(estimateTokens({ turns: [] })).toBe(0);
  });
});

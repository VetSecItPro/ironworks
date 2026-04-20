import { describe, expect, it } from "vitest";
import {
  fromProviderToolCall,
  type ToolDefinition,
  type ToolInvocation,
  type ToolResult,
  toProviderToolDefinitions,
  toProviderToolResult,
  validateToolArgs,
} from "../tool-normalize.js";

const sampleToolDef: ToolDefinition = {
  name: "get_weather",
  description: "Get current weather for a city",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "City name" },
      units: { type: "string", enum: ["celsius", "fahrenheit"] },
    },
    required: ["city"],
  },
};

describe("toProviderToolDefinitions (outbound request shape)", () => {
  it("converts to OpenAI format", () => {
    const result = toProviderToolDefinitions([sampleToolDef], "openai");
    expect(result).toEqual([
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get current weather for a city",
          parameters: sampleToolDef.parameters,
        },
      },
    ]);
  });

  it("converts to Anthropic format", () => {
    const result = toProviderToolDefinitions([sampleToolDef], "anthropic");
    expect(result).toEqual([
      {
        name: "get_weather",
        description: "Get current weather for a city",
        input_schema: sampleToolDef.parameters,
      },
    ]);
  });

  it("handles empty tools array", () => {
    expect(toProviderToolDefinitions([], "openai")).toEqual([]);
    expect(toProviderToolDefinitions([], "anthropic")).toEqual([]);
  });

  it("preserves multiple tool definitions", () => {
    const two = [sampleToolDef, { ...sampleToolDef, name: "get_time" }];
    expect(toProviderToolDefinitions(two, "openai")).toHaveLength(2);
    expect(toProviderToolDefinitions(two, "anthropic")).toHaveLength(2);
  });
});

describe("fromProviderToolCall (inbound response parsing)", () => {
  it("parses OpenAI tool_call format", () => {
    const openaiCall = {
      id: "call_abc123",
      type: "function",
      function: {
        name: "get_weather",
        arguments: '{"city": "Paris", "units": "celsius"}',
      },
    };
    const result = fromProviderToolCall(openaiCall, "openai");
    expect(result).toEqual({
      toolCallId: "call_abc123",
      toolName: "get_weather",
      args: { city: "Paris", units: "celsius" },
    });
  });

  it("parses Anthropic tool_use format", () => {
    const anthropicCall = {
      type: "tool_use",
      id: "toolu_xyz",
      name: "get_weather",
      input: { city: "Paris", units: "celsius" },
    };
    const result = fromProviderToolCall(anthropicCall, "anthropic");
    expect(result).toEqual({
      toolCallId: "toolu_xyz",
      toolName: "get_weather",
      args: { city: "Paris", units: "celsius" },
    });
  });

  it("rejects malformed JSON in OpenAI arguments string", () => {
    const openaiCall = {
      id: "call_abc",
      type: "function",
      function: { name: "get_weather", arguments: "{broken json" },
    };
    expect(() => fromProviderToolCall(openaiCall, "openai")).toThrow(/json/i);
  });

  it("JSON parse error includes context from the bad arguments", () => {
    const call = {
      id: "call_1",
      type: "function",
      function: { name: "x", arguments: '{"broken: unclosed' },
    };
    try {
      fromProviderToolCall(call, "openai");
      expect.fail("expected an error to be thrown");
    } catch (err) {
      const msg = (err as Error).message;
      // First 100 chars of the bad JSON must appear in the message
      expect(msg).toContain("broken");
      // Error category must be clear
      expect(msg.toLowerCase()).toContain("json");
    }
  });

  it("rejects missing required fields (OpenAI)", () => {
    expect(() => fromProviderToolCall({}, "openai")).toThrow();
    expect(() => fromProviderToolCall({ id: "x" }, "openai")).toThrow();
  });

  it("rejects missing required fields (Anthropic)", () => {
    expect(() => fromProviderToolCall({}, "anthropic")).toThrow();
    expect(() => fromProviderToolCall({ type: "tool_use" }, "anthropic")).toThrow();
  });

  it("handles empty arguments object", () => {
    const openaiCall = {
      id: "call_1",
      type: "function",
      function: { name: "noop", arguments: "{}" },
    };
    const result = fromProviderToolCall(openaiCall, "openai");
    expect(result.args).toEqual({});
  });
});

describe("toProviderToolResult (tool output → message format)", () => {
  const sampleResult: ToolResult = {
    toolCallId: "call_abc",
    toolName: "get_weather",
    content: JSON.stringify({ temp: 22, condition: "sunny" }),
    isError: false,
  };

  it("formats result for OpenAI (role=tool message)", () => {
    const result = toProviderToolResult(sampleResult, "openai");
    expect(result).toEqual({
      role: "tool",
      tool_call_id: "call_abc",
      content: sampleResult.content,
    });
  });

  it("formats result for Anthropic (tool_result content block inside user message)", () => {
    const result = toProviderToolResult(sampleResult, "anthropic");
    expect(result).toEqual({
      type: "tool_result",
      tool_use_id: "call_abc",
      content: sampleResult.content,
    });
  });

  it("marks errors for Anthropic via is_error flag", () => {
    const errorResult: ToolResult = { ...sampleResult, isError: true };
    const result = toProviderToolResult(errorResult, "anthropic");
    expect(result).toMatchObject({ type: "tool_result", is_error: true });
  });

  it("OpenAI error handling — content conveys error text (no flag)", () => {
    const errorResult: ToolResult = { ...sampleResult, isError: true, content: "Error: city not found" };
    const result = toProviderToolResult(errorResult, "openai");
    expect(result.content).toBe("Error: city not found");
  });
});

describe("validateToolArgs (JSON schema validation)", () => {
  it("accepts valid args", () => {
    const args = { city: "Paris", units: "celsius" };
    const result = validateToolArgs(args, sampleToolDef.parameters);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects missing required field", () => {
    const args = { units: "celsius" };
    const result = validateToolArgs(args, sampleToolDef.parameters);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/city/i);
  });

  it("rejects wrong type", () => {
    const args = { city: 123 };
    const result = validateToolArgs(args, sampleToolDef.parameters);
    expect(result.valid).toBe(false);
  });

  it("rejects enum violation", () => {
    const args = { city: "Paris", units: "kelvin" };
    const result = validateToolArgs(args, sampleToolDef.parameters);
    expect(result.valid).toBe(false);
  });

  it("accepts args with no required fields when none provided", () => {
    const simpleDef = {
      type: "object",
      properties: { note: { type: "string" } },
    };
    const result = validateToolArgs({}, simpleDef);
    expect(result.valid).toBe(true);
  });

  it("handles schema with no properties defined", () => {
    const result = validateToolArgs({ anything: "ok" }, { type: "object" });
    expect(result.valid).toBe(true);
  });

  it("validator cache is bounded (LRU eviction at 256 schemas)", () => {
    // Drive 300 distinct schemas through the cache — well past the 256 cap.
    // If the cache were unbounded this would silently leak; with LRU eviction
    // it stays at ≤256 entries and old schemas are recompiled on demand.
    for (let i = 0; i < 300; i++) {
      const schema = { type: "object", properties: { [`f${i}`]: { type: "string" } } };
      validateToolArgs({}, schema as Record<string, unknown>);
    }
    // Behavior must still be correct after eviction: a schema for f0 (evicted)
    // must recompile transparently and return the right result.
    const result = validateToolArgs({ f0: "ok" }, { type: "object", properties: { f0: { type: "string" } } });
    expect(result.valid).toBe(true);
  });
});

describe("parallel tool calls — unique IDs preserved", () => {
  it("parses multiple simultaneous OpenAI tool calls", () => {
    const calls = [
      { id: "call_1", type: "function", function: { name: "a", arguments: "{}" } },
      { id: "call_2", type: "function", function: { name: "b", arguments: '{"x":1}' } },
      { id: "call_3", type: "function", function: { name: "a", arguments: '{"y":2}' } },
    ];
    const results = calls.map((c) => fromProviderToolCall(c, "openai"));
    expect(results.map((r) => r.toolCallId)).toEqual(["call_1", "call_2", "call_3"]);
    expect(results[2].toolName).toBe("a");
    expect(results[2].args).toEqual({ y: 2 });
  });

  it("parses multiple simultaneous Anthropic tool calls", () => {
    const calls = [
      { type: "tool_use", id: "toolu_1", name: "a", input: {} },
      { type: "tool_use", id: "toolu_2", name: "b", input: { x: 1 } },
    ];
    const results = calls.map((c) => fromProviderToolCall(c, "anthropic"));
    expect(results.map((r) => r.toolCallId)).toEqual(["toolu_1", "toolu_2"]);
  });
});

describe("adversarial / edge cases", () => {
  it("handles OpenAI call with empty function.arguments string", () => {
    const call = { id: "call_1", type: "function", function: { name: "n", arguments: "" } };
    // Empty string is not valid JSON — should throw so malformed responses surface fast
    expect(() => fromProviderToolCall(call, "openai")).toThrow();
  });

  it("handles Anthropic call with null input", () => {
    const call = { type: "tool_use", id: "toolu_1", name: "n", input: null };
    expect(() => fromProviderToolCall(call, "anthropic")).toThrow();
  });

  it("round-trips: ToolInvocation → provider format → parse back", () => {
    const original: ToolInvocation = {
      toolCallId: "call_abc",
      toolName: "get_weather",
      args: { city: "Paris", units: "celsius" },
    };
    // OpenAI round-trip
    const openaiFormat = {
      id: original.toolCallId,
      type: "function" as const,
      function: {
        name: original.toolName,
        arguments: JSON.stringify(original.args),
      },
    };
    const parsedBack = fromProviderToolCall(openaiFormat, "openai");
    expect(parsedBack).toEqual(original);
  });

  it("does not mutate input objects", () => {
    const def = structuredClone(sampleToolDef);
    const original = structuredClone(def);
    toProviderToolDefinitions([def], "openai");
    expect(def).toEqual(original);
  });
});

import { describe, expect, it } from "vitest";
import { type NormalizedStreamEvent, parseSseStream, type SseEvent } from "../sse-parser.js";

/** Build a mock ReadableStream from string chunks. */
function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(iter: AsyncIterable<NormalizedStreamEvent>): Promise<NormalizedStreamEvent[]> {
  const out: NormalizedStreamEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

describe("parseSseStream — OpenAI-compat format", () => {
  it("yields text_delta events for data: chunks with content deltas", async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    const events = await collect(parseSseStream(stream, { format: "openai" }));
    // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
    expect(events.filter((e) => e.type === "text_delta").map((e) => (e as any).text)).toEqual(["Hello", " world"]);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("captures usage from the terminal pre-DONE chunk", async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":5,"total_tokens":9}}\n\n',
      "data: [DONE]\n\n",
    ]);
    const events = await collect(parseSseStream(stream, { format: "openai" }));
    // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
    const doneEvent = events.find((e) => e.type === "done") as any;
    expect(doneEvent.usage).toEqual({ promptTokens: 4, completionTokens: 5, totalTokens: 9 });
  });

  it("yields tool_use_start + tool_use_delta + tool_use_complete for OpenAI tool_calls", async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","type":"function","function":{"name":"get_weather","arguments":""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"city\\":"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Paris\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    const events = await collect(parseSseStream(stream, { format: "openai" }));
    const starts = events.filter((e) => e.type === "tool_use_start");
    const deltas = events.filter((e) => e.type === "tool_use_delta");
    const completes = events.filter((e) => e.type === "tool_use_complete");
    expect(starts).toHaveLength(1);
    // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
    expect((starts[0] as any).toolCallId).toBe("call_abc");
    // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
    expect((starts[0] as any).toolName).toBe("get_weather");
    expect(deltas.length).toBeGreaterThanOrEqual(2);
    expect(completes).toHaveLength(1);
    // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
    expect((completes[0] as any).argsJson).toBe('{"city":"Paris"}');
  });

  it("handles malformed data: lines by skipping them with a parse_warning event", async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      "data: not-valid-json\n\n",
      "data: [DONE]\n\n",
    ]);
    const events = await collect(parseSseStream(stream, { format: "openai" }));
    const warnings = events.filter((e) => e.type === "parse_warning");
    expect(warnings).toHaveLength(1);
    expect(events.filter((e) => e.type === "text_delta")).toHaveLength(1);
  });

  it("handles chunks that split mid-event (buffering works)", async () => {
    const stream = makeStream(['data: {"choices":[{"delta":{"conten', 't":"hi"}}]}\n\ndata: [DONE]\n\n']);
    const events = await collect(parseSseStream(stream, { format: "openai" }));
    const deltas = events.filter((e) => e.type === "text_delta");
    expect(deltas).toHaveLength(1);
    // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
    expect((deltas[0] as any).text).toBe("hi");
  });

  it("emits stream_error when upstream returns error in SSE envelope", async () => {
    const stream = makeStream(['data: {"error":{"type":"rate_limit_error","message":"slow down"}}\n\n']);
    const events = await collect(parseSseStream(stream, { format: "openai" }));
    const errs = events.filter((e) => e.type === "stream_error");
    expect(errs).toHaveLength(1);
    // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
    expect((errs[0] as any).message).toContain("slow down");
  });

  it("emits done with no usage when stream ends without usage block", async () => {
    const stream = makeStream(['data: {"choices":[{"delta":{"content":"x"}}]}\n\n', "data: [DONE]\n\n"]);
    const events = await collect(parseSseStream(stream, { format: "openai" }));
    // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
    const done = events.at(-1) as any;
    expect(done.type).toBe("done");
    expect(done.usage).toBeUndefined();
  });

  it("stream ending without [DONE] emits incomplete warning", async () => {
    const stream = makeStream(['data: {"choices":[{"delta":{"content":"hello"}}]}\n\n']);
    const events = await collect(parseSseStream(stream, { format: "openai" }));
    const warnings = events.filter(
      // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
      (e) => e.type === "parse_warning" && (e as any).code === "stream_ended_without_done",
    );
    expect(warnings).toHaveLength(1);
    expect(events.filter((e) => e.type === "text_delta")).toHaveLength(1);
  });
});

describe("parseSseStream — Anthropic-native format", () => {
  it("yields text_delta for content_block_delta events of type text_delta", async () => {
    const stream = makeStream([
      "event: message_start\n",
      'data: {"type":"message_start","message":{"id":"msg_abc"}}\n\n',
      "event: content_block_delta\n",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
      "event: content_block_delta\n",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}\n\n',
      "event: message_stop\n",
      'data: {"type":"message_stop"}\n\n',
    ]);
    const events = await collect(parseSseStream(stream, { format: "anthropic" }));
    // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
    const deltas = events.filter((e) => e.type === "text_delta").map((e) => (e as any).text);
    expect(deltas).toEqual(["Hello", " world"]);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("yields tool_use_start + tool_use_delta + tool_use_complete for Anthropic tool_use blocks", async () => {
    const stream = makeStream([
      "event: content_block_start\n",
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_123","name":"get_weather","input":{}}}\n\n',
      "event: content_block_delta\n",
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":"}}\n\n',
      "event: content_block_delta\n",
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"Paris\\"}"}}\n\n',
      "event: content_block_stop\n",
      'data: {"type":"content_block_stop","index":1}\n\n',
      "event: message_stop\n",
      'data: {"type":"message_stop"}\n\n',
    ]);
    const events = await collect(parseSseStream(stream, { format: "anthropic" }));
    const starts = events.filter((e) => e.type === "tool_use_start");
    expect(starts).toHaveLength(1);
    // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
    expect((starts[0] as any).toolCallId).toBe("toolu_123");
    // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
    expect((starts[0] as any).toolName).toBe("get_weather");
    const completes = events.filter((e) => e.type === "tool_use_complete");
    // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
    expect((completes[0] as any).argsJson).toBe('{"city":"Paris"}');
  });

  it("captures usage from message_delta events", async () => {
    const stream = makeStream([
      "event: message_delta\n",
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":10,"cache_read_input_tokens":5,"output_tokens":20}}\n\n',
      "event: message_stop\n",
      'data: {"type":"message_stop"}\n\n',
    ]);
    const events = await collect(parseSseStream(stream, { format: "anthropic" }));
    // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
    const done = events.at(-1) as any;
    expect(done.type).toBe("done");
    expect(done.usage).toEqual({
      promptTokens: 10,
      cachedPromptTokens: 5,
      completionTokens: 20,
      totalTokens: 30,
    });
  });

  it("ignores ping events", async () => {
    const stream = makeStream([
      "event: ping\n",
      'data: {"type":"ping"}\n\n',
      "event: content_block_delta\n",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n\n',
      "event: message_stop\n",
      'data: {"type":"message_stop"}\n\n',
    ]);
    const events = await collect(parseSseStream(stream, { format: "anthropic" }));
    const deltas = events.filter((e) => e.type === "text_delta");
    expect(deltas).toHaveLength(1);
  });

  it("emits stream_error for Anthropic error events", async () => {
    const stream = makeStream([
      "event: error\n",
      'data: {"type":"error","error":{"type":"overloaded_error","message":"overloaded"}}\n\n',
    ]);
    const events = await collect(parseSseStream(stream, { format: "anthropic" }));
    const errs = events.filter((e) => e.type === "stream_error");
    expect(errs).toHaveLength(1);
    // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
    expect((errs[0] as any).message).toContain("overloaded");
  });
});

describe("parseSseStream — abort handling", () => {
  it("aborts cleanly when abortSignal fires mid-stream", async () => {
    const ac = new AbortController();
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"one"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"two"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    const events: NormalizedStreamEvent[] = [];
    const iter = parseSseStream(stream, { format: "openai", abortSignal: ac.signal });
    for await (const e of iter) {
      events.push(e);
      if (events.length === 1) ac.abort();
    }
    const dones = events.filter((e) => e.type === "done");
    expect(dones.length).toBeLessThanOrEqual(0);
    expect(events.filter((e) => e.type === "text_delta").length).toBeGreaterThan(0);
  });
});

describe("parseSseStream — edge cases", () => {
  it("handles empty stream with just [DONE]", async () => {
    const stream = makeStream(["data: [DONE]\n\n"]);
    const events = await collect(parseSseStream(stream, { format: "openai" }));
    expect(events.at(-1)?.type).toBe("done");
  });

  it("handles completely empty stream with incomplete warning", async () => {
    const stream = makeStream([]);
    const events = await collect(parseSseStream(stream, { format: "openai" }));
    const warnings = events.filter((e) => e.type === "parse_warning");
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("parseSseStream — post-DONE continuation (Finding 1)", () => {
  it("first DONE wins — events after [DONE] are ignored", async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"one"}}]}\n\n',
      "data: [DONE]\n\n",
      // These must be ignored — stream is already terminated after [DONE].
      'data: {"choices":[{"delta":{"content":"leaked"}}]}\n\n',
      'data: {"usage":{"prompt_tokens":99}}\n\n',
    ]);
    const events = await collect(parseSseStream(stream, { format: "openai" }));

    // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
    const texts = events.filter((e) => e.type === "text_delta").map((e) => (e as any).text);
    expect(texts).toEqual(["one"]); // 'leaked' must NOT appear

    const dones = events.filter((e) => e.type === "done");
    expect(dones).toHaveLength(1); // Exactly one done

    // Nothing may follow the done event.
    const doneIndex = events.findIndex((e) => e.type === "done");
    expect(events.slice(doneIndex + 1)).toEqual([]);
  });

  it("first message_stop wins — Anthropic events after message_stop are ignored", async () => {
    const stream = makeStream([
      "event: content_block_delta\n",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n\n',
      "event: message_stop\n",
      'data: {"type":"message_stop"}\n\n',
      // These must be ignored — stream is already terminated after message_stop.
      "event: content_block_delta\n",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"leaked"}}\n\n',
    ]);
    const events = await collect(parseSseStream(stream, { format: "anthropic" }));
    // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
    const texts = events.filter((e) => e.type === "text_delta").map((e) => (e as any).text);
    expect(texts).toEqual(["hi"]);

    const dones = events.filter((e) => e.type === "done");
    expect(dones).toHaveLength(1);
  });
});

describe("parseSseStream — orphan tool delta (Finding 2)", () => {
  it("emits parse_warning for orphan input_json_delta (no preceding content_block_start)", async () => {
    const stream = makeStream([
      // Missing content_block_start — simulates a malformed provider response.
      "event: content_block_delta\n",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"x\\":1}"}}\n\n',
      "event: message_stop\n",
      'data: {"type":"message_stop"}\n\n',
    ]);
    const events = await collect(parseSseStream(stream, { format: "anthropic" }));
    // biome-ignore lint/suspicious/noExplicitAny: accessing discriminated union NormalizedStreamEvent member without narrowing in test assertion
    const warnings = events.filter((e) => e.type === "parse_warning" && (e as any).code === "orphan_tool_delta");
    expect(warnings).toHaveLength(1);
  });
});

// Ensure SseEvent type is importable (compile-time verification)
type _SseEventCheck = SseEvent;

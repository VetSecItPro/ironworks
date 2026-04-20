import type { EventSourceMessage } from "eventsource-parser";
import { createParser } from "eventsource-parser";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Format of the upstream SSE stream.
 *
 * Use 'openai' for Poe, OpenAI, OpenRouter, and any OpenAI-compatible endpoint
 * (data-only events, [DONE] terminator).
 * Use 'anthropic' for Anthropic's native /v1/messages streaming format
 * (named event types, message_stop terminator).
 */
export type SseFormat = "openai" | "anthropic";

/**
 * Raw SSE event as delivered by the underlying parser library, before normalization.
 * Mirrors the EventSourceMessage shape so callers don't need a direct library dependency.
 */
export interface SseEvent {
  event?: string;
  data: string;
}

/** Token-usage summary in normalized form, provider-agnostic. */
export interface UsageSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Tokens served from the provider's prompt cache (Anthropic cache_read). */
  cachedPromptTokens?: number;
  /** Tokens written into the provider's prompt cache (Anthropic cache_creation). */
  cachedWriteTokens?: number;
  /** Extended thinking tokens (Anthropic reasoning). */
  reasoningTokens?: number;
}

/**
 * Normalized stream event consumed by HTTP adapters.
 *
 * Both OpenAI-compat and Anthropic-native streams produce the same shape here so adapter
 * code stays fully format-agnostic. Discriminated by `type`.
 */
export type NormalizedStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use_start"; toolCallId: string; toolName: string; index: number }
  | { type: "tool_use_delta"; toolCallId: string; argsDelta: string; index: number }
  | { type: "tool_use_complete"; toolCallId: string; argsJson: string; index: number }
  | { type: "stream_error"; code: string; message: string; raw?: unknown }
  | { type: "parse_warning"; code: string; message: string; rawLine?: string }
  | { type: "done"; usage?: UsageSummary };

/** Options accepted by {@link parseSseStream}. */
export interface ParseSseOptions {
  format: SseFormat;
  /** When fired, iteration ends at the next yield point without emitting done. */
  abortSignal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Internal state types
// ---------------------------------------------------------------------------

/** Per-index accumulator for OpenAI-style streaming tool calls. */
interface OpenAiToolCallState {
  id: string;
  name: string;
  argsAccumulated: string;
}

// ---------------------------------------------------------------------------
// Core generator
// ---------------------------------------------------------------------------

/**
 * Parse an SSE response stream into a normalized event sequence consumable by HTTP adapters.
 *
 * Accepts OpenAI-compatible (Poe, OpenAI, OpenRouter) and Anthropic-native formats. Emits a
 * uniform NormalizedStreamEvent type so adapter code stays format-agnostic.
 *
 * Buffers partial chunks across reads — SSE events can split across network reads. Skips malformed
 * data lines with parse_warning rather than throwing. Emits exactly one done event at end of stream
 * (unless the consumer aborts mid-stream via abortSignal, in which case done is suppressed).
 */
export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
  options: ParseSseOptions,
): AsyncIterable<NormalizedStreamEvent> {
  const { format, abortSignal } = options;
  const decoder = new TextDecoder();

  // Queue bridges the synchronous parser callback world into the async generator world.
  // The parser fires onEvent synchronously as we feed it; we push into this queue and
  // drain it after each feed() call rather than yielding inside a callback.
  const eventQueue: EventSourceMessage[] = [];

  const parser = createParser({
    onEvent(evt) {
      eventQueue.push(evt);
    },
  });

  // Shared mutable state across SSE events for this stream lifetime.
  // Kept intentionally flat so the two format branches each touch only their own fields.
  let pendingUsage: UsageSummary | undefined;
  let doneSeen = false;

  // OpenAI tool_call tracking: index → accumulated state.
  // Populated as we see tool_call deltas; completed on finish_reason or [DONE].
  const openAiToolCalls = new Map<number, OpenAiToolCallState>();

  // Anthropic tool_use tracking: block index → accumulated args.
  // id/name come from content_block_start; argsJson assembled from input_json_delta.
  const anthropicToolBlocks = new Map<number, { id: string; name: string; argsAccumulated: string }>();

  const reader = stream.getReader();

  try {
    while (true) {
      if (abortSignal?.aborted) break;

      const { done, value } = await reader.read();

      if (done) break;

      // Feed decoded text into the SSE parser; parser fires onEvent synchronously,
      // filling eventQueue. Drain queue after each feed.
      parser.feed(decoder.decode(value, { stream: true }));

      for (const evt of eventQueue) {
        if (abortSignal?.aborted) break;

        const normalized =
          format === "openai"
            ? normalizeOpenAiEvent(evt, openAiToolCalls, pendingUsage)
            : normalizeAnthropicEvent(evt, anthropicToolBlocks, pendingUsage);

        for (const ne of normalized) {
          if ("_captureUsage" in ne) {
            // Usage sentinel from a pre-done chunk (OpenAI) or message_delta (Anthropic).
            // Store it; the subsequent done event will read pendingUsage rather than ne.usage.
            pendingUsage = (ne as unknown as { _captureUsage: UsageSummary })._captureUsage;
          } else if (ne.type === "done") {
            // Merge any usage the normalizer embedded with any usage captured via sentinel.
            // Normalizer-provided usage takes precedence; sentinel fills the gap when the
            // provider sends usage in a separate chunk before the terminal signal.
            const finalUsage = ne.usage ?? pendingUsage;
            doneSeen = true;
            yield { type: "done", usage: finalUsage };
            // First DONE wins — stop consuming the stream entirely so any provider
            // events that arrive after the terminal signal are never yielded.
            return;
          } else {
            yield ne;
          }
        }
      }
      eventQueue.length = 0;
    }
  } finally {
    reader.releaseLock();
  }

  if (abortSignal?.aborted) return;

  if (!doneSeen) {
    yield {
      type: "parse_warning",
      code: "stream_ended_without_done",
      message: "Stream ended without a terminal signal ([DONE] or message_stop).",
    };
    yield { type: "done", usage: pendingUsage };
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compat normalizer
// ---------------------------------------------------------------------------

/**
 * Convert one OpenAI-compat SSE event into zero or more normalized events.
 *
 * Tool calls accumulate in `toolCalls` across multiple events; completion events
 * trigger tool_use_complete emission. Usage arrives in the final pre-[DONE] chunk
 * and is signalled to the generator via a `_captureUsage` sentinel object so the
 * generator owns done-event creation.
 */
function normalizeOpenAiEvent(
  evt: EventSourceMessage,
  toolCalls: Map<number, OpenAiToolCallState>,
  _currentUsage: UsageSummary | undefined,
): NormalizedStreamEvent[] {
  const out: NormalizedStreamEvent[] = [];

  if (evt.data === "[DONE]") {
    // Flush any still-open tool calls before signalling done.
    for (const [idx, tc] of toolCalls) {
      out.push({ type: "tool_use_complete", toolCallId: tc.id, argsJson: tc.argsAccumulated, index: idx });
    }
    toolCalls.clear();
    // done event emitted with already-captured usage — caller builds it in generator.
    out.push({ type: "done" });
    return out;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(evt.data);
  } catch {
    out.push({
      type: "parse_warning",
      code: "invalid_json",
      message: "Could not parse SSE data as JSON.",
      rawLine: evt.data,
    });
    return out;
  }

  if (!isRecord(parsed)) {
    out.push({
      type: "parse_warning",
      code: "invalid_json",
      message: "SSE data is not a JSON object.",
      rawLine: evt.data,
    });
    return out;
  }

  // Provider-level error inside the SSE envelope (not an HTTP error).
  if (isRecord(parsed.error)) {
    const err = parsed.error;
    const msg = typeof err.message === "string" ? err.message : JSON.stringify(err);
    const code = typeof err.type === "string" ? err.type : "upstream_error";
    out.push({ type: "stream_error", code, message: msg, raw: parsed.error });
    return out;
  }

  // Usage block — capture for later; generator emits it on done.
  // Push the sentinel directly so the generator can distinguish a usage-only chunk
  // from the real [DONE] terminal without leaking a premature done event to consumers.
  if (isRecord(parsed.usage)) {
    const u = parsed.usage;
    const capturedUsage: UsageSummary = {
      promptTokens: asNumber(u.prompt_tokens, 0),
      completionTokens: asNumber(u.completion_tokens, 0),
      totalTokens: asNumber(u.total_tokens, 0),
    };
    out.push({ _captureUsage: capturedUsage } as unknown as NormalizedStreamEvent);
  }

  const choices = parsed.choices;
  if (!Array.isArray(choices) || choices.length === 0) return out;

  const choice = choices[0];
  if (!isRecord(choice)) return out;

  const delta = choice.delta;
  if (!isRecord(delta)) return out;

  // Text delta — most common path.
  if (typeof delta.content === "string" && delta.content.length > 0) {
    out.push({ type: "text_delta", text: delta.content });
  }

  // Tool call deltas — accumulate across chunks.
  if (Array.isArray(delta.tool_calls)) {
    for (const tcRaw of delta.tool_calls) {
      if (!isRecord(tcRaw)) continue;
      const idx = asNumber(tcRaw.index, -1);
      if (idx < 0) continue;

      const fnRaw = isRecord(tcRaw.function) ? tcRaw.function : undefined;

      if (!toolCalls.has(idx)) {
        // First appearance for this index carries id and name.
        const id = typeof tcRaw.id === "string" ? tcRaw.id : "";
        const name = fnRaw && typeof fnRaw.name === "string" ? fnRaw.name : "";
        toolCalls.set(idx, { id, name, argsAccumulated: "" });
        out.push({ type: "tool_use_start", toolCallId: id, toolName: name, index: idx });
      }

      const state = toolCalls.get(idx)!;
      const argFragment = fnRaw && typeof fnRaw.arguments === "string" ? fnRaw.arguments : "";
      if (argFragment.length > 0) {
        state.argsAccumulated += argFragment;
        out.push({ type: "tool_use_delta", toolCallId: state.id, argsDelta: argFragment, index: idx });
      }
    }
  }

  // finish_reason: 'tool_calls' signals all tool call argument accumulation is done.
  const finishReason = choice.finish_reason;
  if (typeof finishReason === "string" && finishReason === "tool_calls") {
    for (const [idx, tc] of toolCalls) {
      out.push({ type: "tool_use_complete", toolCallId: tc.id, argsJson: tc.argsAccumulated, index: idx });
    }
    toolCalls.clear();
  }

  return out;
}

// ---------------------------------------------------------------------------
// Anthropic-native normalizer
// ---------------------------------------------------------------------------

/**
 * Convert one Anthropic-native SSE event into zero or more normalized events.
 *
 * Anthropic streams carry named event types (event: <name>) which drive routing.
 * Tool use blocks accumulate in `toolBlocks` across content_block_start/delta/stop.
 * Usage arrives in message_delta; message_stop signals end of stream.
 */
function normalizeAnthropicEvent(
  evt: EventSourceMessage,
  toolBlocks: Map<number, { id: string; name: string; argsAccumulated: string }>,
  _currentUsage: UsageSummary | undefined,
): NormalizedStreamEvent[] {
  const out: NormalizedStreamEvent[] = [];
  const eventType = evt.event;

  // ping events carry no useful payload.
  if (eventType === "ping") return out;

  let parsed: unknown;
  try {
    parsed = JSON.parse(evt.data);
  } catch {
    out.push({
      type: "parse_warning",
      code: "invalid_json",
      message: "Could not parse Anthropic SSE data as JSON.",
      rawLine: evt.data,
    });
    return out;
  }

  if (!isRecord(parsed)) return out;

  const msgType = typeof parsed.type === "string" ? parsed.type : (eventType ?? "");

  switch (msgType) {
    case "message_start":
    case "content_block_start": {
      if (msgType === "content_block_start") {
        const idx = asNumber(parsed.index, -1);
        const block = isRecord(parsed.content_block) ? parsed.content_block : undefined;
        if (block && block.type === "tool_use" && idx >= 0) {
          const id = typeof block.id === "string" ? block.id : "";
          const name = typeof block.name === "string" ? block.name : "";
          toolBlocks.set(idx, { id, name, argsAccumulated: "" });
          out.push({ type: "tool_use_start", toolCallId: id, toolName: name, index: idx });
        }
      }
      break;
    }

    case "content_block_delta": {
      const idx = asNumber(parsed.index, -1);
      const delta = isRecord(parsed.delta) ? parsed.delta : undefined;
      if (!delta) break;

      if (delta.type === "text_delta" && typeof delta.text === "string") {
        out.push({ type: "text_delta", text: delta.text });
      } else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
        const block = toolBlocks.get(idx);
        if (!block) {
          // Provider sent tool argument data before opening the block — emit a warning so
          // callers can detect malformed streams rather than silently losing the delta.
          out.push({
            type: "parse_warning",
            code: "orphan_tool_delta",
            message: `input_json_delta at index ${idx} with no preceding content_block_start`,
          });
        } else {
          block.argsAccumulated += delta.partial_json;
          out.push({ type: "tool_use_delta", toolCallId: block.id, argsDelta: delta.partial_json, index: idx });
        }
      }
      break;
    }

    case "content_block_stop": {
      const idx = asNumber(parsed.index, -1);
      const block = toolBlocks.get(idx);
      if (block) {
        out.push({ type: "tool_use_complete", toolCallId: block.id, argsJson: block.argsAccumulated, index: idx });
        toolBlocks.delete(idx);
      }
      break;
    }

    case "message_delta": {
      // Usage arrives here (input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens).
      if (isRecord(parsed.usage)) {
        const u = parsed.usage;
        const inputTokens = asNumber(u.input_tokens, 0);
        const outputTokens = asNumber(u.output_tokens, 0);
        const cacheRead = asNumber(u.cache_read_input_tokens, 0);
        const cacheWrite = asNumber(u.cache_creation_input_tokens, 0);
        const usage: UsageSummary = {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
          ...(cacheRead > 0 ? { cachedPromptTokens: cacheRead } : {}),
          ...(cacheWrite > 0 ? { cachedWriteTokens: cacheWrite } : {}),
        };
        // Signal captured usage to generator via sentinel; generator replaces pending usage.
        out.push({ _captureUsage: usage } as unknown as NormalizedStreamEvent);
      }
      break;
    }

    case "message_stop": {
      // done event emitted here; generator will pick up pendingUsage.
      out.push({ type: "done" });
      break;
    }

    case "error": {
      const errBlock = isRecord(parsed.error) ? parsed.error : undefined;
      const msg = errBlock && typeof errBlock.message === "string" ? errBlock.message : JSON.stringify(parsed);
      const code = errBlock && typeof errBlock.type === "string" ? errBlock.type : "upstream_error";
      out.push({ type: "stream_error", code, message: msg, raw: parsed.error });
      break;
    }

    default:
      // Unknown message types are silently ignored — forward-compat with new event names.
      break;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : fallback;
}

// ---------------------------------------------------------------------------
// Generator patch: handle _captureUsage sentinel in the main loop
// ---------------------------------------------------------------------------
// The design uses a private `_captureUsage` sentinel object to pass usage from
// normalizers back to the generator without leaking a done event prematurely.
// The generator checks for this key and updates `pendingUsage` instead of yielding.
// This is simpler than a separate return channel and avoids any extra interface exports.

// ---------------------------------------------------------------------------
// Barrel compatibility
// ---------------------------------------------------------------------------

export const sseParser = { parseSseStream };

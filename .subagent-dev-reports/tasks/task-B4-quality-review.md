AGENT: quality-reviewer
TASK: B.4
VERDICT: PASS

STRENGTHS:
- State machine per-index Map is correct. Duplicate index on a new tool call correctly clobbers the old entry (first chunk sets id/name; no guard needed since parallel tool calls with the same index are a provider bug, not ours).
- Normalizer separation is clean: `normalizeOpenAiEvent` and `normalizeAnthropicEvent` are pure functions that accept state maps and return `NormalizedStreamEvent[]`. Both are directly unit-testable without touching the generator. Tests do cover them via `parseSseStream` which is fine given the clean separation.
- Generator yields as chunks arrive (for-await-of over reader.read(); drains eventQueue synchronously after each feed). No whole-stream buffering. Backpressure is correct.
- Reader released in `finally` block - covers normal end, abort AND exception paths. Verified.
- No AbortSignal `addEventListener`/`removeEventListener` calls exist; the signal is checked by polling `abortSignal?.aborted` inside the loop. No listener leak possible. Clean.
- Ping events filtered at the top of `normalizeAnthropicEvent` before any JSON.parse - no pollution.
- `isRecord` / `asNumber` helpers properly narrow unknown without any casts that leak through to callers.
- Cross-chunk buffering delegated entirely to eventsource-parser's `feed()` - `\n\n` boundary straddling handled automatically. Test confirms it.
- [DONE] terminator is handled first in `normalizeOpenAiEvent` before JSON.parse - correct.

CRITICAL: none

IMPORTANT:
- Content-before-tool_use_start (Anthropic): `input_json_delta` on an unknown index silently drops the data (`toolBlocks.get(idx)` returns undefined, delta is discarded). This is defensive-correct behavior but has no `parse_warning` emitted, so the consumer gets a silent data loss. Should emit a `parse_warning` with `code: 'orphan_tool_delta'` if `block` is undefined.
- Same-index duplicate tool_call (OpenAI parallel function calling): if two logical tool calls happen to share an index (malformed provider), the second `tool_use_start` is silently suppressed (the `!toolCalls.has(idx)` guard skips it) while its args accumulate into the first tool's state. Should emit a `parse_warning` in this case.
- `_captureUsage` sentinel uses `as unknown as NormalizedStreamEvent` cast with a push-then-pop dance to avoid emitting a premature `done`. The approach works but the push/pop at lines 237-242 is fragile cargo-cult: the `done` is pushed and immediately popped before the sentinel is pushed. This can be simplified to just pushing the sentinel directly, removing the push/pop altogether.

MINOR:
- `_currentUsage` parameter on both normalizers is unused (prefixed `_` appropriately). Could be removed entirely since the generator owns pendingUsage. Minor dead param.
- No test for two concurrent tool calls at different indexes (parallel function calling). The state-per-index design handles it correctly but coverage is absent.
- No adversarial test for usage arriving AFTER [DONE] (OpenAI sends usage in same chunk as [DONE] sometimes). Current code processes usage from the same chunk before the [DONE] sentinel check because the usage block `isRecord(parsed.usage)` check comes before the `evt.data === '[DONE]'` check... actually [DONE] check is first in the function, so any usage on the same "event" as [DONE] would require a separate event. This is correct.
- Anthropic `message_stop` without preceding content emits `done` cleanly via `normalizeAnthropicEvent` returning `[{ type: 'done' }]`. The generator picks it up. Confirmed correct.

ADVERSARIAL_NOTES:
- Malformed JSON mid-stream: caught, emits `parse_warning`, returns, generator continues cleanly. State maps unaffected. PASS.
- [DONE] then more events: `doneSeen` is set true on the first `done` yield. However, after yielding `done` the generator does NOT break - it continues iterating. Subsequent events after [DONE] WILL be processed and yielded. The [DONE] normalizer path returns early from `normalizeOpenAiEvent` for the [DONE] event itself, but if the provider sends more data: lines after [DONE], they will be parsed and yielded as additional events after the `done` event. This violates the spec ("first DONE wins"). FIX: after `doneSeen = true` and yielding `done`, break out of both inner and outer loops, or set a flag that causes the outer loop to stop feeding. This is the most significant behavioral gap found.
- Usage after [DONE]: same issue as above - would be processed. Mitigated by the above fix recommendation.
- `message_stop` without content: emits `done` cleanly. PASS.
- Interleaved tool calls (different indexes): Map keyed by index handles these independently. PASS.

READER_RELEASE_VERIFIED: YES
ABORT_LISTENER_CLEAN: YES
MEMORY_BOUNDED: YES (argsAccumulated is string concat, no theoretical bound but the provider controls input size; no internal amplification)
OUTPUT: .subagent-dev-reports/tasks/task-B4-quality-review.md

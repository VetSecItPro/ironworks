---
AGENT: combined-reviewer
TASK: B.12
FILE: packages/adapter-utils/src/http/session-replay.ts
---

## SPEC_VERDICT: PASS

## QUALITY_VERDICT: PASS (with one important note)

---

## STRENGTHS

- All five required exports present: `appendTurn`, `buildTranscript`, `serializeSession`, `deserializeSession`, `estimateTokens`.
- All five required types exported: `Role`, `ContentBlock`, `MessageTurn`, `SessionState`, `TranscriptFormat`.
- `sessionReplay` namespace barrel present and correct.
- `appendTurn` is fully immutable — spreads `state.turns` into a new array, returns new object.
- OpenAI transcript: system injected first, `tool_use` → `tool_calls` array with JSON-stringified arguments, `tool_result` → `role: 'tool'` message. All correct.
- Anthropic transcript: returns `{ system?, messages }` shape; content blocks pass through unchanged. Correct.
- `serializeSession` returns `{ turns: state.turns }` — plain object, JSON-safe.
- `deserializeSession` handles `null`/`undefined` returning `{ turns: [] }`, rejects non-object, rejects non-array `turns`, rejects invalid roles. Throws loudly.
- `estimateTokens` covers text, tool_use (name + serialized input), and tool_result blocks. Uses `Math.ceil(chars / 4)`. Returns 0 for empty state.
- 15 test cases — count met and well distributed.

---

## CRITICAL

None.

---

## IMPORTANT

**1. `serializeSession` shares the `turns` array reference (shallow copy risk)**

```ts
// Line 151 — current implementation
return { turns: state.turns };
```

The returned object holds the same array reference as the input `SessionState`. If the caller later mutates `state.turns` (e.g., by appending in a non-immutable path outside this module), the serialized blob mutates too. Spec says "returns JSON-safe plain object" but a shared reference is a latent mutation bug.

Fix — deep-copy the turns:
```ts
return { turns: state.turns.map(t => ({ ...t })) };
```
or use `JSON.parse(JSON.stringify(...))` for full depth. The shallow spread is sufficient in practice since `appendTurn` never mutates in place, but the contract should be explicit.

**2. OpenAI: assistant turn with ONLY `tool_use` blocks emits `content: ""`**

When an assistant turn has no `text` blocks, `texts.join('')` yields `""` and the message becomes `{ role: 'assistant', content: '', tool_calls: [...] }`. The OpenAI API accepts `null` for `content` when `tool_calls` is present, but some strict parsers reject empty string. No test covers this edge case.

Suggested fix:
```ts
const msg: Record<string, unknown> = {
  role: 'assistant',
  content: texts.length > 0 ? texts.join('') : null,
};
```
Add a test: assistant turn with only `tool_use` blocks, verify `content` is `null` (or omitted) and `tool_calls` is present.

---

## MINOR

**3. `deserializeSession` validates `role` but not `content` shape inside turns**

Passing `{ turns: [{ role: 'user', content: 123 }] }` (numeric content) is accepted and cast directly via `turns as MessageTurn[]`. At runtime this passes TypeScript's structural typing but will break downstream consumers that iterate `turn.content` expecting string or array.

This is acceptable given the stated design intent ("bugs surface loudly") as long as the limitation is documented. If stricter validation is desired, add a `typeof content === 'string' || Array.isArray(content)` guard.

**4. Empty string `systemPrompt` is silently omitted (correct behavior, undocumented)**

Both `buildOpenAiTranscript` and `buildAnthropicTranscript` guard with `if (systemPrompt)`, which skips empty strings. This is the correct behavior per the spec ("omitted") but no test explicitly asserts it for the `""` case (only for `undefined`/missing). Low risk — worth a single test line.

**5. `estimateTokens` unicode caveat undocumented**

The heuristic uses `.length` which counts UTF-16 code units. Emoji and some CJK characters occupy 2 code units per character but typically 1 token. For a rough heuristic this is acceptable, but the docstring should note the limitation explicitly so callers aren't surprised by slight over-estimates on emoji-heavy content. No overflow risk — `length` returns a non-negative integer and `Math.ceil` is safe at any realistic string length.

**6. O(n) appendTurn — documented in spec comment, accepted**

Comment at line 39 documents the immutable copy behavior. For typical 10-100 turn sessions this is fine. No action required unless the module is used for very long sessions (1000+ turns), in which case a persistent data structure (e.g., linked list) would be warranted. Current code and tests are consistent on this.

---

## IMMUTABILITY_OK: YES

`appendTurn` spreads into a new array and returns a new object. Input `state` is not modified.

Note: `serializeSession` does not deep-copy (see IMPORTANT #1 above) but `appendTurn` itself is clean.

## VALIDATION_DEPTH: SHALLOW

`deserializeSession` validates that `turns` is an array and that each element has a valid `role`. It does not validate the `content` field shape (string vs array, or ContentBlock structure). For the described use case (pass-through blob owned by this module) shallow validation is acceptable but should be documented as an explicit design decision.

---

## Test count: 15 (meets spec minimum)

Coverage gaps:
- Assistant turn with ONLY `tool_use` blocks → OpenAI shape (maps to IMPORTANT #2)
- Empty string systemPrompt (should be omitted from output)
- `deserializeSession` with `content: 123` (numeric) — should this throw?

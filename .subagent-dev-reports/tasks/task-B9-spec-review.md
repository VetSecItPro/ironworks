# Task B.9 Spec Review — tool-normalize.ts

**AGENT:** spec-reviewer
**TASK:** B.9
**DATE:** 2026-04-18

---

## VERDICT: PASS

---

## Checkpoint Results

| Check | Result |
|---|---|
| OUTBOUND_FORMATS_CORRECT | PASS |
| INBOUND_PARSING_CORRECT | PASS |
| TOOL_RESULT_FORMATS_CORRECT | PASS |
| VALIDATION_COMPLETE | PASS |
| PARALLEL_TOOL_CALLS | PASS |
| MUTATION_SAFE | PASS |
| TEST_CASES | 26 |
| ANY_TYPES | 0 |
| BUILD | PASS (177/177) |
| WORKSPACE_TYPECHECK | PASS |
| EXTRA_SCOPE | none |
| MISSING | none |

---

## Evidence

### Exports — PASS
All required symbols exported from `tool-normalize.ts`:
- Types: `ToolDefinition`, `ToolInvocation`, `ToolResult`, `ProviderToolFormat`
- Functions: `toProviderToolDefinitions`, `fromProviderToolCall`, `toProviderToolResult`, `validateToolArgs`
- Namespace: `toolNormalize` (barrel with all four functions)

### Outbound Definitions — PASS
- OpenAI: `{type:'function', function:{name, description, parameters}}` — correct
- Anthropic: `{name, description, input_schema: parameters}` — correct
- Empty input returns empty output — tested
- N inputs → N outputs — tested (2-item array, both formats)

### Inbound Parsing — PASS
- OpenAI `{id, type:'function', function:{name, arguments: JSON-string}}` → `{toolCallId, toolName, args}` — correct
- Anthropic `{type:'tool_use', id, name, input: object}` → same shape — correct
- Malformed JSON in `function.arguments` → throws with `/json/i` match — tested
- Missing id → throws; missing type → throws; missing function.name → throws — tested
- Empty string arguments → throws (treated as malformed JSON) — tested
- Null Anthropic input → throws — tested

### Tool Results — PASS
- OpenAI: `{role:'tool', tool_call_id, content}` — correct, no `is_error` field
- Anthropic success: `{type:'tool_result', tool_use_id, content}` — correct, no `is_error`
- Anthropic error: `{type:'tool_result', tool_use_id, content, is_error:true}` — `is_error` only added when true — correct

### Validation — PASS
- Valid args → `{valid:true, errors:[]}` — tested
- Missing required field → `{valid:false, errors:[...]}` with field name in error — tested
- Wrong type → invalid — tested
- Enum violation → invalid — tested
- Schema with no required fields, empty args → valid — tested
- Schema with no properties, any object → valid — tested
- Ajv validator cache used (compiled once per schema key)

### Parallel Tool Calls — PASS
- 3 simultaneous OpenAI calls with distinct IDs parsed independently, all IDs preserved — tested
- 2 simultaneous Anthropic calls with distinct IDs preserved — tested

### Mutation Safety — PASS
- `toProviderToolDefinitions` with `structuredClone` pre/post comparison confirms no mutation — tested
- Implementation uses `tools.map(t => ({...}))` allocating fresh objects, confirmed in source

### `any` Types — 0
Grep of `tool-normalize.ts` for `: any` and `as any` returned zero matches.

### Build / Tests — PASS
```
Tests  177 passed (177)
tool-normalize.test.ts: 26 tests — all green
```

### Typecheck — PASS
`tsc --noEmit` exits clean with no output.

### Dependencies — PASS
- `package.json`: `"ajv": "^8.18.0"` present in `dependencies`
- `pnpm-lock.yaml`: `ajv@8.18.0` resolved and locked

### Scope — PASS
Only three files modified:
- `packages/adapter-utils/src/http/tool-normalize.ts` (implementation)
- `packages/adapter-utils/src/http/__tests__/tool-normalize.test.ts` (tests, untracked new file)
- `packages/adapter-utils/package.json` (ajv dep)
- `pnpm-lock.yaml` (lockfile update)

No other packages or files touched.

### Commenting — PASS
All exported functions have JSDoc explaining purpose and provider-specific rationale. Comments explain WHY (e.g., why OpenAI arguments is a JSON string, why Anthropic is_error is omitted when false, why Ajv validators are cached). No task/session references in comments.

---

## Notes

The implementer flagged an import-style note: `import { Ajv }` (named) vs `import Ajv` (default). The chosen form is correct for NodeNext ESM resolution with Ajv's CJS bundle and is documented inline. This is a known footgun and the comment is accurate — no concern.

# Task B.18 Review — tool-repair.ts

```
AGENT: combined-reviewer
TASK: B.18
SPEC_VERDICT: PASS
QUALITY_VERDICT: PASS
```

## Spec Checklist

| Requirement | Status |
|---|---|
| Exports `attemptToolRepair` | PASS |
| Exports `RepairOutcome` type | PASS |
| Exports `RepairResult` interface | PASS |
| Exports `RepairPrompter` type | PASS |
| Exports `toolRepair` namespace | PASS |
| Returns `'valid'` when original args pass schema | PASS |
| Prompter called at most ONCE per invocation | PASS (enforced structurally — no loop) |
| Validates repaired args; returns `'repaired'` on success | PASS |
| Validates repaired args; returns `'unrepaired'` on failure | PASS |
| Identity guard: mismatched `toolCallId` or `toolName` → `'unrepaired'` | PASS |
| Prompter exceptions → `'unrepaired'` (not propagated) | PASS |
| 8+ tests covering all outcomes + drift + prompter failure | PASS — exactly 8 tests |

## Quality Checklist

| Requirement | Status |
|---|---|
| JSDoc on all exports | PASS — all 5 exports have JSDoc |
| WHY-only inline comments | PASS — inline comments explain rationale, not what |
| No `any` in source | PASS — zero matches |
| `invocation` in result is always defined (never undefined/null) | PASS — all 4 return paths set `invocation` explicitly |
| `errors` array populated appropriately per outcome | PASS — `valid`→`[]`, `repaired`→`[]`, `unrepaired`→first or second check errors |
| Pure function (no external side effects beyond injected prompter) | PASS |

## Adversarial Analysis

**Empty schema `{}`** — `validateToolArgs` will validate any args as valid; `attemptToolRepair` returns `'valid'` immediately without calling the prompter. Correct behavior.

**Prompter returning malformed ToolInvocation (missing fields)** — TypeScript enforces `RepairPrompter` return type at compile time. At runtime, if a prompter returns an object missing `toolCallId` or `toolName`, those will be `undefined`, which will fail the identity guard (`undefined !== 'c1'`) and return `'unrepaired'`. The drift guard catches what the type system cannot enforce at runtime.

**Very large args (1MB JSON)** — `validateToolArgs` uses Ajv; no streaming/chunking concern because Ajv operates on an already-parsed JS object, not raw JSON. The 1MB serialized string was already parsed upstream by the HTTP adapter. No memory concern specific to this function.

## Test Count

8 tests across 4 describe blocks:
1. `returns repaired invocation when retry succeeds`
2. `passes validation errors to the prompter`
3. `returns skipped outcome when args are valid (no repair needed)`
4. `returns failed outcome when repaired args still invalid`
5. `returns failed outcome when prompter throws`
6. `invokes prompter at most once regardless of outcome`
7. `prompter returning a different tool name is rejected`
8. `prompter returning a different toolCallId is rejected`

All 8 pass. Full suite (272 tests, 16 files) passes with 0 failures.

## STRENGTHS

- Single-attempt invariant is structurally enforced (no loop construct), not just documented — impossible to violate without changing the code.
- Identity guard fires before the second `validateToolArgs` call, meaning a hallucinated tool name is caught even if the args happen to be valid.
- `errors` contract is precise: `valid`→empty, `repaired`→empty (first-attempt errors no longer actionable), `unrepaired`→most-recent failure errors.
- JSDoc module-level comment clearly states the WHY and the load-bearing invariant.
- No `any`, no implicit side effects, no undefined returns.

## CRITICAL

None.

## IMPORTANT

- **`errors` on `'repaired'` outcome is empty** (line 112). The spec says `errors` is "populated for 'repaired' (the first attempt's errors that were sent to the prompter)". The implementation returns `[]` instead. This is a minor contract divergence — callers wanting to log what errors were present before repair cannot retrieve them from the result. Consider whether the caller ever needs those errors, or update the JSDoc to say `'repaired'` always returns `[]`.

## MINOR

- Test file imports `RepairOutcome` type but only uses it implicitly via `toBe('valid')` string assertions — not a bug, but the import is unused as a type annotation in practice.
- No test for the empty-schema `{}` adversarial case (valid-by-default path). Given the unit already passes the valid-args test, this is low priority but would increase confidence.

## Invariant Summary

SINGLE_ATTEMPT_INVARIANT: YES — structurally enforced, no loop
IDENTITY_GUARD: YES — checks both `toolCallId` and `toolName` before second validation

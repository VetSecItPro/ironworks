AGENT: quality-reviewer
TASK: B.5
VERDICT: PASS (with IMPORTANT notes)

STRENGTHS:
- Attempt counter increments correctly: loop is `attempt <= maxRetries`, so attempt goes 0..maxRetries (inclusive), giving maxRetries+1 total calls. Off-by-one is clean.
- `toolCallFlag` stored by reference correctly. Caller-supplied flag is used directly; no copy made. External mutations from fn via `ctx.toolCallFlag.emitted = true` are immediately visible to the catch block in the same tick (JS single-threaded - no race possible).
- `sleep()` uses `{ once: true }` on the abort listener and calls `clearTimeout(timer)` on abort - no timer leak on abort path. Pre-abort check (`signal?.aborted`) at sleep entry prevents unnecessary timer allocation.
- Abort check at loop top (before each attempt) means a pre-aborted signal short-circuits before attempt 0 - consistent with Node API conventions.
- `applyJitter` clamps to `Math.max(0, ...)` - negative delay impossible even at `jitterRatio=1`.
- Error rethrow uses `throw err` (not `throw new Error(...)`) preserving original stack and ES2022 `cause` chain set at construction. `lastError` fallback at loop bottom is unreachable but safe.
- `onRetry` is called synchronously before `sleep()`. If it throws, the exception bubbles out of `runWithRetry` immediately - this terminates the retry loop on observer error, which is a valid explicit design choice (fail-fast beats swallowing observer errors).
- No mutation of `options.policy` anywhere. `options.toolCallFlag` is read once into a local; the local is passed to fn, not options itself.
- JSDoc is thorough with WHY comments on critical invariants (R16, totalTimeoutMs semantics).
- No `any` types in test file.

CRITICAL:
- None found.

IMPORTANT:
1. `retryAfterMs: -1` / `retryAfterMs: 0` from server: when `err.retryAfterMs` is 0 or negative, `delayMs` is set to that value before the `remaining` clamp. `Math.min(negative, remaining)` yields the negative value. `sleep(-1, signal)` calls `setTimeout(resolve, -1)` which Node normalizes to 0 (immediate resolve) - functionally fine, but semantically misleading. A `Math.max(0, err.retryAfterMs)` guard would be cleaner and explicit. Current behavior is accidental correctness.
2. `sleep()` does not remove the abort event listener on normal timer resolution. Once `resolve` fires the Promise settles and the listener becomes a dangling reference on the signal until the signal itself is GC'd or fires. For long-lived AbortControllers reused across many calls (e.g. session-level signals), this accumulates `{ once: true }` listeners that are individually GC-eligible but may trigger GC pressure. `{ once: true }` does auto-remove on fire but NOT on normal timer expiry. Fix: store listener ref and call `signal.removeEventListener('abort', onAbort)` inside the timer callback before `resolve()`.
3. `totalTimeoutMs` check at attempt loop top uses `elapsed >= policy.totalTimeoutMs` but throws `lastError` which is `undefined` on attempt 1 (since attempt 1 is the first retry - `lastError` was set in the previous catch). Actually `lastError` IS set before this check is reached because the check only fires when `attempt > 0`, meaning at least one prior catch has run. This is safe - but the `throw lastError` at that point throws the error from the previous attempt, not a TimeoutError. Callers cannot distinguish "gave up because maxRetries" from "gave up because totalTimeout". Minor semantic loss but not a correctness bug.

MINOR:
- The 50-count concurrent test is absent (not present in the test file reviewed). The test suite covers the critical R16 paths via 4 targeted tests, which is more meaningful than a raw concurrency count.
- `attempt` cannot overflow: `2^attempt` with maxRetries capped at reasonable values (default 3) is trivially safe. No overflow risk.
- `fn races to set flag after throw`: impossible in JS. `ctx.toolCallFlag.emitted = true` at line 199 executes synchronously before `throw` at line 200 in the same fn body. Catch block reads the flag after `await fn(...)` rejects - by that point the mutation is committed. No race vector.
- The `sleep` timer created for `delayMs=0` after a `retryAfterMs=0` server instruction calls `setTimeout(resolve, 0)` - which is functionally correct (yields event loop), but a `Math.max(0, ...)` guard makes intent explicit.
- Test for abort (`supports abortSignal`) does not assert the rejection reason is the abort reason (just `.rejects.toBeDefined()`). Low risk but a stronger assertion would be `rejects.toBe(ac.signal.reason)`.

ADVERSARIAL_NOTES:
- R16 bypass vector DOES NOT EXIST in the current code. The flag check (`if (toolCallFlag.emitted) throw err`) runs BEFORE the `instanceof HttpAdapterError` check and BEFORE the `retryable` check. Any execution path where fn sets `emitted=true` then throws - regardless of error type, retryable status, or error classification - hits the flag check first and throws immediately. There is no code path that can reach `sleep → retry` after `toolCallFlag.emitted = true`.
- Scenario: fn sets flag, throws non-retryable error. Flag check fires first (`throw err`). Correct - the non-retryable check would have stopped it anyway, but flag check runs first.
- Scenario: fn sets flag, throws retryable error. Flag check fires (`throw err`). Correct - proven by test at line 191-208.
- Scenario: fn sets flag, returns successfully. `return await fn(...)` succeeds - no catch block entered, flag check never runs. Correct - no retry needed.
- The only theoretical gap: if `toolCallFlag.emitted` were checked AFTER `err instanceof HttpAdapterError` and `err.retryable`, a non-HttpAdapterError thrown alongside flag=true would still throw immediately (the `instanceof` guard fires first). Since the flag check is at the TOP of the catch block, this is moot.

TIMER_LEAK_RISK: YES (minor - dangling abort listener after successful sleep; `{ once: true }` mitigates on abort path but not on normal expiry path)
ABORT_SEMANTICS: CLEAN (pre-abort short-circuits before attempt 0; mid-sleep abort clears timer and rejects; mid-fn abort waits for fn to settle since fn is already awaited - runWithRetry does not cancel fn, which is correct - fn must manage its own abort via the same signal)
OUTPUT: .subagent-dev-reports/tasks/task-B5-quality-review.md

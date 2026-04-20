# Task B.7 Spec Review — rate-limiter.ts

**AGENT:** spec-reviewer
**TASK:** B.7
**DATE:** 2026-04-18

---

## VERDICT: PASS

---

## Checkpoint Results

| Checkpoint | Status | Notes |
|---|---|---|
| TOKEN_BUCKET_SEMANTICS | PASS | `refill()` computes `min(maxCapacity, tokens + elapsed * tokensPerSecond)` with fractional precision. Bucket starts full. |
| FIFO_INVARIANT | PASS | `processQueue` only inspects `queue[0]`; later smaller-cost waiters never jump the head. |
| ABORT_HANDLING | PASS | Pre-aborted: immediate reject, zero tokens consumed. Mid-wait: `splice` removes from queue, abort listener cleaned. Normal resolve: `onAbort = null` nulled before `resolve()` prevents dangling listener. |
| MEMORY_BOUNDED | PASS | LRU via delete+re-insert on access. Eviction walks from Map head, skips keys with non-empty queue. Temporary over-cap if all keys have waiters (documented, correct trade-off). |
| INVALID_COST_REJECTED | PASS | `cost > maxCapacity` → `Promise.reject(new Error(...exceeds capacity...))` before any state is touched. |

---

## Exports

All required exports present:
- `createRateLimiter(options?)` factory - PASS
- `RateLimiterOptions` with `tokensPerSecond` (default 10), `maxCapacity` (default 60), `maxKeys` (default 256) - PASS
- `RateLimiter` interface with `acquire(key, cost?, signal?)`, `available(key)`, `reset(key)` - PASS
- `rateLimiter` namespace barrel export - PASS

---

## Test Coverage

11 tests in `rate-limiter.test.ts`. All spec bullets covered:

1. Immediate grant when capacity available
2. Waits for refill when capacity exhausted
3. FIFO queue for concurrent waiters
4. Per-key isolation (draining one key does not delay another)
5. Capacity caps refill (bucket cannot exceed maxCapacity)
6. Acquires N tokens at once (burst cost)
7. Rejects requests exceeding maxCapacity (invalid cost)
8. AbortSignal cancels a mid-wait acquire
9. Pre-aborted signal: rejects immediately without consuming tokens
10. Bounded memory: maxKeys caps key states (LRU eviction verified)
11. FIFO prevents starvation: high-cost head is served before cheaper later waiter

---

## Metrics

| Metric | Value |
|---|---|
| TEST_CASES | 11 new / 124 total |
| ANY_TYPES | 0 |
| BUILD | PASS (124/124, 0 failures) |
| WORKSPACE_TYPECHECK | PASS (tsc --noEmit, clean) |

---

## Scope

No out-of-scope files touched. Review confined to:
- `packages/adapter-utils/src/http/rate-limiter.ts`
- `packages/adapter-utils/src/http/__tests__/rate-limiter.test.ts`

---

## Minor Observations (non-blocking)

1. **`available()` does not move the key to LRU tail** — it calls `states.get(key)` directly rather than `getOrInit`. This is arguably correct (a read-only probe should not count as a full access for eviction purposes), but worth noting as a minor divergence from strict LRU.
2. **`reset()` uses `s?.timerId !== null && s?.timerId !== undefined`** — could simplify to `s?.timerId != null`, but TypeScript is satisfied and the behavior is correct.

Neither observation constitutes a spec violation.

---

## MISSING: none
## EXTRA_SCOPE: none

AGENT: implementer
TASK: B.7 rate-limiter
STATUS: DONE
FILES_CREATED: 2
FILES_MODIFIED: 0
TESTS_ADDED: 11
RED_VERIFIED: YES
GREEN: 11/11 (124/124 total suite)
TYPECHECK_PKG: PASS
TYPECHECK_WORKSPACE: PASS
FIFO_TEST_PASS: YES
PER_KEY_ISOLATION_PASS: YES
ABORT_LISTENER_CLEAN: YES
MEMORY_BOUNDED: YES
CONCERNS: Unhandled-rejection warning from Vitest fake-timer timing in the abort-cancels test (abort fires inside advanceTimersByTimeAsync before expect.rejects could attach). Fixed by pre-attaching p.catch(() => undefined) before the abort fires — standard pattern for this Vitest fake-timer edge case. All 124 tests pass with no errors/warnings.

FILES:
- packages/adapter-utils/src/http/rate-limiter.ts (implementation)
- packages/adapter-utils/src/http/__tests__/rate-limiter.test.ts (11 tests)

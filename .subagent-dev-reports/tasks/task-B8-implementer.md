## Task B.8 — transport.ts Implementer Report

```
AGENT: implementer
TASK: B.8 transport
STATUS: DONE
FILES_CREATED: 2
FILES_MODIFIED: 1
TESTS_ADDED: 17
RED_VERIFIED: YES (16 failed before implementation)
GREEN: 144/144
TYPECHECK_PKG: PASS
TYPECHECK_WORKSPACE: PASS
DEPENDENCY_ADDED: undici@8.1.0
SECRET_REDACTION_VERIFIED: YES
ABORT_SIGNAL_COMPOSITION: PASS
COMMENTING: WHY-only inline; JSDoc on all exports
CONCERNS: none
OUTPUT: .subagent-dev-reports/tasks/task-B8-implementer.md
```

### Files

- `packages/adapter-utils/src/http/__tests__/transport.test.ts` — 17 test cases (created)
- `packages/adapter-utils/src/http/transport.ts` — full implementation replacing stub (rewritten)
- `packages/adapter-utils/package.json` — undici@^8.1.0 added to dependencies

### Key decisions

- Removed module-level custom `Agent` in favour of the global undici dispatcher so `MockAgent`/`setGlobalDispatcher` intercepts work correctly in tests without needing a `dispatcher` option parameter.
- `drainReadable` uses the async iterator protocol on `Readable` with a running byte counter, destroying the stream early on cap breach — avoids buffering the full oversized body.
- Timeout and user AbortSignal composed via `AbortSignal.any([user, AbortSignal.timeout(ms)])` — either fires independently without shared state.
- `mapHttpError` drains at most 4 KB for the error message to prevent memory growth on malformed provider error pages.
- `sendJsonStream` wraps `BodyReadable` (Node.js Readable) into a WHATWG `ReadableStream<Uint8Array>` for a uniform API at the SSE parser layer.
- All error messages pass through `redactSecrets` before inclusion — verified by the dedicated redaction test case.

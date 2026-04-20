# Task B.8 Quality Review — transport.ts

```
AGENT: quality-reviewer
TASK: B.8
VERDICT: PASS (with IMPORTANT fixes noted)
```

---

## STRENGTHS

- **Resource cleanup is solid**: `drainReadable` calls `readable.destroy()` on size-cap exceeded before throwing. `mapHttpError` always drains the error body via `drainForError` which also calls `readable.destroy()` when its limit is hit. Content-type mismatch paths call `body.destroy()` explicitly before throwing. No obvious socket leak on error paths.
- **`AbortSignal.any` is safe**: `@types/node ^24` + `ES2023` target + undici v8. Node 20+ ships `AbortSignal.any` natively. The project targets types that include it; the comment on line 103 documents the Node 20+ requirement. No polyfill needed.
- **`parseRetryAfter` negative-seconds guard**: line 81 — `secs >= 0` check means negative numeric values are silently discarded (returns `undefined`). The date-form path uses `Math.max(0, dateMs - now)` on line 83, clamping correctly. No negative ms escapes.
- **Content-Type `;` suffix handling**: `contentType.includes('application/json')` (line 339) and `contentType.includes('text/event-stream')` (line 381) are substring checks, not equality — `application/json; charset=utf-8` passes correctly.
- **JSON parse failure message**: line 352-355 — `Failed to parse JSON response:` prefix + first 200 chars of redacted raw text. Clear and safe.
- **`sendJsonStream` cancel path**: the `ReadableStream` `cancel()` hook on line 405 calls `body.destroy()`. If the caller drops the stream without consuming it, the GC eventually triggers cancel and releases the socket. However, there is no eager timeout on unclaimed streams (see IMPORTANT below).
- **Comment quality**: JSDoc on every exported symbol, `WHY` comments on non-obvious decisions (global dispatcher, `destroy()` calls, timeout/abort distinction). Port-ready.
- **Test MockAgent setup/teardown**: `origDispatcher` saved at module scope, restored in `afterEach`. `mockAgent.disableNetConnect()` prevents accidental real network calls. No cross-test pollution observed.
- **Empty response body on 200**: `Buffer.concat([]).toString('utf-8')` returns `""`, then `JSON.parse("")` throws — caught and re-thrown as `HttpAdapterServerError` with a clear message. Handled correctly.

---

## CRITICAL

None.

---

## IMPORTANT

**4xx-other maps to `HttpAdapterServerError` with `retryable: true` — semantic mismatch.**

`mapHttpError` (lines 216-225) handles 401, 403, 429 explicitly but falls through everything else — including 400, 404, 422 — to `HttpAdapterServerError`. `HttpAdapterServerError` always sets `retryable: true` (errors.ts line 83). This means a 400 Bad Request (malformed payload — permanently broken) and a 404 Not Found are tagged as retryable. Any retry logic upstream that reads `err.retryable` will waste quota and add latency for deterministically-unrecoverable errors.

Recommended fix: split the catch-all in `mapHttpError`:

```ts
if (status >= 400 && status < 500) {
  // Client errors are not retryable (the request itself is broken).
  throw new HttpAdapterServerError(`HTTP ${status}: ${safeBody}`, { status, retryable: false });
}
// 5xx: retryable
throw new HttpAdapterServerError(`HTTP ${status}: ${safeBody}`, { status });
```

This requires adding an optional `retryable` override to `HttpAdapterServerError`'s constructor, or using a different error subclass for 4xx-other.

**No `Content-Length` early-reject before streaming the body.**

`drainReadable` counts bytes as chunks arrive. If the server sends `Content-Length: 500000000` the transport happily starts reading before rejecting. A cheap pre-check against `Content-Length` header would bail out before a single byte of body is read. Not a correctness bug but a waste of bandwidth and a potential OOM window during the initial chunk arrival.

---

## MINOR

- **`sendJsonStream` unclaimed stream / GC timing**: if the caller receives the `SendJsonStreamResult` and then drops the reference without calling `cancel()` or reading to completion, the socket stays open until GC runs the `ReadableStream` finalizer. In practice this is fine for normal usage but could accumulate under high error rates. A comment noting the caller ownership contract would help.
- **Global dispatcher in multi-tenant context**: noted in `createTransport` JSDoc and in `TransportOptions` (intentionally empty). The comment is there. Fine for now — flag: if per-workspace pool limits (e.g., max 2 connections to OpenAI per workspace) become a requirement, `createTransport` will need to accept a `Dispatcher` option and thread it through `executeRequest`. The surface is already set up for this.
- **`TextEncoder` instantiated per chunk in `sendJsonStream`**: line 394 creates a `new TextEncoder()` on every string chunk. Should be hoisted to module scope or at minimum to `sendJsonStream` scope. Negligible in practice (string SSE chunks are rare — undici streams buffers) but worth cleaning up.
- **No `engines` field in `package.json`**: the `@types/node ^24` devDep + `AbortSignal.any` usage implies Node >= 20. There is no `"engines": { "node": ">=20" }` to enforce this. A consumer on Node 18 would get a runtime crash at `AbortSignal.any` with no clear diagnostic. Add the engines field.
- **Test for `403` missing**: 401 is tested; 403 maps the same way (both → `HttpAdapterAuthError`) but has no dedicated test case.
- **Test for `400 / 404 / 422`**: no test asserts these map to `HttpAdapterServerError`. Given the `retryable: true` bug above, a test would have caught this.

---

## ADVERSARIAL NOTES

- **No `content-type` header**: `flatHeaders['content-type'] ?? ''` → empty string. `''.includes('application/json')` → false. Throws `HttpAdapterServerError: Unexpected content-type: expected application/json, got ""`. Body destroyed. Correct behavior.
- **`Content-Type: application/json; charset=utf-8`**: `includes('application/json')` → true. Passes through. Correct.
- **200 + body "OK" with content-type application/json**: `JSON.parse("OK")` throws SyntaxError. Caught, re-thrown as `HttpAdapterServerError: Failed to parse JSON response: OK`. Clear.
- **Chunked response + abort fires mid-stream (sendJsonStream)**: undici's `BodyReadable` emits `'error'` when the connection is torn down by an abort. The `body.on('error', ...)` handler at line 403 calls `controller.error(err)`, propagating to the stream consumer. Socket is released by undici's internal abort handling. Correct.
- **Backpressure from Node Readable to WHATWG ReadableStream**: the `start()` handler uses `body.on('data', ...)` — this is a flowing-mode listener. It does NOT pause the Node stream when the WHATWG stream's internal queue is full. If the SSE parser reads slowly, the Node Readable will buffer unboundedly in the WHATWG controller's internal queue. This is a known limitation of the Readable-to-ReadableStream bridge pattern without explicit backpressure. For SSE use (low-throughput text), this is unlikely to matter in practice, but it is architecturally impure. A `ReadableStream` with `pull()` semantics + `readable.pause()`/`readable.resume()` would be correct. Flag for the SSE parser layer.
- **4xx-specifically-400 treated as retryable ServerError**: confirmed design bug — see IMPORTANT section above.

---

## SUMMARY VERDICTS

```
SOCKET_LEAK_RISK:     NO  (destroy() called on all error paths; cancel() on stream drop)
4XX_MAPPING_CORRECT:  NO  (400/404/422 map to retryable: true — should be retryable: false)
KEEPALIVE_VERIFIED:   YES (undici global Agent uses keepalive by default; confirmed by
                           undici v8 docs and the comment at line 264)
```

---

## OUTPUT

`/Users/airborneshellback/vibecode-projects/ironworks/.claude/worktrees/http-adapter-family/.subagent-dev-reports/tasks/task-B8-quality-review.md`

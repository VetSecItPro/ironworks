# HTTP Adapter Family

IronWorks ships two distinct adapter families that coexist in the same registry:

- **CLI adapters** (`claude-local`, `codex-local`, `cursor-local`, `gemini-local`, `opencode-local`, `pi-local`, `hermes-local`, `openclaw-gateway`) - spawn a subprocess (the AI CLI tool), stream its stdout/stderr, and manage a persisted session on disk.
- **HTTP adapters** (`poe-api`, `anthropic-api`, `openai-api`, `openrouter-api`) - call provider APIs directly over HTTPS, with no subprocess and no disk session state.

This document covers the HTTP adapter family introduced in Phase M.

---

## Why HTTP-native?

CLI adapters require an AI tool installed on the server. They can persist session state natively (the CLI manages conversation history on disk), but they cannot access provider-side capabilities that the CLI tool does not expose:

| Capability | CLI adapters | HTTP adapters |
|---|---|---|
| Prompt caching (~90% token cost reduction) | No | Yes (anthropic-api) |
| Extended thinking / reasoning tokens | No | Yes (anthropic-api, openai-api) |
| Structured outputs (`json_schema`) | No | Yes (openai-api) |
| Batch API (50% cost async inference) | No | Stub (openai-api, Phase O) |
| Multi-provider via single key | No | Yes (poe-api, openrouter-api) |
| Zero server-side install | No | Yes |

Both families coexist. The registry routes each agent to whichever adapter its config specifies. There is no deprecation of CLI adapters.

---

## Shared HTTP substrate

All four HTTP adapters import from `@ironworksai/adapter-utils/http`. This package provides:

| Module | Purpose |
|---|---|
| `transport.ts` | undici keepalive pool with typed error mapping, request size caps, timeout composition, and automatic secret redaction from error messages |
| `sse-parser.ts` | Parses both OpenAI and Anthropic SSE formats into a provider-neutral `NormalizedStreamEvent` stream |
| `retry.ts` | Bounded exponential backoff with the no-retry-after-tool-call invariant (R16) |
| `circuit-breaker.ts` | Per-key closed/open/half-open state machine with concurrent probe safety |
| `rate-limiter.ts` | Per-key token bucket with FIFO fairness queue and LRU eviction |
| `tool-normalize.ts` | Bidirectional OpenAI <-> Anthropic tool-call format translation with AJV JSON Schema validation |
| `tool-repair.ts` | One-shot tool-call argument repair when a model emits malformed JSON args |
| `session-replay.ts` | Transcript management for stateless HTTP providers (`buildTranscript`, `compactIfNeeded`) |
| `files-api.ts` | File upload validation and content-block shaping for vision/PDFs |
| `redaction.ts` | Schema-aware JSON path-based redactor for structured payloads |
| `errors.ts` | `HttpAdapterError` hierarchy with provider-specific subclasses |
| `cost.ts` + `pricing-table.ts` | Per-call USD calculation with per-token-class rates; graceful null on unknown models (R19) |
| `observability.ts` | Structured `AdapterCallEvent` emitter with pluggable sinks |
| `request-id.ts` | UUIDv4 generator + `X-Request-Id` header propagation helpers |

---

## The four blocking risks and how they are mitigated

### R3 - Tool-call format differences (OpenAI vs Anthropic)

OpenAI and Anthropic use incompatible tool-call schemas. `tool-normalize.ts` handles bidirectional translation:

- `fromProviderToolCall(openai, ...)` -> Anthropic format
- `toProviderToolCall(anthropic, ...)` -> OpenAI format

All tool arguments are AJV-validated against the declared schema before forwarding. Invalid arguments are repaired via `tool-repair.ts` before falling back to error.

### R16 - Duplicate tool execution via retry

Retrying a request that already triggered a tool call would re-execute the tool with identical arguments - a silent double-spend risk for any tool with side effects (file writes, API mutations, billing calls).

The `runWithRetry` function in `retry.ts` sets an internal `toolCallFlag` at the start of the catch block. This flag is checked **before** the retryability decision - if a tool call was emitted in the failed request, the error is re-thrown immediately regardless of whether it would otherwise qualify for retry.

### R17 - Stateless HTTP vs CLI "native confirmed" session

CLI adapters carry session state on disk. HTTP providers are inherently stateless - each call is a fresh HTTPS request with no server-side memory.

`session-replay.ts` solves this by reconstructing the full conversation transcript from IronWorks' session store on every call. The `ADAPTER_MANAGED_SESSION_POLICY` setting controls compaction thresholds to keep transcript sizes bounded. Agents using HTTP adapters behave identically to CLI adapters from the executor's perspective.

### R20 - Regex redaction misses structured JSON

Simple regex patterns miss secrets embedded in structured JSON payloads (e.g. `{"api_key": "sk-..."}` in a tool-call argument).

`redaction.ts` uses a schema-aware JSON path-based approach: it walks the object graph against a declarative redaction schema, matching field names and replacing values before the payload reaches the transport layer. This catches secrets in arbitrary nesting levels that a regex would miss.

---

## Per-adapter reference table

| Adapter | Provider | API type | Session model | Caching | Tool-use format | Special features |
|---|---|---|---|---|---|---|
| `poe-api` | Poe | OpenAI-compat | Stateless replay | No | OpenAI (forwarded) | 12+ models via one key |
| `anthropic-api` | Anthropic | Anthropic Messages | Stateless replay | Yes (~90% on cache hits) | Anthropic-native | Extended thinking, vision, files |
| `openai-api` | OpenAI | OpenAI Chat Completions | Stateless replay | No | OpenAI-native | Structured outputs, reasoning tokens, parallel tool calls |
| `openrouter-api` | OpenRouter | OpenAI-compat | Stateless replay | No | OpenAI (forwarded) | 15+ providers, marketplace pricing, BYOK headers |

---

## How to add a new HTTP adapter

Use the existing four as scaffolds. The minimum surface is:

1. **`src/shared/models.ts`** - model catalog with typed interface and `Set<string>` for O(1) validation
2. **`src/shared/config.ts`** - config interface, validator function returning `{ok:true,config}` or `{ok:false,error,suggestions?}`
3. **`src/server/execute.ts`** - main execution path: resolve config, build request, call `sendJson`/`parseSseStream`, normalise events, handle tool calls via `tool-normalize.ts`
4. **`src/server/session-codec.ts`** - session serialisation (typically delegates to `session-replay.ts`)
5. **`src/server/skills.ts`** - skill injection (typically inlines via `systemPromptSkills`)
6. **`src/server/test.ts`** - connectivity test called from the UI "Test connection" button
7. **`src/cli/`** - CLI scaffolding matching the pattern from existing adapters
8. **`src/ui/`** - UI config form + model selector
9. **`package.json`** - `name: @ironworksai/adapter-{name}`, add to `pnpm-workspace.yaml`
10. **`README.md`** - follow the template in this PR

Environment variables follow the convention: `ADAPTER_{PROVIDER}_API_KEY`, `ADAPTER_{PROVIDER}_RATE_LIMIT_PER_MIN`, `ADAPTER_DISABLE_{PROVIDER}`.

---

## Test topology

Each adapter package has a `src/server/__tests__/` directory with Vitest unit tests. Tests use `vi.mock` to stub transport calls - no live API calls in CI.

```sh
# Run all four adapter suites
pnpm vitest run --project @ironworksai/adapter-poe-api
pnpm vitest run --project @ironworksai/adapter-anthropic-api
pnpm vitest run --project @ironworksai/adapter-openai-api
pnpm vitest run --project @ironworksai/adapter-openrouter-api

# Full workspace sweep (1449 tests: 4 adapter suites + server + ui + cli + adapter-utils)
pnpm vitest run
```

Current per-adapter counts: poe-api 46, anthropic-api 64, openai-api 56, openrouter-api 43.

---

## See also

- [`packages/adapter-utils/README.md`](../packages/adapter-utils/README.md) - shared HTTP substrate
- [`packages/adapters/poe-api/README.md`](../packages/adapters/poe-api/README.md)
- [`packages/adapters/anthropic-api/README.md`](../packages/adapters/anthropic-api/README.md)
- [`packages/adapters/openai-api/README.md`](../packages/adapters/openai-api/README.md)
- [`packages/adapters/openrouter-api/README.md`](../packages/adapters/openrouter-api/README.md)
- [`docs/DEFERRED-MIGRATIONS.md`](./DEFERRED-MIGRATIONS.md) - migrations and features deferred from this PR

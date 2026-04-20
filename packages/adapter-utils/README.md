# @ironworksai/adapter-utils

Shared types, utilities, and the HTTP adapter substrate used by all IronWorks adapter packages.

## Two surfaces in one package

### CLI adapter utilities (legacy, stable)

The original adapter-utils surface for CLI-subprocess adapters (`claude-local`, `codex-local`, `cursor-local`, `gemini-local`, `opencode-local`, `pi-local`, `hermes-local`, `openclaw-gateway`).

- **Types** — `AdapterExecutionContext`, `AdapterExecutionResult`, `AdapterSessionCodec`, `AdapterSkillSnapshot`, `ServerAdapterModule`, `SessionCompactionPolicy`, `UsageSummary`
- **Process utilities** — `RunProcessResult`, subprocess spawn helpers (`server-utils`)
- **Billing** — `AdapterBillingType` enum
- **Log redaction** — regex-based stderr/home-path redaction (`log-redaction`)
- **Session compaction** — `ResolvedSessionCompactionPolicy`

```ts
import type { ServerAdapterModule, AdapterExecutionResult } from "@ironworksai/adapter-utils";
```

### HTTP adapter substrate (new)

A secondary export at `@ironworksai/adapter-utils/http` provides the production-grade HTTP transport stack shared by the new family of HTTP-native adapters (`poe-api`, `anthropic-api`, `openai-api`, `openrouter-api`).

- `transport` — hardened undici wrapper with typed error mapping, size caps, timeout composition, secret redaction
- `sse-parser` — OpenAI + Anthropic format normalization into provider-neutral `NormalizedStreamEvent` stream
- `retry` — bounded exponential backoff with the no-retry-after-tool-call invariant (prevents duplicate tool execution)
- `circuit-breaker` — per-key closed/open/half-open with concurrent-probe safety
- `rate-limiter` — per-key token bucket with FIFO fairness and LRU eviction
- `tool-normalize` — bidirectional OpenAI ↔ Anthropic tool-call format translation with JSON schema validation
- `tool-repair` — one-shot tool-call argument repair when a model emits invalid JSON args
- `session-replay` — transcript management for stateless HTTP providers (`buildTranscript`, `compactIfNeeded`)
- `files-api` — shared file upload validation + content-block shaping for vision/PDFs
- `redaction` — schema-aware JSON redactor for structured payloads
- `errors` — `HttpAdapterError` hierarchy
- `cost` + `pricing-table` — per-call USD calculation with per-token-class rates
- `observability` — structured `AdapterCallEvent` emitter with pluggable sinks
- `request-id` — UUIDv4 generator + header propagation helpers

```ts
import {
  sendJson,
  parseSseStream,
  runWithRetry,
  createCircuitBreaker,
  createRateLimiter,
  fromProviderToolCall,
  redactSecrets,
} from "@ironworksai/adapter-utils/http";
```

## Dependencies

- `undici` — HTTP client (keepalive pool, size caps, TLS enforced)
- `eventsource-parser` — SSE stream parsing
- `ajv` — JSON Schema validation for tool-call args

## Testing

```sh
pnpm --filter @ironworksai/adapter-utils test:run
```

314+ unit tests across the HTTP substrate covering happy paths, error mapping, retry semantics, concurrency safety, memory bounds, secret redaction, and adversarial edge cases.

## License

MIT

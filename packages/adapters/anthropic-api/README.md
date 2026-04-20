# @ironworksai/adapter-anthropic-api

Routes IronWorks agent calls directly to Anthropic's Messages API with native prompt caching, extended thinking, vision/files support, and Anthropic-native tool-use.

## What this adapter does

Translates IronWorks execution requests into Anthropic Messages API calls at `api.anthropic.com/v1/messages`, applies `cache_control` breakpoints to the system prompt block when configured, and normalises the SSE response stream (including `thinking` and `thinking_delta` blocks) into IronWorks `NormalizedStreamEvent` objects.

## Models supported

| ID | Label | Extended thinking | Max output tokens |
|---|---|---|---|
| `claude-opus-4-7` | Claude Opus 4.7 | Yes | 32,000 |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 | Yes | 16,000 |
| `claude-haiku-4-5` | Claude Haiku 4.5 | No | 8,192 |

All three models support prompt caching.

## Configuration

```json
{
  "model": "claude-sonnet-4-6",
  "apiKey": "${ANTHROPIC_API_KEY}",
  "temperature": 0.5,
  "maxTokens": 8192,
  "cacheControl": {
    "breakpoints": 1
  },
  "extendedThinking": {
    "budgetTokens": 4096
  },
  "systemPromptSkills": ["core-identity", "task-focus"]
}
```

| Field | Required | Description |
|---|---|---|
| `model` | Yes | Anthropic model ID from the table above |
| `apiKey` | No* | Anthropic API key or env-var reference. Falls back to `ADAPTER_ANTHROPIC_API_KEY` |
| `temperature` | No | Float in `[0, 1]`. Mutually exclusive with `extendedThinking` |
| `maxTokens` | No | Positive integer. Defaults to model max |
| `cacheControl.breakpoints` | No | Number of system prompt cache breakpoints (1-2). Enables ~90% token cost reduction on cache hits |
| `extendedThinking.budgetTokens` | No | Token budget for thinking phase. Minimum 1024. Only on Opus 4.7 and Sonnet 4.6 |
| `systemPromptSkills` | No | Skill keys inlined into system prompt (R18 stateless workaround) |

\* Required if `ADAPTER_ANTHROPIC_API_KEY` is not set in the host environment.

## Environment variables

| Variable | Description |
|---|---|
| `ADAPTER_ANTHROPIC_API_KEY` | Anthropic API key. Overrides `config.apiKey` if both are set |
| `ADAPTER_ANTHROPIC_RATE_LIMIT_PER_MIN` | Requests per minute cap (default: 60). Uses token-bucket rate limiter |
| `ADAPTER_DISABLE_ANTHROPIC` | Set to `"true"` to kill-switch this adapter across all agents |

## Features

- **Prompt caching** - `cache_control: {type:"ephemeral"}` breakpoints on the system prompt block unlock Anthropic's prompt cache; typical savings are ~90% on input token costs for cache hits (D.4)
- **Extended thinking** - When `extendedThinking` is configured, Anthropic returns reasoning content blocks prior to the final answer; thinking is streamed and forwarded to the executor (D.5)
- **Vision and files** - Image and PDF content blocks forwarded through `files-api.ts` content-block shaping
- **Anthropic-native tool-use** - Tool definitions sent in Anthropic format directly; bidirectional normalisation via `tool-normalize.ts` when the upstream executor uses OpenAI format
- **Stateless session replay** - Full transcript reconstructed per call via `session-replay.ts` (R17)
- **Cost tracking** - Per-call USD calculation including cache-read and cache-write token classes

## Tests

```sh
pnpm vitest run --project @ironworksai/adapter-anthropic-api
```

Current passing count: **64 tests** across config validation, caching, extended thinking, vision blocks, tool normalisation, and SSE edge cases.

## Not yet supported / caveats

- **`thinking_delta` SSE blocks not surfaced to `onLog`** - The adapter processes `thinking_delta` events gracefully but does not emit them to the IronWorks log stream. The final `thinking` content block is forwarded. This is a deliberate no-op pending a structured thought-log feature in Phase O.

## Upstream-contribution status

Safe to upstream to `paperclipai/paperclip`. Contains no Atlas Ops business logic.

## See also

- [`docs/HTTP-ADAPTER-FAMILY.md`](../../../docs/HTTP-ADAPTER-FAMILY.md) - architectural overview of all four HTTP adapters
- [`packages/adapter-utils`](../../adapter-utils/README.md) - shared HTTP substrate

# @ironworksai/adapter-poe-api

Routes IronWorks agent calls through Poe's OpenAI-compatible API, giving a single API key access to 7+ frontier models across Anthropic, OpenAI, Google, and Meta.

## What this adapter does

Translates IronWorks execution requests into OpenAI-compat Chat Completions calls against `api.poe.com/bot/v1/messages`, then normalises the SSE response stream back into IronWorks `NormalizedStreamEvent` objects. Because Poe acts as a proxy, session state is stateless — the adapter uses `session-replay.ts` to reconstruct a full transcript on every call (R17).

## Models supported

| ID | Label | Tool-use confirmed |
|---|---|---|
| `claude-opus-4-7` | Claude Opus 4.7 | Yes |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 | Yes |
| `claude-haiku-4-5` | Claude Haiku 4.5 | Yes |
| `claude-3-opus` | Claude 3 Opus | Yes |
| `gpt-5` | GPT-5 | Yes |
| `gpt-4o` | GPT-4o | Yes |
| `gpt-4o-mini` | GPT-4o mini | Yes |
| `o4-mini` | o4-mini | Yes |
| `gemini-2.5-pro` | Gemini 2.5 Pro | Yes |
| `gemini-2.0-flash` | Gemini 2.0 Flash | Yes |
| `llama-3.1-405b-instruct` | Llama 3.1 405B Instruct | Not confirmed |
| `llama-4-scout` | Llama 4 Scout | Not confirmed |

Tool-use relayed downstream; compatibility depends on whether the underlying native provider supports function calling.

## Configuration

```json
{
  "model": "claude-sonnet-4-6",
  "apiKey": "${POE_API_KEY}",
  "temperature": 0.7,
  "maxTokens": 4096,
  "systemPromptSkills": ["core-identity", "task-focus"]
}
```

| Field | Required | Description |
|---|---|---|
| `model` | Yes | Poe model ID from the table above |
| `apiKey` | No* | Poe API key or env-var reference. Falls back to `ADAPTER_POE_API_KEY` |
| `temperature` | No | Float in `[0, 2]`. Omit for model default |
| `maxTokens` | No | Positive integer. Omit for model default |
| `systemPromptSkills` | No | Skill keys inlined into system prompt (R18 stateless workaround) |

\* Required if `ADAPTER_POE_API_KEY` is not set in the host environment.

## Environment variables

| Variable | Description |
|---|---|
| `ADAPTER_POE_API_KEY` | Poe API key. Overrides `config.apiKey` if both are set |
| `ADAPTER_POE_RATE_LIMIT_PER_MIN` | Requests per minute cap (default: 60). Uses token-bucket rate limiter |
| `ADAPTER_DISABLE_POE` | Set to `"true"` to kill-switch this adapter across all agents |

## Features

- **OpenAI-compat wrapper** - single API surface for 7+ models from multiple providers
- **Stateless session replay** - `session-replay.ts` reconstructs full transcript per call; no server-side session state required
- **Multi-provider access** - Anthropic, OpenAI, Google, and Meta models through one key
- **Tool-use relay** - tools/tool_choice forwarded to Poe's compat endpoint; provider support varies per model
- **Cost tracking** - per-call USD calculation via `adapter-utils/http` cost module
- **Circuit breaker** - per-key open/closed/half-open with concurrent-probe safety

## Tests

```sh
pnpm vitest run --project @ironworksai/adapter-poe-api
```

Current passing count: **46 tests** across config validation, execute path, session replay, and SSE normalisation.

## Not yet supported / caveats

- **No prompt caching passthrough** - Poe's compat API does not forward `cache_control` headers to Anthropic. Use `anthropic-api` directly when caching matters.
- **Tool-use varies per model** - Only the 10 models marked "confirmed" in the table above have been verified to support `tools`/`tool_choice` in Phase A probes. Llama variants are unconfirmed.
- **Poe model catalog is large** - Poe's `/v1/models` returns 376 models. This adapter hard-codes a curated tier-1 set. Other models may work but are untested.

## Upstream-contribution status

Safe to upstream to `paperclipai/paperclip`. Contains no Atlas Ops business logic.

## See also

- [`docs/HTTP-ADAPTER-FAMILY.md`](../../../docs/HTTP-ADAPTER-FAMILY.md) - architectural overview of all four HTTP adapters
- [`packages/adapter-utils`](../../adapter-utils/README.md) - shared HTTP substrate

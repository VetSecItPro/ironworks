# @ironworksai/adapter-openrouter-api

Routes IronWorks agent calls through OpenRouter's multi-provider gateway, giving access to 15+ models from Meta, Mistral, Anthropic, OpenAI, Google, DeepSeek, Qwen, xAI, and Perplexity through a single OpenAI-compat API.

## What this adapter does

Translates IronWorks execution requests into OpenAI-compat Chat Completions calls against `openrouter.ai/api/v1/chat/completions`, appends the `HTTP-Referer` and `X-Title` identification headers per OpenRouter convention, and normalises the SSE response stream into IronWorks `NormalizedStreamEvent` objects. Like all HTTP adapters, session state is stateless and full transcripts are replayed each call (R17).

## Models supported

| ID | Label | Provider |
|---|---|---|
| `meta-llama/llama-4-scout-17b-16e-instruct` | Llama 4 Scout 17B | meta-llama |
| `meta-llama/llama-4-maverick-17b-128e-instruct` | Llama 4 Maverick 17B | meta-llama |
| `mistralai/mistral-large-2411` | Mistral Large 2411 | mistralai |
| `mistralai/mistral-small-2501` | Mistral Small 2501 | mistralai |
| `anthropic/claude-opus-4-7` | Claude Opus 4.7 (via OpenRouter) | anthropic |
| `anthropic/claude-sonnet-4-6` | Claude Sonnet 4.6 (via OpenRouter) | anthropic |
| `openai/gpt-5` | GPT-5 (via OpenRouter) | openai |
| `openai/gpt-5-mini` | GPT-5 Mini (via OpenRouter) | openai |
| `google/gemini-2.5-flash` | Gemini 2.5 Flash | google |
| `google/gemini-2.5-pro` | Gemini 2.5 Pro | google |
| `deepseek/deepseek-v3` | DeepSeek V3 | deepseek |
| `deepseek/deepseek-r1` | DeepSeek R1 | deepseek |
| `qwen/qwen-2.5-72b-instruct` | Qwen 2.5 72B Instruct | qwen |
| `x-ai/grok-3-latest` | Grok 3 Latest | x-ai |
| `perplexity/sonar-large` | Perplexity Sonar Large | perplexity |

## Configuration

```json
{
  "model": "meta-llama/llama-4-maverick-17b-128e-instruct",
  "apiKey": "${OPENROUTER_API_KEY}",
  "temperature": 0.7,
  "maxTokens": 4096,
  "httpReferer": "https://command.useapex.io",
  "xTitle": "IronWorks",
  "systemPromptSkills": ["core-identity"]
}
```

| Field | Required | Description |
|---|---|---|
| `model` | Yes | OpenRouter model ID from the table above |
| `apiKey` | No* | OpenRouter API key or env-var reference. Falls back to `ADAPTER_OPENROUTER_API_KEY` |
| `temperature` | No | Float in `[0, 2]`. Omit for model default |
| `maxTokens` | No | Positive integer. Defaults to 4096 |
| `httpReferer` | No | `HTTP-Referer` header sent to OpenRouter. Defaults to `https://command.useapex.io` |
| `xTitle` | No | `X-Title` header sent to OpenRouter. Defaults to `IronWorks`. Shown in your OpenRouter usage dashboard |
| `systemPromptSkills` | No | Skill keys inlined into system prompt (R18 stateless workaround) |

\* Required if `ADAPTER_OPENROUTER_API_KEY` is not set in the host environment.

## Environment variables

| Variable | Description |
|---|---|
| `ADAPTER_OPENROUTER_API_KEY` | OpenRouter API key. Overrides `config.apiKey` if both are set |
| `ADAPTER_OPENROUTER_RATE_LIMIT_PER_MIN` | Requests per minute cap (default: 60). Uses token-bucket rate limiter |
| `ADAPTER_DISABLE_OPENROUTER` | Set to `"true"` to kill-switch this adapter across all agents |

## Features

- **Marketplace pricing** - OpenRouter routes to the cheapest available provider for each model, with transparent per-token pricing on openrouter.ai
- **BYOK via headers** - `HTTP-Referer` and `X-Title` headers identify your app in OpenRouter dashboards; BYOK (bring your own key for upstream providers) is supported by OpenRouter when configured on their side
- **15+ routed models** - broad access across open-weight (Llama 4, Mistral, DeepSeek, Qwen) and proprietary (Claude, GPT-5, Gemini, Grok, Perplexity Sonar) models
- **Cost tracking with graceful fallback** - per-call USD calculation via `pricing-table.ts`; if a model is not in the table, usage is still reported but `costUsd` is null (R19 graceful fallback)
- **Stateless session replay** - full transcript reconstructed per call via `session-replay.ts` (R17)
- **Circuit breaker** - per-key open/closed/half-open with concurrent-probe safety

## Tests

```sh
pnpm vitest run --project @ironworksai/adapter-openrouter-api
```

Current passing count: **43 tests** across config validation, header propagation, cost fallback, and SSE normalisation.

## Not yet supported / caveats

- **No caching passthrough** - OpenRouter does not forward Anthropic `cache_control` headers on most routes. Use `anthropic-api` directly when prompt caching is required.
- **Live rate-limit indicators deferred** - Surfacing per-model rate-limit state from OpenRouter's API response headers is deferred to Phase O.

## Upstream-contribution status

Safe to upstream to `paperclipai/paperclip`. Contains no Atlas Ops business logic.

## See also

- [`docs/HTTP-ADAPTER-FAMILY.md`](../../../docs/HTTP-ADAPTER-FAMILY.md) - architectural overview of all four HTTP adapters
- [`packages/adapter-utils`](../../adapter-utils/README.md) - shared HTTP substrate

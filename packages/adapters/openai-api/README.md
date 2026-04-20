# @ironworksai/adapter-openai-api

Routes IronWorks agent calls directly to OpenAI's Chat Completions API with support for the GPT-5 family, o4 reasoning models, structured outputs, and parallel tool calls.

## What this adapter does

Translates IronWorks execution requests into OpenAI Chat Completions API calls at `api.openai.com/v1/chat/completions`, handles the separate billing path for reasoning tokens on o4 models, and normalises the SSE response stream into IronWorks `NormalizedStreamEvent` objects.

## Models supported

| ID | Label | Reasoning model | Structured outputs | Max output tokens |
|---|---|---|---|---|
| `gpt-5` | GPT-5 | No | Yes | 16,384 |
| `gpt-5-mini` | GPT-5 Mini | No | Yes | 16,384 |
| `gpt-5-nano` | GPT-5 Nano | No | Yes | 8,192 |
| `chatgpt-latest` | ChatGPT Latest | No | No | 16,384 |
| `o4` | o4 | Yes | Yes | 32,768 |
| `o4-mini` | o4 Mini | Yes | Yes | 65,536 |
| `gpt-4o` | GPT-4o (legacy) | No | Yes | 16,384 |
| `gpt-4o-mini` | GPT-4o Mini (legacy) | No | Yes | 16,384 |

Legacy `gpt-4o` entries exist for backward compatibility with agents migrating from `poe-api`.

## Configuration

```json
{
  "model": "gpt-5",
  "apiKey": "${OPENAI_API_KEY}",
  "temperature": 0.7,
  "maxTokens": 8192,
  "parallelToolCalls": true,
  "structuredOutputSchema": {
    "name": "task_result",
    "schema": {
      "type": "object",
      "properties": {
        "summary": { "type": "string" },
        "status": { "type": "string", "enum": ["done", "blocked"] }
      },
      "required": ["summary", "status"],
      "additionalProperties": false
    },
    "strict": true
  },
  "systemPromptSkills": ["core-identity"]
}
```

| Field | Required | Description |
|---|---|---|
| `model` | Yes | OpenAI model ID from the table above |
| `apiKey` | No* | OpenAI API key or env-var reference. Falls back to `ADAPTER_OPENAI_API_KEY` |
| `temperature` | No | Float in `[0, 2]`. Not applicable to o4 reasoning models |
| `maxTokens` | No | Positive integer. Defaults to model max |
| `parallelToolCalls` | No | Boolean. Allow multiple tool calls in a single response. Disable when tool order matters |
| `structuredOutputSchema.name` | No* | Schema name matching `[a-zA-Z0-9_-]{1,64}` |
| `structuredOutputSchema.schema` | No* | JSON Schema object for the response structure |
| `structuredOutputSchema.strict` | No | Default `true`. Enforces strict schema adherence in OpenAI |
| `systemPromptSkills` | No | Skill keys inlined into system prompt (R18 stateless workaround) |

\* `apiKey` required if `ADAPTER_OPENAI_API_KEY` is not set. `structuredOutputSchema.name` and `.schema` are required together if either is provided.

## Environment variables

| Variable | Description |
|---|---|
| `ADAPTER_OPENAI_API_KEY` | OpenAI API key. Overrides `config.apiKey` if both are set |
| `ADAPTER_OPENAI_RATE_LIMIT_PER_MIN` | Requests per minute cap (default: 60). Uses token-bucket rate limiter |
| `ADAPTER_DISABLE_OPENAI` | Set to `"true"` to kill-switch this adapter across all agents |

## Features

- **GPT-5 family** - flagship non-reasoning models with structured outputs support
- **o4 reasoning models** - `o4` and `o4-mini` emit `reasoning_tokens` in usage; billed at the same rate as output tokens (E.3); `temperature` is not forwarded for reasoning models
- **Structured outputs** - `response_format: {type:"json_schema"}` enforces typed JSON responses matching the agent's schema; AJV-validated before forwarding to OpenAI
- **Parallel tool calls** - configurable via `parallelToolCalls`; disable when tools have conflicting side effects or when order of execution matters
- **Stateless session replay** - full transcript reconstructed per call via `session-replay.ts` (R17)
- **Cost tracking** - separate per-token-class rates for input, output, and reasoning tokens

## Tests

```sh
pnpm vitest run --project @ironworksai/adapter-openai-api
```

Current passing count: **56 tests** across config validation, reasoning model billing, structured outputs, parallel tool calls, and SSE normalisation.

## Not yet supported / caveats

- **Batch API stub only** - `openai-api` includes a stub for OpenAI's Batch API (async bulk inference at 50% cost). The stub accepts calls without erroring but does not submit batches. Full implementation is deferred to Phase O.

## Upstream-contribution status

Safe to upstream to `paperclipai/paperclip`. Contains no Atlas Ops business logic.

## See also

- [`docs/HTTP-ADAPTER-FAMILY.md`](../../../docs/HTTP-ADAPTER-FAMILY.md) - architectural overview of all four HTTP adapters
- [`packages/adapter-utils`](../../adapter-utils/README.md) - shared HTTP substrate

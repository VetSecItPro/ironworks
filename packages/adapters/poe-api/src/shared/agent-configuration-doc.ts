/**
 * Help text displayed in the IronWorks agent configuration UI for the poe_api adapter.
 * Plain text / markdown — no code, no runtime logic.
 */

export const agentConfigurationDoc = `# poe_api — Poe API Adapter

Adapter type: \`poe_api\`

## Overview

The \`poe_api\` adapter connects IronWorks agents to Poe's OpenAI-compatible
\`/v1/chat/completions\` endpoint. Poe aggregates 376+ models from Anthropic,
OpenAI, Google, Meta, and others under a single API key and billing account.

Use this adapter when:
- You want access to multiple model providers through one API key and subscription.
- You do not need Anthropic prompt caching (Poe does not expose cache control headers).
- Cost per token is acceptable at Poe rates rather than direct provider rates.

Do not use this adapter when:
- You need Anthropic prompt caching (use the \`anthropic_api\` adapter instead).
- You need extended thinking / reasoning token billing (use \`anthropic_api\`).
- Your deployment requires a direct data-processing agreement with Anthropic.

## Getting a Poe API Key

1. Sign in at https://poe.com
2. Navigate to https://poe.com/api_key
3. Click "Generate Key" to create a new API key.
4. Copy the key (it starts with \`sk-poe-\`).
5. Paste it into the \`apiKey\` field below, or set the \`ADAPTER_POE_API_KEY\`
   environment variable on your IronWorks server and use \`\${ADAPTER_POE_API_KEY}\`
   as the \`apiKey\` value.

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`apiKey\` | string | No* | Poe API key or env-var reference like \`\${POE_API_KEY}\`. *Required unless set via env. |
| \`model\` | string | Yes | Poe model ID. See the model list below. |
| \`temperature\` | number | No | Sampling temperature [0, 2]. Default: provider default. |
| \`maxTokens\` | number | No | Max completion tokens. |
| \`systemPromptSkills\` | string[] | No | IronWorks skill keys to inject into the system prompt (see "Skills" section). |

## Supported Models (Phase A discovery, 2026-04-19)

### Anthropic (via Poe)
| Model ID | Notes |
|----------|-------|
| \`claude-opus-4-7\` | Claude Opus 4.7 — highest capability |
| \`claude-sonnet-4-6\` | Claude Sonnet 4.6 — balanced speed/quality, tool_calls confirmed |
| \`claude-haiku-4-5\` | Claude Haiku 4.5 — fastest, lowest cost, tool_calls confirmed |
| \`claude-3-opus\` | Claude 3 Opus |

### OpenAI (via Poe)
| Model ID | Notes |
|----------|-------|
| \`gpt-5\` | GPT-5, tool_calls confirmed |
| \`gpt-4o\` | GPT-4o, tool_calls confirmed |
| \`gpt-4o-mini\` | GPT-4o mini |
| \`o4-mini\` | OpenAI o4-mini (reasoning model) |

### Google (via Poe)
| Model ID | Notes |
|----------|-------|
| \`gemini-2.5-pro\` | Gemini 2.5 Pro, tool_calls confirmed |
| \`gemini-2.0-flash\` | Gemini 2.0 Flash |

### Meta (via Poe)
| Model ID | Notes |
|----------|-------|
| \`llama-3.1-405b-instruct\` | Llama 3.1 405B — tool_calls support varies by prompt |
| \`llama-4-scout\` | Llama 4 Scout |

## Session Management

Poe's API is **stateless** — no server-side session storage. IronWorks replays
the full conversation transcript on every call. The session display ID is derived
from the first 10 characters of a SHA-256 hash of the transcript, purely for
human-readable display in the UI. Session state is stored in \`sessionParams\` on
the execution result.

## Tool Use

Tool use is supported via the OpenAI-compat \`tools\` parameter. IronWorks passes
defined tools to Poe which forwards them to the underlying provider. Whether a
specific model supports tool calling depends on the underlying model:
- Claude models: full tool_call support confirmed in Phase A probes.
- GPT models: full tool_call support confirmed.
- Gemini 2.5 Pro: tool_call support confirmed.
- Llama models: tool_call support is model-dependent; test before production use.

**R16 invariant:** IronWorks will NOT retry a request after a tool_call has been
emitted, even on a transient network error. This prevents double-execution of side
effects (file writes, external API calls, etc.). Any disconnect after a tool_call
emits an explicit error with code \`poe_api_stream_break_after_tool_call\`.

## Skills (systemPromptSkills)

Unlike the \`claude_local\` adapter, Poe cannot sync skill files to the agent's
file system. Instead, skills listed in \`systemPromptSkills\` are injected into the
system prompt as text at execute time. This means:
- Skills are always applied as system-prompt context, not as callable tools.
- Skills are not visible to IronWorks' skill sync UI as "installed".
- The \`getSkillSnapshot()\` for this adapter always returns \`mode: "unsupported"\`
  for the sync mechanism — see the \`systemPromptSkills\` field for prompt injection.

## Cost Notes

Poe charges at its own rates; see https://poe.com/api_key for current pricing.
IronWorks estimates cost using the Poe pricing table in \`adapter-utils/http/pricing-table.ts\`.
Prompt caching discounts are NOT available via Poe (cache_control headers are not
forwarded). For cache discounts, use the \`anthropic_api\` adapter directly.
`;

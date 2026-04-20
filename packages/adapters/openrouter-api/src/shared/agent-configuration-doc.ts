/**
 * Help text displayed in the IronWorks agent configuration UI for the openrouter_api adapter.
 * Plain text / markdown — no code, no runtime logic.
 */

export const agentConfigurationDoc = `# openrouter_api - OpenRouter API Adapter

Adapter type: \`openrouter_api\`

## Overview

The \`openrouter_api\` adapter connects IronWorks agents to
[OpenRouter](https://openrouter.ai), a unified gateway that routes requests to 200+
AI models from multiple providers (Meta, Mistral, Anthropic, OpenAI, Google, DeepSeek,
Qwen, xAI, Perplexity, and more) through a single OpenAI-compat API.

Use this adapter when:
- You want multi-provider routing with a single API key and a single bill.
- You need access to open-weight models (Llama 4, Mistral, Qwen, DeepSeek).
- You want to experiment with different models without managing multiple API keys.
- You're building workflows that benefit from model fallback / load balancing.
- You want access to specialized models (Perplexity Sonar for retrieval-grounded answers).

Do not use this adapter when:
- You require **Anthropic prompt caching** — OpenRouter does NOT pass through
  \`cache_control\` headers on most routes. Use the \`anthropic_api\` adapter
  directly to unlock prompt caching and its ~$400/mo fleet cost savings (see below).
- You need OpenAI structured outputs (JSON Schema enforcement) — use \`openai_api\` directly.
- You need access to Anthropic extended thinking — use \`anthropic_api\` directly.

## Prompt Caching - IMPORTANT

**OpenRouter does not relay Anthropic's \`cache_control\` headers through most routes.**

When calling Anthropic models (e.g. \`anthropic/claude-sonnet-4-6\`) via OpenRouter:
- Prompt caching is NOT active, even though the underlying model supports it.
- You pay full input token rates (~4x more than cached-read rate).
- For the Atlas Ops 13-agent fleet, this costs approximately $1,100/month more
  than calling \`anthropic_api\` directly with caching enabled.

For production Claude deployments, always use \`anthropic_api\` for caching.
Use this adapter for non-Anthropic models or for cost-insensitive evaluation workflows.

## Getting an OpenRouter API Key

1. Sign up at https://openrouter.ai
2. Navigate to https://openrouter.ai/keys
3. Click "Create key" and give it a name (e.g. "ironworks-atlas").
4. Copy the key (it starts with \`sk-or-v1-\`).
5. Paste it into the \`apiKey\` field below, or set the \`ADAPTER_OPENROUTER_API_KEY\`
   environment variable on your IronWorks server.

OpenRouter charges per token at published per-model rates plus a small (~5-15%)
routing markup. See https://openrouter.ai/models for current pricing.

## HTTP-Referer and X-Title Headers

OpenRouter recommends sending two custom headers on every request to identify the
calling application in your usage dashboard:

- **HTTP-Referer**: URL identifying your app (default: \`https://command.useapex.io\`)
- **X-Title**: Human-readable app name (default: \`IronWorks\`)

These can be overridden per-agent via the \`httpReferer\` and \`xTitle\` config fields.
OpenRouter uses these for analytics and rate-limit attribution — they are not
authenticated, so any string is acceptable.

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`apiKey\` | string | No* | OpenRouter API key or env-var ref like \`\${OPENROUTER_API_KEY}\`. *Required unless set via env. |
| \`model\` | string | Yes | OpenRouter model ID (e.g. \`meta-llama/llama-4-scout-17b-16e-instruct\`). |
| \`temperature\` | number | No | Sampling temperature [0, 2]. Default: model default. |
| \`maxTokens\` | number | No | Max completion tokens. Default: 4096. |
| \`httpReferer\` | string | No | HTTP-Referer header value. Default: \`https://command.useapex.io\`. |
| \`xTitle\` | string | No | X-Title header value. Default: \`IronWorks\`. |
| \`systemPromptSkills\` | string[] | No | IronWorks skill keys to inject into the system prompt. |

## Supported Models

| Model ID | Label | Provider | Notes |
|----------|-------|----------|-------|
| \`meta-llama/llama-4-scout-17b-16e-instruct\` | Llama 4 Scout 17B | Meta | Efficient multi-modal. Recommended default open-weight model. |
| \`meta-llama/llama-4-maverick-17b-128e-instruct\` | Llama 4 Maverick 17B | Meta | Larger context, stronger performance. |
| \`mistralai/mistral-large-2411\` | Mistral Large 2411 | Mistral | Strong European model, GDPR-friendly deployment path. |
| \`mistralai/mistral-small-2501\` | Mistral Small 2501 | Mistral | Fast and cost-effective. |
| \`anthropic/claude-opus-4-7\` | Claude Opus 4.7 | Anthropic* | Via OpenRouter relay — no prompt caching. |
| \`anthropic/claude-sonnet-4-6\` | Claude Sonnet 4.6 | Anthropic* | Via OpenRouter relay — no prompt caching. |
| \`openai/gpt-5\` | GPT-5 | OpenAI* | Via OpenRouter relay. |
| \`openai/gpt-5-mini\` | GPT-5 Mini | OpenAI* | Via OpenRouter relay. |
| \`google/gemini-2.5-flash\` | Gemini 2.5 Flash | Google | Fast, excellent long-context. |
| \`google/gemini-2.5-pro\` | Gemini 2.5 Pro | Google | Highest Google capability tier. |
| \`deepseek/deepseek-v3\` | DeepSeek V3 | DeepSeek | Strong coding and reasoning. |
| \`deepseek/deepseek-r1\` | DeepSeek R1 | DeepSeek | Reasoning model with chain-of-thought. |
| \`qwen/qwen-2.5-72b-instruct\` | Qwen 2.5 72B Instruct | Qwen | Strong multilingual and Asian-language tasks. |
| \`x-ai/grok-3-latest\` | Grok 3 Latest | xAI | Real-time web knowledge + strong reasoning. |
| \`perplexity/sonar-large\` | Perplexity Sonar Large | Perplexity | Retrieval-grounded factual answers. |

*For Anthropic and OpenAI models via relay, use \`anthropic_api\` or \`openai_api\` directly
to access provider-native features (prompt caching, structured outputs, extended thinking).

## Session Management

OpenRouter's API is **stateless** — no server-side session storage. IronWorks replays the
full conversation transcript on every call (R17 compliance). The session display ID is
derived from the first 10 characters of a SHA-256 hash of the transcript.

## Tool Use

Tool use is supported via OpenAI function-call format. IronWorks passes tool definitions
which OpenRouter returns as \`tool_calls\` in the response.

**R16 invariant:** IronWorks will NOT retry a request after a tool_call has been emitted,
even on a transient network error. This prevents double-execution of side effects.

## Skills (systemPromptSkills)

The OpenRouter HTTP API cannot sync skill files to an agent's file system. Instead, skills
listed in \`systemPromptSkills\` are injected into the system prompt as text at execute time.
The \`getSkillSnapshot()\` for this adapter always returns \`mode: "unsupported"\` for the
sync mechanism.

## Cost Notes

OpenRouter publishes per-model pricing at https://openrouter.ai/models. IronWorks uses a
pricing table (see \`pricing-table.ts\`) for cost estimation. If the specific model is not
in the table, usage is reported but \`costUsd\` is null (graceful R19 fallback — cost
tracking is non-blocking).

OpenRouter charges the per-model rate plus a routing markup (~5-15%). Check
https://openrouter.ai/models for current per-model billing.
`;

/**
 * Help text displayed in the IronWorks agent configuration UI for the anthropic_api adapter.
 * Plain text / markdown — no code, no runtime logic.
 */

export const agentConfigurationDoc = `# anthropic_api - Anthropic API Adapter

Adapter type: \`anthropic_api\`

## Overview

The \`anthropic_api\` adapter connects IronWorks agents directly to Anthropic's
native Messages API (\`/v1/messages\`). It uses Anthropic's native request/response
format — NOT the OpenAI-compat endpoint — which enables:

- **Prompt caching**: System prompts cached at ~10% of normal input token cost on hits,
  reducing Atlas fleet operating costs from ~$1500/mo to ~$400/mo at scale.
- **Extended thinking**: Reasoning tokens give Claude extra computation budget before
  answering, improving accuracy on complex tasks.
- **Native tool use**: Tool definitions use Anthropic's \`input_schema\` format for
  maximum fidelity with Claude's tool-calling capability.
- **Vision**: Image content blocks support URL or base64 inline images.

Use this adapter when:
- You need prompt caching for cost efficiency on repetitive agent workloads.
- You want extended thinking / reasoning for complex analysis tasks.
- Your deployment requires a direct data-processing agreement with Anthropic.
- You need the highest fidelity with Claude's native capabilities.

Do not use this adapter when:
- You want multi-provider fallback (use \`openrouter_api\` instead).
- You access Claude via a Poe subscription (use \`poe_api\` instead).

## Getting an Anthropic API Key

1. Sign in at https://console.anthropic.com
2. Navigate to https://console.anthropic.com/settings/keys
3. Click "Create Key" and give it a name (e.g. "ironworks-atlas").
4. Copy the key (it starts with \`sk-ant-\`).
5. Paste it into the \`apiKey\` field below, or set the \`ADAPTER_ANTHROPIC_API_KEY\`
   environment variable on your IronWorks server.

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`apiKey\` | string | No* | Anthropic API key or env-var ref like \`\${ANTHROPIC_API_KEY}\`. *Required unless set via env. |
| \`model\` | string | Yes | Claude model ID. See the model list below. |
| \`temperature\` | number | No | Sampling temperature [0, 1]. Default: Anthropic default. Incompatible with extended thinking. |
| \`maxTokens\` | number | No | Max completion tokens. Default: 4096. |
| \`cacheControl.breakpoints\` | number | No | Number of system-prompt cache breakpoints (1-2). Enables prompt caching. |
| \`extendedThinking.budgetTokens\` | number | No | Reasoning token budget (>= 1024). Enables extended thinking. |
| \`systemPromptSkills\` | string[] | No | IronWorks skill keys to inject into the system prompt (see "Skills" section). |

## Supported Models

| Model ID | Label | Extended Thinking | Notes |
|----------|-------|-------------------|-------|
| \`claude-opus-4-7\` | Claude Opus 4.7 | Yes | Highest capability. Best for complex reasoning. |
| \`claude-sonnet-4-6\` | Claude Sonnet 4.6 | Yes | Balanced speed/quality. Recommended for most agents. |
| \`claude-haiku-4-5\` | Claude Haiku 4.5 | No | Fastest, lowest cost. Best for high-volume simple tasks. |

## Prompt Caching (D.4)

Enable with \`cacheControl: { breakpoints: 1 }\`.

On the first call, Anthropic stores your system prompt in a cache block (charged at
1.25x normal input rate). On subsequent calls with the same system prompt, Anthropic
reads from cache at ~0.1x normal input rate — a 90% discount.

For the Atlas fleet's 13 agents running with a shared system prompt, prompt caching
targets ~$400/mo operating cost vs ~$1500/mo without caching.

**Cache breakpoints:**
- \`1\` — cache the entire system prompt as one block.
- \`2\` — cache the system prompt in two blocks (e.g. header + tool definitions) for
  finer-grained invalidation on partial updates.

## Extended Thinking (D.5)

Enable with \`extendedThinking: { budgetTokens: N }\` (minimum 1024).

When enabled, Claude generates "thinking" content blocks containing its reasoning
before the final response. Thinking tokens are billed at the model's output token rate
and are returned in the response stream (visible to IronWorks logs as reasoning context).

Recommended for: complex analysis, multi-step planning, adversarial evaluation.

Only supported on \`claude-opus-4-7\` and \`claude-sonnet-4-6\`.

## Vision / Files (D.6)

Supported via Anthropic-native image content blocks. Pass image URLs or base64-encoded
images in the message content. Supported media types: image/jpeg, image/png, image/gif,
image/webp.

## Session Management

Anthropic's Messages API is **stateless** — no server-side session storage. IronWorks
replays the full conversation transcript on every call (R17 compliance). The session
display ID is derived from the first 10 characters of a SHA-256 hash of the transcript.

## Tool Use

Tool use is supported via Anthropic-native tool definitions (JSON Schema in \`input_schema\`).
IronWorks passes tool definitions to Claude which returns tool_use content blocks.

**R16 invariant:** IronWorks will NOT retry a request after a tool_call has been emitted,
even on a transient network error. This prevents double-execution of side effects (file
writes, external API calls, etc.). Any disconnect after a tool_call emits an explicit
error with code \`anthropic_api_stream_break_after_tool_call\`.

## Skills (systemPromptSkills)

Unlike the \`claude_local\` adapter, the Anthropic HTTP API cannot sync skill files to
the agent's file system. Instead, skills listed in \`systemPromptSkills\` are injected
into the system prompt as text at execute time. The \`getSkillSnapshot()\` for this
adapter always returns \`mode: "unsupported"\` for the sync mechanism.

## Cost Notes

Cost is computed from Anthropic's per-token rates including the following token classes:
- **input_tokens**: Standard prompt tokens at input rate.
- **cache_creation_input_tokens**: New cache-block creation at 1.25x input rate (one-time).
- **cache_read_input_tokens**: Cache hits at ~0.1x input rate (recurring savings).
- **output_tokens**: Completion tokens at output rate.

IronWorks tracks all four classes separately for R19 cost reconciliation accuracy.
`;

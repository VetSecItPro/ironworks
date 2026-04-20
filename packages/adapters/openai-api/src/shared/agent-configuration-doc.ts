/**
 * Help text displayed in the IronWorks agent configuration UI for the openai_api adapter.
 * Plain text / markdown — no code, no runtime logic.
 */

export const agentConfigurationDoc = `# openai_api - OpenAI API Adapter

Adapter type: \`openai_api\`

## Overview

The \`openai_api\` adapter connects IronWorks agents directly to OpenAI's
Chat Completions API (\`/v1/chat/completions\`). It uses OpenAI's native endpoint
(not a proxy like Poe) enabling:

- **Structured outputs**: JSON Schema enforcement via \`response_format: {type: "json_schema"}\`
  guarantees schema-conformant responses on every call (E.4).
- **Reasoning models**: o4 and o4-mini emit \`reasoning_tokens\` — extended chain-of-thought
  reasoning before the final answer, billed at output token rate.
- **Prompt caching**: OpenAI automatically caches common prompt prefixes at 50% discount
  (no configuration required; billing shows as \`cached_tokens\` in usage).
- **Native tool use**: Tool definitions in OpenAI function-call format. Parallel tool calls
  configurable via \`parallelToolCalls\`.

Use this adapter when:
- You need structured JSON outputs with enforced schema (use \`structuredOutputSchema\`).
- You want OpenAI's reasoning models (o4, o4-mini) for complex multi-step tasks.
- Your deployment requires direct access to OpenAI (e.g. data residency requirements).
- You are migrating an agent from poe-api that was using GPT-5 or GPT-4o models.

Do not use this adapter when:
- You want multi-provider fallback routing (use \`openrouter_api\` instead).
- You access GPT models via a Poe subscription (use \`poe_api\` instead).

## Getting an OpenAI API Key

1. Sign in at https://platform.openai.com
2. Navigate to https://platform.openai.com/api-keys
3. Click "Create new secret key" and give it a name (e.g. "ironworks-atlas").
4. Copy the key (it starts with \`sk-proj-\` or \`sk-\`).
5. Paste it into the \`apiKey\` field below, or set the \`ADAPTER_OPENAI_API_KEY\`
   environment variable on your IronWorks server.

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`apiKey\` | string | No* | OpenAI API key or env-var ref like \`\${OPENAI_API_KEY}\`. *Required unless set via env. |
| \`model\` | string | Yes | OpenAI model ID. See model list below. |
| \`temperature\` | number | No | Sampling temperature [0, 2]. Default: OpenAI default (~1.0). Not applicable to reasoning models. |
| \`maxTokens\` | number | No | Max completion tokens. Default: 4096. |
| \`structuredOutputSchema.name\` | string | No* | Schema name (required when using structured outputs). Must match \`[a-zA-Z0-9_-]{1,64}\`. |
| \`structuredOutputSchema.schema\` | object | No* | JSON Schema for the expected response (required with structuredOutputSchema). |
| \`structuredOutputSchema.strict\` | boolean | No | Enforce strict schema adherence. Default: true. |
| \`parallelToolCalls\` | boolean | No | Allow parallel tool invocations. Default: OpenAI default (true). Set false if tools have conflicting side effects. |
| \`systemPromptSkills\` | string[] | No | IronWorks skill keys to inject into the system prompt (see "Skills" section). |

## Supported Models

| Model ID | Label | Reasoning | Structured Outputs | Notes |
|----------|-------|-----------|-------------------|-------|
| \`gpt-5\` | GPT-5 | No | Yes | Flagship model. Best capability/cost balance. |
| \`gpt-5-mini\` | GPT-5 Mini | No | Yes | Fast and affordable. Recommended for most agents. |
| \`gpt-5-nano\` | GPT-5 Nano | No | Yes | Smallest and cheapest. High-volume simple tasks. |
| \`chatgpt-latest\` | ChatGPT Latest | No | No | Alias for OpenAI's latest ChatGPT-class model. |
| \`o4\` | o4 | Yes | Yes | Highest reasoning capability. Complex analysis and planning. |
| \`o4-mini\` | o4 Mini | Yes | Yes | Faster reasoning at lower cost. Recommended for reasoning tasks. |
| \`gpt-4o\` | GPT-4o (legacy) | No | Yes | Backward-compat for migrating agents from poe-api. |
| \`gpt-4o-mini\` | GPT-4o Mini (legacy) | No | Yes | Backward-compat for migrating agents from poe-api. |

## Reasoning Models (o4 family) — Important Notes

The o4 and o4-mini models perform internal chain-of-thought reasoning before emitting
the final response. Key differences from standard models:

- **reasoning_tokens** appear in the usage summary alongside prompt and completion tokens.
- Reasoning tokens are billed at the same rate as output tokens (not at a discount).
- Temperature is not applicable to reasoning models — omit the \`temperature\` field.
- Response latency is higher due to the reasoning phase; budget accordingly.
- Reasoning content itself is not returned in the stream — only the final answer.

Recommended for: complex multi-step planning, adversarial evaluation, code generation
with correctness requirements.

## Structured Outputs (E.4)

Enable with \`structuredOutputSchema\`:

\`\`\`json
{
  "structuredOutputSchema": {
    "name": "analysis_result",
    "schema": {
      "type": "object",
      "properties": {
        "summary": { "type": "string" },
        "confidence": { "type": "number" }
      },
      "required": ["summary", "confidence"],
      "additionalProperties": false
    },
    "strict": true
  }
}
\`\`\`

When \`strict: true\` (default), OpenAI guarantees the response matches the schema exactly.
When \`strict: false\`, the schema is a best-effort hint (not guaranteed).

Structured outputs are supported on all GPT-5 and o4 family models. Not supported on
\`chatgpt-latest\`.

## Session Management

OpenAI's Chat Completions API is **stateless** — no server-side session storage. IronWorks
replays the full conversation transcript on every call (R17 compliance). The session
display ID is derived from the first 10 characters of a SHA-256 hash of the transcript.

## Tool Use

Tool use is supported via OpenAI function-call format. IronWorks passes tool definitions
which OpenAI returns as \`tool_calls\` in the response.

**parallel_tool_calls**: When enabled (default), OpenAI may call multiple tools in a
single response. Set \`parallelToolCalls: false\` if your tools have conflicting side
effects or if execution order must be deterministic.

**R16 invariant:** IronWorks will NOT retry a request after a tool_call has been emitted,
even on a transient network error. This prevents double-execution of side effects (file
writes, external API calls, etc.). Any disconnect after a tool_call emits an explicit
error with code \`openai_api_stream_break_after_tool_call\`.

## Skills (systemPromptSkills)

Unlike the \`codex_local\` adapter, the OpenAI HTTP API cannot sync skill files to
the agent's file system. Instead, skills listed in \`systemPromptSkills\` are injected
into the system prompt as text at execute time. The \`getSkillSnapshot()\` for this
adapter always returns \`mode: "unsupported"\` for the sync mechanism.

## Cost Notes

Cost is computed from OpenAI's per-token rates including the following token classes:
- **prompt_tokens**: Standard input tokens at input rate.
- **cached_tokens**: Prompt prefix cache hits at 50% discount (automatic, no config needed).
- **completion_tokens**: Output tokens at output rate.
- **reasoning_tokens**: o4 family reasoning tokens billed at same rate as output tokens.

IronWorks tracks all token classes separately for R19 cost reconciliation accuracy.
`;

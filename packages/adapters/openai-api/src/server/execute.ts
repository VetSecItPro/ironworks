/**
 * OpenAI API execute — sends full transcript to https://api.openai.com/v1/chat/completions
 * using OpenAI's Chat Completions API format (same OpenAI-compat shape as poe-api but
 * hitting OpenAI's native endpoint directly).
 *
 * Key OpenAI-specific features vs poe-api:
 * - response_format: {type: "json_schema", json_schema: {...}} for structured outputs (E.4)
 * - parallel_tool_calls: boolean flag to control concurrent tool execution
 * - stream_options: {include_usage: true} to get usage in the final SSE chunk
 * - Reasoning models (o4, o4-mini): reasoning_tokens in usage, billed at output rate (E.3)
 * - Batch API: out-of-scope for Phase E (see TODO comment in execute.ts body)
 *
 * Stateless (R17): full-transcript replay via session-replay.ts on every call.
 */

import type { AdapterExecutionContext, AdapterExecutionResult } from "@ironworksai/adapter-utils";
import { computeCost } from "@ironworksai/adapter-utils/http/cost";
import { HttpAdapterAuthError, HttpAdapterError, HttpAdapterStreamBreak } from "@ironworksai/adapter-utils/http/errors";
import type { RateLimiter } from "@ironworksai/adapter-utils/http/rate-limiter";
import { DEFAULT_RETRY_POLICY, runWithRetry } from "@ironworksai/adapter-utils/http/retry";
import { appendTurn, buildTranscript, deserializeSession } from "@ironworksai/adapter-utils/http/session-replay";
import type { UsageSummary } from "@ironworksai/adapter-utils/http/sse-parser";
import { parseSseStream } from "@ironworksai/adapter-utils/http/sse-parser";
import type { Transport } from "@ironworksai/adapter-utils/http/transport";
import { validateOpenAIConfig } from "../shared/config.js";
import { adapterRateLimiter } from "./rate-limit-config.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const ADAPTER_TYPE = "openai_api";

const DEFAULT_SYSTEM_PROMPT = "You are a helpful AI agent operating inside the IronWorks multi-agent framework.";

/**
 * TODO: OpenAI Batch API support is out-of-scope for Phase E.
 *
 * The Batch API (https://platform.openai.com/docs/guides/batch) allows async processing
 * of large volumes of Chat Completion requests at 50% cost with 24-hour turnaround.
 * Useful for fleet-wide daily digests and non-real-time analysis tasks.
 *
 * Scheduled for Phase O (Tier-2 polish) — requires:
 *   - POST /v1/batches to submit, GET /v1/batches/{id} to poll
 *   - JSONL request file upload via Files API (/v1/files)
 *   - Separate BatchAdapterExecutionResult surface to IronWorks
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveApiKey(config: Record<string, unknown>): string | null {
  const raw = config.apiKey;
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const trimmed = raw.trim();
  // Resolve env-var references like "${OPENAI_API_KEY}"
  const envRef = trimmed.match(/^\$\{([^}]+)\}$/);
  if (envRef) {
    return process.env[envRef[1]] ?? null;
  }
  return trimmed;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function errorCodeFrom(err: unknown): string {
  if (err instanceof HttpAdapterError) {
    if (err.code === "auth_failed") return "openai_api_auth_error";
    if (err.code === "rate_limited") return "openai_api_rate_limit_error";
    if (err.code === "server_error") return "openai_api_server_error";
    if (err.code === "timeout") return "openai_api_timeout";
    if (err.code === "stream_break") return "openai_api_stream_break";
    if (err.code === "circuit_open") return "openai_api_circuit_open";
    return `openai_api_${err.code}`;
  }
  return "openai_api_error";
}

function errorMessageFrom(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// Core execute
// ---------------------------------------------------------------------------

export async function execute(
  ctx: AdapterExecutionContext,
  /** Injectable transport for testing — production uses createTransport() from transport.ts */
  transport: Transport,
  /** Injectable rate limiter for testing — production uses the module-level adapterRateLimiter */
  rateLimiter: RateLimiter = adapterRateLimiter,
): Promise<AdapterExecutionResult> {
  // Validate config before any network activity
  const validation = validateOpenAIConfig(ctx.config);
  if (!validation.ok) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: validation.error,
      errorCode: "openai_api_config_error",
    };
  }

  const { config } = validation;
  const model = config.model;

  const apiKey = resolveApiKey(ctx.config) ?? process.env.ADAPTER_OPENAI_API_KEY ?? null;
  if (!apiKey) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage:
        "OpenAI API key is not configured. Set apiKey in adapter config or ADAPTER_OPENAI_API_KEY environment variable.",
      errorCode: "openai_api_config_error",
    };
  }

  // Acquire a rate-limit token before any network I/O.
  await rateLimiter.acquire(ADAPTER_TYPE);

  // Emit meta before network I/O so IronWorks can record invocation start
  if (ctx.onMeta) {
    await ctx.onMeta({
      adapterType: ADAPTER_TYPE,
      command: "POST",
      commandArgs: [OPENAI_API_URL],
      context: ctx.context,
    });
  }

  // Build message list from prior session state + new user turn (R17 stateless replay)
  const priorSession = deserializeSession(ctx.runtime.sessionParams);
  type MessageTurn = import("@ironworksai/adapter-utils/http/session-replay").MessageTurn;
  let sessionState = priorSession ?? { turns: [] as MessageTurn[] };

  const userMessage =
    asString(ctx.context.wakeReason) ?? asString(ctx.context.taskId) ?? asString(ctx.context.issueId) ?? "Start.";

  sessionState = appendTurn(sessionState, { role: "user", content: userMessage });

  // buildTranscript with format:"openai" returns a plain messages array
  const messages = buildTranscript(sessionState, { format: "openai" }) as unknown[];

  // Build OpenAI Chat Completions request body
  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: config.maxTokens ?? 4096,
    // System prompt as first message in the OpenAI messages array
    messages: [{ role: "system", content: DEFAULT_SYSTEM_PROMPT }, ...messages],
    stream: true,
    // include_usage in final SSE chunk so we capture token counts without a second round-trip
    stream_options: { include_usage: true },
    ...(typeof config.temperature === "number" ? { temperature: config.temperature } : {}),
    // Structured outputs (E.4): pass response_format when schema is configured
    ...(config.structuredOutputSchema !== undefined
      ? {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: config.structuredOutputSchema.name,
              schema: config.structuredOutputSchema.schema,
              strict: config.structuredOutputSchema.strict ?? true,
            },
          },
        }
      : {}),
    // Explicit parallel_tool_calls only when the caller configures it — undefined means let OpenAI decide
    ...(config.parallelToolCalls !== undefined ? { parallel_tool_calls: config.parallelToolCalls } : {}),
  };

  // Shared mutable flag — set true when a tool_call event is emitted.
  // runWithRetry checks this BEFORE any retry decision (R16 invariant).
  const toolCallFlag = { emitted: false };

  let usage: UsageSummary | undefined;
  const textChunks: string[] = [];

  try {
    await runWithRetry(
      async (retryCtx) => {
        const response = await transport.sendJsonStream({
          url: OPENAI_API_URL,
          apiKey,
          body: requestBody,
        });

        // parseSseStream with format:"openai" handles OpenAI-compat SSE delta events
        for await (const event of parseSseStream(response.body, { format: "openai" })) {
          if (event.type === "text_delta") {
            textChunks.push(event.text);
            await ctx.onLog("stdout", event.text);
          } else if (event.type === "tool_use_start") {
            // R16: mark flag immediately — any disconnect after this must not retry
            retryCtx.toolCallFlag.emitted = true;
            await ctx.onLog("stdout", `[openai-api] tool_call: ${event.toolName} (id=${event.toolCallId})\n`);
          } else if (event.type === "tool_use_complete") {
            await ctx.onLog("stdout", `[openai-api] tool_call_complete: ${event.toolCallId} args=${event.argsJson}\n`);
          } else if (event.type === "stream_error") {
            await ctx.onLog("stderr", `[openai-api] stream_error code=${event.code}: ${event.message}\n`);
          } else if (event.type === "parse_warning") {
            await ctx.onLog("stderr", `[openai-api] parse_warning code=${event.code}: ${event.message}\n`);
          } else if (event.type === "done") {
            usage = event.usage;
          }
        }
      },
      {
        policy: {
          ...DEFAULT_RETRY_POLICY,
          baseDelayMs: 200,
        },
        toolCallFlag,
        onRetry: (event) => {
          void ctx.onLog(
            "stderr",
            `[openai-api] retry attempt=${event.attempt + 1} after error: ${errorMessageFrom(event.error)}\n`,
          );
        },
      },
    );
  } catch (err) {
    if (err instanceof HttpAdapterAuthError) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: errorMessageFrom(err),
        errorCode: "openai_api_auth_error",
      };
    }

    // R16: stream break after tool_call — signal partial completion, do not retry
    if (err instanceof HttpAdapterStreamBreak && err.toolCallEmitted) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `OpenAI API stream disconnected after tool_call was emitted: ${errorMessageFrom(err)}. Partial completion - NOT retried.`,
        errorCode: "openai_api_stream_break_after_tool_call",
      };
    }

    return {
      exitCode: 1,
      signal: null,
      timedOut: err instanceof HttpAdapterError && err.code === "timeout",
      errorMessage: errorMessageFrom(err),
      errorCode: errorCodeFrom(err),
    };
  }

  // Compute cost — OpenAI pricing includes reasoning_tokens for o4 family (E.3)
  let costUsd: number | null = null;
  if (usage) {
    const costResult = computeCost("openai", model, usage);
    costUsd = costResult.totalUsd > 0 ? costResult.totalUsd : null;
    if (costResult.warnings.length > 0) {
      await ctx.onLog("stderr", `[openai-api] cost warnings: ${costResult.warnings.join("; ")}\n`);
    }
  }

  // Build updated session state for R17 replay on next turn
  const summary = textChunks.join("").trim();
  const assistantContent = summary.length > 0 ? summary : null;
  const newSessionState = assistantContent
    ? appendTurn(sessionState, { role: "assistant", content: assistantContent })
    : sessionState;

  const sessionParams = newSessionState.turns.length > 0 ? { turns: newSessionState.turns } : null;

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    provider: "openai",
    model,
    ...(usage
      ? {
          usage: {
            inputTokens: usage.promptTokens,
            outputTokens: usage.completionTokens,
            // E.3: reasoning tokens billed at same rate as output for o4 family
            ...(usage.reasoningTokens !== undefined ? { reasoningTokens: usage.reasoningTokens } : {}),
            // OpenAI also supports prompt caching — track when present
            ...(usage.cachedPromptTokens !== undefined ? { cachedInputTokens: usage.cachedPromptTokens } : {}),
          },
        }
      : {}),
    ...(costUsd !== null ? { costUsd } : {}),
    ...(summary.length > 0 ? { summary } : {}),
    ...(sessionParams ? { sessionParams } : {}),
  };
}

/**
 * OpenRouter API execute — sends full transcript to https://openrouter.ai/api/v1/chat/completions
 * using OpenAI-compat Chat Completions API format (same shape as poe-api and openai-api).
 *
 * OpenRouter-specific features:
 * - HTTP-Referer and X-Title headers per OpenRouter convention (identifies the app in dashboards)
 * - Multi-provider routing — the model ID prefix (e.g. "meta-llama/", "anthropic/") tells
 *   OpenRouter which upstream provider to call
 * - No prompt caching passthrough on most routes — use anthropic_api directly for caching (F.4)
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
import { validateOpenRouterConfig } from "../shared/config.js";
import { isAdapterDisabled } from "./kill-switch.js";
import { adapterRateLimiter } from "./rate-limit-config.js";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const ADAPTER_TYPE = "openrouter_api";

// Default identifying headers sent on every request per OpenRouter convention.
// Operators can override via httpReferer / xTitle in adapter config.
const DEFAULT_HTTP_REFERER = "https://command.useapex.io";
const DEFAULT_X_TITLE = "IronWorks";

const DEFAULT_SYSTEM_PROMPT = "You are a helpful AI agent operating inside the IronWorks multi-agent framework.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveApiKey(config: Record<string, unknown>): string | null {
  const raw = config.apiKey;
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const trimmed = raw.trim();
  // Resolve env-var references like "${OPENROUTER_API_KEY}"
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
    if (err.code === "auth_failed") return "openrouter_api_auth_error";
    if (err.code === "rate_limited") return "openrouter_api_rate_limit_error";
    if (err.code === "server_error") return "openrouter_api_server_error";
    if (err.code === "timeout") return "openrouter_api_timeout";
    if (err.code === "stream_break") return "openrouter_api_stream_break";
    if (err.code === "circuit_open") return "openrouter_api_circuit_open";
    return `openrouter_api_${err.code}`;
  }
  return "openrouter_api_error";
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
  // Kill-switch: ADAPTER_DISABLE_OPENROUTER_API=1 → refuse immediately without network I/O
  if (isAdapterDisabled()) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "adapter disabled by ADAPTER_DISABLE_OPENROUTER_API env",
      errorCode: "openrouter_api_disabled",
    };
  }

  // Validate config before any network activity
  const validation = validateOpenRouterConfig(ctx.config);
  if (!validation.ok) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: validation.error,
      errorCode: "openrouter_api_config_error",
    };
  }

  const { config } = validation;
  const model = config.model;

  const apiKey = resolveApiKey(ctx.config) ?? process.env.ADAPTER_OPENROUTER_API_KEY ?? null;
  if (!apiKey) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage:
        "OpenRouter API key is not configured. Set apiKey in adapter config or ADAPTER_OPENROUTER_API_KEY environment variable.",
      errorCode: "openrouter_api_config_error",
    };
  }

  // Acquire a rate-limit token before any network I/O.
  await rateLimiter.acquire(ADAPTER_TYPE);

  // Emit meta before network I/O so IronWorks can record invocation start
  if (ctx.onMeta) {
    await ctx.onMeta({
      adapterType: ADAPTER_TYPE,
      command: "POST",
      commandArgs: [OPENROUTER_API_URL],
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

  // buildTranscript with format:"openai" produces the OpenAI-compat messages array
  // that OpenRouter accepts (same wire format as openai-api and poe-api).
  const messages = buildTranscript(sessionState, { format: "openai" }) as unknown[];

  // OpenRouter identifying headers — required per their convention for routing/dashboards.
  // Configurable so operators can brand their own deployments.
  const httpReferer = config.httpReferer ?? DEFAULT_HTTP_REFERER;
  const xTitle = config.xTitle ?? DEFAULT_X_TITLE;

  // Build OpenAI-compat request body
  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: config.maxTokens ?? 4096,
    messages: [{ role: "system", content: DEFAULT_SYSTEM_PROMPT }, ...messages],
    stream: true,
    // include_usage in final SSE chunk to capture token counts without a second round-trip
    stream_options: { include_usage: true },
    ...(typeof config.temperature === "number" ? { temperature: config.temperature } : {}),
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
          url: OPENROUTER_API_URL,
          apiKey,
          body: requestBody,
          // OpenRouter convention: send these on every request so the gateway can
          // identify the calling app in analytics and rate-limit attribution.
          extraHeaders: {
            "HTTP-Referer": httpReferer,
            "X-Title": xTitle,
          },
        });

        // parseSseStream with format:"openai" handles OpenAI-compat SSE delta events
        for await (const event of parseSseStream(response.body, { format: "openai" })) {
          if (event.type === "text_delta") {
            textChunks.push(event.text);
            await ctx.onLog("stdout", event.text);
          } else if (event.type === "tool_use_start") {
            // R16: mark flag immediately — any disconnect after this must not retry
            retryCtx.toolCallFlag.emitted = true;
            await ctx.onLog("stdout", `[openrouter-api] tool_call: ${event.toolName} (id=${event.toolCallId})\n`);
          } else if (event.type === "tool_use_complete") {
            await ctx.onLog(
              "stdout",
              `[openrouter-api] tool_call_complete: ${event.toolCallId} args=${event.argsJson}\n`,
            );
          } else if (event.type === "stream_error") {
            await ctx.onLog("stderr", `[openrouter-api] stream_error code=${event.code}: ${event.message}\n`);
          } else if (event.type === "parse_warning") {
            await ctx.onLog("stderr", `[openrouter-api] parse_warning code=${event.code}: ${event.message}\n`);
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
            `[openrouter-api] retry attempt=${event.attempt + 1} after error: ${errorMessageFrom(event.error)}\n`,
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
        errorCode: "openrouter_api_auth_error",
      };
    }

    // R16: stream break after tool_call — signal partial completion, do not retry
    if (err instanceof HttpAdapterStreamBreak && err.toolCallEmitted) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `OpenRouter API stream disconnected after tool_call was emitted: ${errorMessageFrom(err)}. Partial completion - NOT retried.`,
        errorCode: "openrouter_api_stream_break_after_tool_call",
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

  // Compute cost — OpenRouter relays to multiple providers; use "openrouter" as provider key
  // in pricing-table.ts. If the specific model isn't in the table, costUsd is null (R19 graceful).
  let costUsd: number | null = null;
  if (usage) {
    const costResult = computeCost("openrouter", model, usage);
    costUsd = costResult.totalUsd > 0 ? costResult.totalUsd : null;
    if (costResult.warnings.length > 0) {
      await ctx.onLog("stderr", `[openrouter-api] cost warnings: ${costResult.warnings.join("; ")}\n`);
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
    provider: "openrouter",
    model,
    ...(usage
      ? {
          usage: {
            inputTokens: usage.promptTokens,
            outputTokens: usage.completionTokens,
            ...(usage.cachedPromptTokens !== undefined ? { cachedInputTokens: usage.cachedPromptTokens } : {}),
          },
        }
      : {}),
    ...(costUsd !== null ? { costUsd } : {}),
    ...(summary.length > 0 ? { summary } : {}),
    ...(sessionParams ? { sessionParams } : {}),
  };
}

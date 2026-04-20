/**
 * Poe API execute — sends full transcript to https://api.poe.com/v1/chat/completions
 * (OpenAI-compat endpoint) and streams the response back to IronWorks.
 *
 * Poe is entirely stateless: every call replays the full conversation history via
 * session-replay.ts. The session codec only carries a hash-based display ID (R17).
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
import { validatePoeConfig } from "../shared/config.js";
import { isAdapterDisabled } from "./kill-switch.js";
import { adapterRateLimiter } from "./rate-limit-config.js";

const POE_API_URL = "https://api.poe.com/v1/chat/completions";
const ADAPTER_TYPE = "poe_api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveApiKey(config: Record<string, unknown>): string | null {
  const raw = config.apiKey;
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const trimmed = raw.trim();
  // Resolve environment-variable references like "${POE_API_KEY}"
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
    if (err.code === "auth_failed") return "poe_api_auth_error";
    if (err.code === "rate_limited") return "poe_api_rate_limit_error";
    if (err.code === "server_error") return "poe_api_server_error";
    if (err.code === "timeout") return "poe_api_timeout";
    if (err.code === "stream_break") return "poe_api_stream_break";
    if (err.code === "circuit_open") return "poe_api_circuit_open";
    return `poe_api_${err.code}`;
  }
  return "poe_api_error";
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
  // Pre-flight: kill-switch check. ADAPTER_DISABLE_POE_API=1 hard-disables this adapter
  // with no network I/O. Checked before config validation so disabling works even when
  // config is invalid (helps during incident response when the config state is unknown).
  if (isAdapterDisabled()) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "adapter disabled by ADAPTER_DISABLE_POE_API env",
      errorCode: "poe_api_disabled",
    };
  }

  // Validate config before any network activity
  const validation = validatePoeConfig(ctx.config);
  if (!validation.ok) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: validation.error,
      errorCode: "poe_api_config_error",
    };
  }

  const { config } = validation;
  const model = config.model;

  const apiKey = resolveApiKey(ctx.config) ?? process.env.ADAPTER_POE_API_KEY ?? null;
  if (!apiKey) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage:
        "Poe API key is not configured. Set apiKey in adapter config or ADAPTER_POE_API_KEY environment variable.",
      errorCode: "poe_api_config_error",
    };
  }

  // Acquire a rate-limit token before any network I/O.
  // This is the primary throttle guard — if the bucket is depleted the call queues here
  // until a token is available. The limiter key is the adapter type so all poe_api calls
  // share a single bucket regardless of agent or workspace.
  await rateLimiter.acquire(ADAPTER_TYPE);

  // Emit meta before network I/O so IronWorks can record invocation start
  if (ctx.onMeta) {
    await ctx.onMeta({
      adapterType: ADAPTER_TYPE,
      command: "POST",
      commandArgs: [POE_API_URL],
      context: ctx.context,
    });
  }

  // Build the message list from prior session state + new user turn
  const priorSession = deserializeSession(ctx.runtime.sessionParams);
  let sessionState = priorSession ?? {
    turns: [] as import("@ironworksai/adapter-utils/http/session-replay").MessageTurn[],
  };

  // Extract the current task/issue as the user message content
  const userMessage =
    asString(ctx.context.wakeReason) ?? asString(ctx.context.taskId) ?? asString(ctx.context.issueId) ?? "Start.";

  sessionState = appendTurn(sessionState, { role: "user", content: userMessage });

  const transcript = buildTranscript(sessionState, { format: "openai" }) as unknown[];

  const requestBody: Record<string, unknown> = {
    model,
    messages: transcript,
    stream: true,
    ...(typeof config.temperature === "number" ? { temperature: config.temperature } : {}),
    ...(typeof config.maxTokens === "number" ? { max_tokens: config.maxTokens } : {}),
  };

  // Shared mutable flag — set to true when a tool_call event is emitted.
  // runWithRetry checks this BEFORE any retry decision (R16 invariant).
  const toolCallFlag = { emitted: false };

  let usage: UsageSummary | undefined;
  const textChunks: string[] = [];
  const toolCallLog: string[] = [];

  try {
    await runWithRetry(
      async (retryCtx) => {
        const response = await transport.sendJsonStream({
          url: POE_API_URL,
          apiKey,
          body: requestBody,
        });

        // Stream parse — yields NormalizedStreamEvent objects
        for await (const event of parseSseStream(response.body, { format: "openai" })) {
          if (event.type === "text_delta") {
            textChunks.push(event.text);
            await ctx.onLog("stdout", event.text);
          } else if (event.type === "tool_use_start") {
            // Mark flag immediately — any disconnect after this must not retry (R16)
            retryCtx.toolCallFlag.emitted = true;
            toolCallLog.push(event.toolName);
            await ctx.onLog("stdout", `[poe-api] tool_call: ${event.toolName} (id=${event.toolCallId})\n`);
          } else if (event.type === "tool_use_complete") {
            await ctx.onLog("stdout", `[poe-api] tool_call_complete: ${event.toolCallId} args=${event.argsJson}\n`);
          } else if (event.type === "stream_error") {
            await ctx.onLog("stderr", `[poe-api] stream_error code=${event.code}: ${event.message}\n`);
          } else if (event.type === "parse_warning") {
            await ctx.onLog("stderr", `[poe-api] parse_warning code=${event.code}: ${event.message}\n`);
          } else if (event.type === "done") {
            usage = event.usage;
          }
        }
      },
      {
        policy: {
          ...DEFAULT_RETRY_POLICY,
          baseDelayMs: 200, // Shorter for Poe since it's typically fast
        },
        toolCallFlag,
        onRetry: (event) => {
          void ctx.onLog(
            "stderr",
            `[poe-api] retry attempt=${event.attempt + 1} after error: ${errorMessageFrom(event.error)}\n`,
          );
        },
      },
    );
  } catch (err) {
    // Auth errors are non-retryable — return immediately with clear code
    if (err instanceof HttpAdapterAuthError) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: errorMessageFrom(err),
        errorCode: "poe_api_auth_error",
      };
    }

    // Stream break after tool_call — R16: signal partial completion explicitly
    if (err instanceof HttpAdapterStreamBreak && err.toolCallEmitted) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `Poe API stream disconnected after tool_call was emitted: ${errorMessageFrom(err)}. Partial completion — NOT retried.`,
        errorCode: "poe_api_stream_break_after_tool_call",
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

  // Compute cost — null/0 if model not in pricing table (warning emitted inside computeCost)
  let costUsd: number | null = null;
  if (usage) {
    const costResult = computeCost("poe", model, usage);
    costUsd = costResult.totalUsd > 0 ? costResult.totalUsd : null;
    if (costResult.warnings.length > 0) {
      await ctx.onLog("stderr", `[poe-api] cost warnings: ${costResult.warnings.join("; ")}\n`);
    }
  }

  // Build the updated session state for replay on the next turn
  const summary = textChunks.join("").trim();
  const assistantContent = summary.length > 0 ? summary : null;
  const newSessionState = assistantContent
    ? appendTurn(sessionState, { role: "assistant", content: assistantContent })
    : sessionState;

  // Session params carry the transcript for R17 stateless replay
  const sessionParams = newSessionState.turns.length > 0 ? { turns: newSessionState.turns } : null;

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    provider: "poe",
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

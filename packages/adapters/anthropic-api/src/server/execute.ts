/**
 * Anthropic API execute — sends full transcript to https://api.anthropic.com/v1/messages
 * using Anthropic's NATIVE Messages API format (NOT OpenAI-compat).
 *
 * Key Anthropic differences from poe-api:
 * - system is an array of content blocks, not a string
 * - tool definitions use {name, description, input_schema} (not OpenAI function shape)
 * - SSE uses named event types: message_start / content_block_start / content_block_delta /
 *   content_block_stop / message_delta / message_stop (parseSseStream handles this via format:"anthropic")
 * - Prompt caching: cache_control:{type:"ephemeral"} applied to system blocks at configured breakpoints
 * - Extended thinking: thinking:{type:"enabled", budget_tokens:N} enables reasoning blocks
 * - Usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens
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
import { validateAnthropicConfig } from "../shared/config.js";
import { adapterRateLimiter } from "./rate-limit-config.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ADAPTER_TYPE = "anthropic_api";

// Default system prompt. The IronWorks runtime may supply its own via context.systemPrompt
// if the interface is extended in a future version; we provide a minimal baseline here.
const DEFAULT_SYSTEM_PROMPT = "You are a helpful AI agent operating inside the IronWorks multi-agent framework.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveApiKey(config: Record<string, unknown>): string | null {
  const raw = config.apiKey;
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const trimmed = raw.trim();
  // Resolve env-var references like "${ANTHROPIC_API_KEY}"
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
    if (err.code === "auth_failed") return "anthropic_api_auth_error";
    if (err.code === "rate_limited") return "anthropic_api_rate_limit_error";
    if (err.code === "server_error") return "anthropic_api_server_error";
    if (err.code === "timeout") return "anthropic_api_timeout";
    if (err.code === "stream_break") return "anthropic_api_stream_break";
    if (err.code === "circuit_open") return "anthropic_api_circuit_open";
    return `anthropic_api_${err.code}`;
  }
  return "anthropic_api_error";
}

function errorMessageFrom(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Build the Anthropic-native system array from a plain text prompt.
 *
 * When cacheControl.breakpoints >= 1, the last text block in the system array
 * receives cache_control:{type:"ephemeral"} so Anthropic caches the whole system
 * prompt on the first call and reads it cheaply on subsequent calls (D.4).
 */
function buildSystemBlocks(systemText: string, breakpoints: number): Array<Record<string, unknown>> {
  // For the current simple case (single system-prompt block), we always emit one
  // text block. When breakpoints >= 1, we mark that block with cache_control.
  // A future enhancement could split the prompt at logical boundaries for finer
  // granularity, but the single-block approach already captures the dominant use case
  // (caching the full system prompt on the first call).
  const block: Record<string, unknown> = { type: "text", text: systemText };
  if (breakpoints >= 1) {
    block.cache_control = { type: "ephemeral" };
  }
  return [block];
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
  const validation = validateAnthropicConfig(ctx.config);
  if (!validation.ok) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: validation.error,
      errorCode: "anthropic_api_config_error",
    };
  }

  const { config } = validation;
  const model = config.model;

  const apiKey = resolveApiKey(ctx.config) ?? process.env.ADAPTER_ANTHROPIC_API_KEY ?? null;
  if (!apiKey) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage:
        "Anthropic API key is not configured. Set apiKey in adapter config or ADAPTER_ANTHROPIC_API_KEY environment variable.",
      errorCode: "anthropic_api_config_error",
    };
  }

  // Acquire a rate-limit token before any network I/O.
  await rateLimiter.acquire(ADAPTER_TYPE);

  // Emit meta before network I/O so IronWorks can record invocation start
  if (ctx.onMeta) {
    await ctx.onMeta({
      adapterType: ADAPTER_TYPE,
      command: "POST",
      commandArgs: [ANTHROPIC_API_URL],
      context: ctx.context,
    });
  }

  // Build message list from prior session state + new user turn (R17 stateless replay)
  const priorSession = deserializeSession(ctx.runtime.sessionParams);
  type MessageTurn = import("@ironworksai/adapter-utils/http/session-replay").MessageTurn;
  let sessionState = priorSession ?? { turns: [] as MessageTurn[] };

  // The current task is the user message content
  const userMessage =
    asString(ctx.context.wakeReason) ?? asString(ctx.context.taskId) ?? asString(ctx.context.issueId) ?? "Start.";

  sessionState = appendTurn(sessionState, { role: "user", content: userMessage });

  // Build Anthropic-native messages array.
  // buildTranscript with format:"anthropic" returns {system?, messages:[]} — not a plain array.
  // We extract .messages and provide our own system content blocks with cache_control.
  const transcriptResult = buildTranscript(sessionState, { format: "anthropic" }) as {
    system?: string;
    messages: unknown[];
  };
  const messages = transcriptResult.messages;

  // Build system prompt blocks with optional cache_control (D.4)
  const cacheBreakpoints = config.cacheControl?.breakpoints ?? 0;
  const systemBlocks = buildSystemBlocks(DEFAULT_SYSTEM_PROMPT, cacheBreakpoints);

  // Build Anthropic-native request body
  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: config.maxTokens ?? 4096,
    system: systemBlocks,
    messages,
    stream: true,
    ...(typeof config.temperature === "number" ? { temperature: config.temperature } : {}),
    // Extended thinking (D.5): enable reasoning blocks before the final response
    ...(config.extendedThinking !== undefined
      ? { thinking: { type: "enabled", budget_tokens: config.extendedThinking.budgetTokens } }
      : {}),
  };

  // Shared mutable flag — set true when a tool_call event is emitted.
  // runWithRetry checks this BEFORE any retry decision (R16 invariant).
  const toolCallFlag = { emitted: false };

  let usage: UsageSummary | undefined;
  const textChunks: string[] = [];
  const toolCallLog: string[] = [];

  try {
    await runWithRetry(
      async (retryCtx) => {
        const response = await transport.sendJsonStream({
          url: ANTHROPIC_API_URL,
          apiKey,
          body: requestBody,
        });

        // Parse Anthropic-native SSE stream (format:"anthropic")
        for await (const event of parseSseStream(response.body, { format: "anthropic" })) {
          if (event.type === "text_delta") {
            textChunks.push(event.text);
            await ctx.onLog("stdout", event.text);
          } else if (event.type === "tool_use_start") {
            // R16: mark flag immediately — any disconnect after this must not retry
            retryCtx.toolCallFlag.emitted = true;
            toolCallLog.push(event.toolName);
            await ctx.onLog("stdout", `[anthropic-api] tool_call: ${event.toolName} (id=${event.toolCallId})\n`);
          } else if (event.type === "tool_use_complete") {
            await ctx.onLog(
              "stdout",
              `[anthropic-api] tool_call_complete: ${event.toolCallId} args=${event.argsJson}\n`,
            );
          } else if (event.type === "stream_error") {
            await ctx.onLog("stderr", `[anthropic-api] stream_error code=${event.code}: ${event.message}\n`);
          } else if (event.type === "parse_warning") {
            await ctx.onLog("stderr", `[anthropic-api] parse_warning code=${event.code}: ${event.message}\n`);
          } else if (event.type === "done") {
            usage = event.usage;
          }
        }
      },
      {
        policy: {
          ...DEFAULT_RETRY_POLICY,
          baseDelayMs: 300, // Slightly longer for Anthropic — their 5xx are usually transient overloads
        },
        toolCallFlag,
        onRetry: (event) => {
          void ctx.onLog(
            "stderr",
            `[anthropic-api] retry attempt=${event.attempt + 1} after error: ${errorMessageFrom(event.error)}\n`,
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
        errorCode: "anthropic_api_auth_error",
      };
    }

    // Stream break after tool_call — R16: signal partial completion explicitly
    if (err instanceof HttpAdapterStreamBreak && err.toolCallEmitted) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `Anthropic API stream disconnected after tool_call was emitted: ${errorMessageFrom(err)}. Partial completion — NOT retried.`,
        errorCode: "anthropic_api_stream_break_after_tool_call",
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

  // Compute cost — Anthropic pricing handles cache_read / cache_creation token classes (D.4)
  let costUsd: number | null = null;
  if (usage) {
    const costResult = computeCost("anthropic", model, usage);
    costUsd = costResult.totalUsd > 0 ? costResult.totalUsd : null;
    if (costResult.warnings.length > 0) {
      await ctx.onLog("stderr", `[anthropic-api] cost warnings: ${costResult.warnings.join("; ")}\n`);
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
    provider: "anthropic",
    model,
    ...(usage
      ? {
          usage: {
            inputTokens: usage.promptTokens,
            outputTokens: usage.completionTokens,
            // D.4: Track all Anthropic cache token classes separately for cost reconciliation
            ...(usage.cachedPromptTokens !== undefined ? { cachedInputTokens: usage.cachedPromptTokens } : {}),
            ...(usage.cachedWriteTokens !== undefined ? { cachedWriteTokens: usage.cachedWriteTokens } : {}),
            // D.5: Reasoning tokens billed at reasoning rate (not output rate)
            ...(usage.reasoningTokens !== undefined ? { reasoningTokens: usage.reasoningTokens } : {}),
          },
        }
      : {}),
    ...(costUsd !== null ? { costUsd } : {}),
    ...(summary.length > 0 ? { summary } : {}),
    ...(sessionParams ? { sessionParams } : {}),
  };
}

/**
 * Adapter Playground route.
 *
 * POST /companies/:companyId/providers/:provider/playground
 *
 * Fires a single prompt against the specified HTTP adapter without creating
 * an agent. Returns a Server-Sent Events stream so the caller sees tokens
 * as they arrive, identical to how a running agent heartbeat receives output.
 *
 * Auth: operator or owner only (same gate as provider secret mutation routes).
 *
 * SSE event types:
 *   event: delta   data: { text: string }
 *   event: done    data: { usage: UsageSummary; cost: CostSummary | null; exitCode: number }
 *   event: error   data: { message: string; code?: string }
 *
 * The client may abort the request at any time; the server cleans up via the
 * "close" event on the Express request.
 */

import type { AdapterExecutionContext, AdapterExecutionResult } from "@ironworksai/adapter-utils";
import type { Db } from "@ironworksai/db";
import { Router } from "express";
import { findServerAdapter } from "../adapters/index.js";
import { badRequest, notFound } from "../errors.js";
import { logActivity } from "../services/index.js";
import type { ProviderType } from "../services/provider-secret-resolver.js";
import { resolveProviderSecret } from "../services/provider-secret-resolver.js";
import { assertBoard, assertCanWrite, assertCompanyAccess, getActorInfo } from "./authz.js";

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_PROVIDERS = new Set<string>(["poe_api", "anthropic_api", "openai_api", "openrouter_api"]);

function assertValidProvider(provider: string): asserts provider is ProviderType {
  if (!VALID_PROVIDERS.has(provider)) {
    throw badRequest(`Invalid provider "${provider}". Must be one of: ${[...VALID_PROVIDERS].join(", ")}`);
  }
}

interface PlaygroundRequestBody {
  /** The prompt text to send. */
  prompt: string;
  /** Model ID within the adapter's supported model list. */
  model: string;
  /** Sampling temperature 0–1. Optional; adapter default applies if omitted. */
  temperature?: number;
  /** Maximum output tokens. Optional; adapter default applies if omitted. */
  maxTokens?: number;
}

function parseBody(raw: unknown): PlaygroundRequestBody {
  if (!raw || typeof raw !== "object") throw badRequest("Request body must be a JSON object");
  const body = raw as Record<string, unknown>;

  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    throw badRequest('"prompt" must be a non-empty string');
  }
  if (typeof body.model !== "string" || body.model.trim().length === 0) {
    throw badRequest('"model" must be a non-empty string');
  }
  if (body.temperature !== undefined && typeof body.temperature !== "number") {
    throw badRequest('"temperature" must be a number when provided');
  }
  if (body.maxTokens !== undefined && typeof body.maxTokens !== "number") {
    throw badRequest('"maxTokens" must be a number when provided');
  }

  return {
    prompt: (body.prompt as string).trim(),
    model: (body.model as string).trim(),
    temperature: body.temperature as number | undefined,
    maxTokens: body.maxTokens as number | undefined,
  };
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

function writeSse(res: import("express").Response, eventType: string, payload: unknown): void {
  // Each SSE message: "event: <type>\ndata: <json>\n\n"
  res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function playgroundRoutes(db: Db) {
  const router = Router();

  /**
   * POST /companies/:companyId/providers/:provider/playground
   *
   * Streams a single prompt through the specified adapter as SSE.
   * Requires operator or owner role — playground calls incur real API cost.
   */
  router.post("/companies/:companyId/providers/:provider/playground", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    // Reuse the same write-gate as secret mutation: operators and owners only.
    // Viewers may not trigger real API calls (cost + data exposure risk).
    await assertCanWrite(req, companyId, db);
    assertValidProvider(req.params.provider as string);
    const provider = req.params.provider as ProviderType;

    const body = parseBody(req.body);

    // Resolve API key via the same precedence chain used by agent heartbeats.
    const resolved = await resolveProviderSecret(db, companyId, provider);
    if (!resolved.apiKey) {
      throw notFound(`No API key configured for provider "${provider}"`);
    }

    // Look up the adapter module for this provider type.
    const adapter = findServerAdapter(provider);
    if (!adapter) {
      throw notFound(`Adapter module for "${provider}" is not registered`);
    }

    const actor = getActorInfo(req);
    const startedAt = new Date();

    // Begin SSE stream — headers sent immediately so the client can display the
    // spinner before the first token arrives. After this point the HTTP status
    // is committed to 200; errors are surfaced as SSE error events.
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();

    // Track whether the client disconnected before the call finished.
    let clientGone = false;
    req.on("close", () => {
      clientGone = true;
    });

    let result: AdapterExecutionResult;

    // Build the minimal AdapterExecutionContext needed for a playground call.
    // We don't have a real agent or session here — the playground is stateless.
    // A synthetic agent stub satisfies the interface without touching agent DB rows.
    const execCtx: AdapterExecutionContext = {
      runId: `playground-${Date.now()}`,
      agent: {
        id: `playground-${companyId}`,
        companyId,
        name: "Playground",
        adapterType: provider,
        // Config carries the resolved API key so the adapter uses the workspace key
        // rather than falling back to its own env-var resolution.
        adapterConfig: {
          apiKey: resolved.apiKey,
          model: body.model,
          ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
          ...(body.maxTokens !== undefined ? { maxTokens: body.maxTokens } : {}),
        },
      },
      // Config repeated here for adapters that read from ctx.config directly.
      config: {
        apiKey: resolved.apiKey,
        model: body.model,
        ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
        ...(body.maxTokens !== undefined ? { maxTokens: body.maxTokens } : {}),
      },
      context: {
        // Minimal wake context: the prompt is the task description.
        taskId: null,
        issueId: null,
        wakeReason: body.prompt,
        agentName: "playground",
        companyId,
      },
      runtime: {
        // Stateless: no prior session to replay.
        sessionId: null,
        sessionParams: {},
        sessionDisplayId: null,
        taskKey: null,
      },
      // Stream text deltas back to the SSE connection.
      onLog: async (channel: string, text: string): Promise<void> => {
        if (clientGone) return;
        if (channel === "stdout") {
          writeSse(res, "delta", { text });
        }
        // stderr goes to a debug event that the UI can optionally display.
        if (channel === "stderr") {
          writeSse(res, "debug", { text });
        }
      },
      onMeta: async (): Promise<void> => {
        // Playground does not need to surface meta events to the client.
      },
    };

    try {
      result = await adapter.execute(execCtx);
    } catch (err) {
      // execute() itself threw (unexpected — adapters normally return error results).
      // Surface as an SSE error event so the UI can display it.
      const message = err instanceof Error ? err.message : String(err);
      if (!clientGone) {
        writeSse(res, "error", { message });
      }
      res.end();
      return;
    }

    if (!clientGone) {
      if (result.exitCode !== 0) {
        // Adapter returned a structured error (e.g. config_error, auth_error).
        writeSse(res, "error", {
          message: result.errorMessage ?? "Adapter returned a non-zero exit code",
          code: result.errorCode,
        });
      } else {
        // Successful run: emit usage and cost so the UI can display the readout.
        writeSse(res, "done", {
          exitCode: result.exitCode,
          usage: result.usage ?? null,
          // costUsd is the per-run cost field on AdapterExecutionResult
          costUsd: result.costUsd ?? null,
        });
      }
    }

    // Audit log: record the playground call for observability without leaking the key.
    void logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: null,
      action: "provider.playground_call",
      entityType: "provider",
      entityId: `${companyId}/${provider}`,
      details: {
        provider,
        model: body.model,
        source: resolved.source,
        exitCode: result?.exitCode ?? null,
        startedAt: startedAt.toISOString(),
        // Never log the prompt text — it may contain sensitive data.
        // Never log the API key — resolver contract ensures it stays opaque.
      },
    });

    res.end();
  });

  return router;
}

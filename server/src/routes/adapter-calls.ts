/**
 * Request/Response Explorer routes — G.25 adapter-call audit log.
 *
 * Routes:
 *   GET  /companies/:companyId/adapter-calls            paginated list
 *   GET  /companies/:companyId/adapter-calls/:id        single call detail
 *   POST /companies/:companyId/adapter-calls/:id/replay SSE stream replay
 *
 * Auth:
 *   List + detail: assertCanWrite (operators / owners only — audit log contains sensitive data)
 *   Replay:        assertCanWrite (operators / owners only — replays cost money)
 *
 * Cursor pagination uses base64url-encoded JSON { occurredAt, id } so the sort
 * is stable even when multiple calls land in the same millisecond.
 */

import { randomUUID } from "node:crypto";
import type { Db } from "@ironworksai/db";
import { adapterCalls } from "@ironworksai/db";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import type { AdapterInvocationMeta } from "../adapters/index.js";
import { findServerAdapter } from "../adapters/index.js";
import { forbidden, notFound } from "../errors.js";
import { writeAdapterCall } from "../services/adapter-call-writer.js";
import { resolveProviderSecret } from "../services/provider-secret-resolver.js";
import { assertCanWrite } from "./authz.js";

// ── cursor helpers ────────────────────────────────────────────────────────────

function encodeCursor(occurredAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ occurredAt: occurredAt.toISOString(), id })).toString("base64url");
}

function decodeCursor(raw: string): { occurredAt: Date; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "occurredAt" in parsed &&
      "id" in parsed &&
      typeof (parsed as Record<string, unknown>).occurredAt === "string" &&
      typeof (parsed as Record<string, unknown>).id === "string"
    ) {
      return {
        occurredAt: new Date((parsed as { occurredAt: string }).occurredAt),
        id: (parsed as { id: string }).id,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ── query schema ──────────────────────────────────────────────────────────────

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

const ListQuerySchema = z.object({
  agent_id: z.string().uuid().optional(),
  adapter_type: z.string().optional(),
  status: z.enum(["success", "error"]).optional(),
  source: z.enum(["agent", "playground", "replay"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_LIMIT)
    // Clamp silently instead of rejecting — explorer UIs often send page sizes
    // that exceed a server's maximum and expect the server to cap them.
    .transform((v) => Math.min(v, MAX_LIMIT)),
});

// ── secret key blocklist for list-level snapshot sanitization ─────────────────

const SNAPSHOT_SECRET_KEYS = new Set([
  "apikey",
  "api_key",
  "apiKey",
  "token",
  "secret",
  "password",
  "pass",
  "credential",
  "credentials",
  "key",
]);

function sanitizeSnapshot(snapshot: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!snapshot) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(snapshot)) {
    if (!SNAPSHOT_SECRET_KEYS.has(k)) out[k] = v;
  }
  return out;
}

/** Extract a plain-text preview from various prompt payload shapes. */
export function extractPromptText(payload: unknown): string | null {
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  // OpenAI/Anthropic-style messages array: grab the last user message content
  if (Array.isArray(p.messages)) {
    const msgs = p.messages as Array<{ role?: string; content?: unknown }>;
    const userMsg = [...msgs].reverse().find((m) => m.role === "user");
    if (typeof userMsg?.content === "string") return userMsg.content;
  }
  // Simple content / prompt keys
  if (typeof p.content === "string") return p.content;
  if (typeof p.prompt === "string") return p.prompt;
  return null;
}

// ── route factory ─────────────────────────────────────────────────────────────

export function adapterCallRoutes(db: Db) {
  const router = Router();

  // ── GET /companies/:companyId/adapter-calls ─────────────────────────────

  router.get("/companies/:companyId/adapter-calls", async (req, res) => {
    // Audit log contains sensitive prompts and responses — operators and owners only.
    // Viewers (read-only members) are denied access.
    const companyId = req.params.companyId as string;
    await assertCanWrite(req, companyId, db);

    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query parameters", issues: parsed.error.issues });
      return;
    }
    const { agent_id, adapter_type, status, source, cursor, limit } = parsed.data;

    // Build WHERE conditions starting from the company anchor
    const conditions = [eq(adapterCalls.companyId, companyId)];
    if (agent_id) conditions.push(eq(adapterCalls.agentId, agent_id));
    if (adapter_type) conditions.push(eq(adapterCalls.adapterType, adapter_type));
    if (status) conditions.push(eq(adapterCalls.status, status));
    if (source) conditions.push(eq(adapterCalls.source, source));

    // Cursor: "before (occurredAt, id)" in DESC ordering
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        // For DESC order, next-page rows have an earlier occurredAt,
        // OR the same occurredAt with a lexicographically smaller id.
        conditions.push(
          or(
            lt(adapterCalls.occurredAt, decoded.occurredAt),
            and(eq(adapterCalls.occurredAt, decoded.occurredAt), lt(adapterCalls.id, decoded.id)),
          ) as ReturnType<typeof eq>,
        );
      }
    }

    // Fetch limit+1 to detect whether there's a next page without a COUNT query
    const rows = await db
      .select({
        id: adapterCalls.id,
        companyId: adapterCalls.companyId,
        agentId: adapterCalls.agentId,
        adapterType: adapterCalls.adapterType,
        model: adapterCalls.model,
        status: adapterCalls.status,
        latencyMs: adapterCalls.latencyMs,
        inputTokens: adapterCalls.inputTokens,
        outputTokens: adapterCalls.outputTokens,
        costUsdCents: adapterCalls.costUsdCents,
        source: adapterCalls.source,
        replayOf: adapterCalls.replayOf,
        errorCode: adapterCalls.errorCode,
        promptPreview: adapterCalls.promptPreview,
        responsePreview: adapterCalls.responsePreview,
        adapterConfigSnapshot: adapterCalls.adapterConfigSnapshot,
        requestId: adapterCalls.requestId,
        occurredAt: adapterCalls.occurredAt,
        createdAt: adapterCalls.createdAt,
      })
      .from(adapterCalls)
      .where(and(...conditions))
      .orderBy(desc(adapterCalls.occurredAt), desc(adapterCalls.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && lastRow ? encodeCursor(lastRow.occurredAt, lastRow.id) : null;

    // Strip full payload columns and sanitize config snapshot for list view.
    // Full payloads are only returned on the single-call detail endpoint to
    // keep list response sizes predictable regardless of payload volume.
    const items = pageRows.map((row) => ({
      ...row,
      adapterConfigSnapshot: sanitizeSnapshot(row.adapterConfigSnapshot),
      // Explicitly exclude payload columns from list response
      promptPayload: undefined,
      responsePayload: undefined,
    }));

    res.json({ items, nextCursor });
  });

  // ── GET /companies/:companyId/adapter-calls/:id ─────────────────────────

  router.get("/companies/:companyId/adapter-calls/:id", async (req, res) => {
    // Audit log contains sensitive prompts and responses — operators and owners only.
    // Viewers (read-only members) are denied access.
    const companyId = req.params.companyId as string;
    await assertCanWrite(req, companyId, db);

    const callId = req.params.id as string;

    const rows = await db.select().from(adapterCalls).where(eq(adapterCalls.id, callId)).limit(1);
    const call = rows[0] ?? null;

    if (!call) throw notFound("Adapter call not found");
    // Cross-company guard: the call must belong to the requested company
    if (call.companyId !== companyId) throw forbidden("Adapter call belongs to another company");

    res.json({
      ...call,
      adapterConfigSnapshot: sanitizeSnapshot(call.adapterConfigSnapshot),
    });
  });

  // ── POST /companies/:companyId/adapter-calls/:id/replay ────────────────

  router.post("/companies/:companyId/adapter-calls/:id/replay", async (req, res) => {
    // Replay costs money — operators and owners only.
    const companyId = req.params.companyId as string;
    await assertCanWrite(req, companyId, db);

    const callId = req.params.id as string;

    const rows = await db.select().from(adapterCalls).where(eq(adapterCalls.id, callId)).limit(1);
    const original = rows[0] ?? null;

    if (!original) throw notFound("Adapter call not found");
    if (original.companyId !== companyId) throw forbidden("Adapter call belongs to another company");

    // Resolve the live API key — do not use anything from the snapshot
    // (snapshot has secrets stripped; the resolver reads from the vault)
    const providerSlug = original.adapterType as "anthropic_api" | "openai_api" | "openrouter_api" | "poe_api";
    const resolved = await resolveProviderSecret(db, companyId, providerSlug);
    if (resolved.source === "none" || !resolved.apiKey) {
      res.status(422).json({
        error: `No API key configured for provider "${original.adapterType}"`,
      });
      return;
    }

    const adapter = findServerAdapter(original.adapterType);
    if (!adapter) {
      throw notFound(`Adapter "${original.adapterType}" is not registered on this server`);
    }

    // Set up SSE stream — matches O.1 playground SSE pattern
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const replayId = randomUUID();
    const startedAt = Date.now();
    let outputText = "";
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let replayStatus: "success" | "error" = "success";
    let errorCode: string | null = null;

    try {
      // Minimal stubs for the adapter execute call — replay uses the original
      // adapter config (sans secrets, which are re-resolved above).
      const agentStub = {
        id: original.agentId ?? "replay",
        companyId,
        name: "replay",
        adapterType: original.adapterType,
        adapterConfig: original.adapterConfigSnapshot ?? {},
      };
      const runtimeStub = {
        sessionId: null,
        sessionParams: null,
        sessionDisplayId: null,
        taskKey: null,
      };

      const result = await adapter.execute({
        runId: replayId,
        agent: agentStub,
        runtime: runtimeStub,
        config: {
          ...(original.adapterConfigSnapshot ?? {}),
          apiKey: resolved.apiKey,
          model: original.model,
        },
        context: original.promptPayload ? { prompt: original.promptPayload } : {},
        onLog: async (_stream: "stdout" | "stderr", chunk: string) => {
          outputText += chunk;
          res.write(`event: delta\ndata: ${JSON.stringify({ chunk })}\n\n`);
        },
        onMeta: async (meta: AdapterInvocationMeta) => {
          // Extract token counts from promptMetrics when provided by the adapter
          if (meta.promptMetrics) {
            if (typeof meta.promptMetrics.inputTokens === "number") {
              inputTokens = meta.promptMetrics.inputTokens;
            }
            if (typeof meta.promptMetrics.outputTokens === "number") {
              outputTokens = meta.promptMetrics.outputTokens;
            }
          }
          res.write(`event: meta\ndata: ${JSON.stringify(meta)}\n\n`);
        },
      });

      if (result.summary) {
        outputText = result.summary;
        res.write(`event: delta\ndata: ${JSON.stringify({ chunk: result.summary })}\n\n`);
      }
    } catch (err) {
      replayStatus = "error";
      errorCode = err instanceof Error ? err.constructor.name : "UnknownError";
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : String(err) })}\n\n`,
      );
    }

    const latencyMs = Date.now() - startedAt;

    // Write the replay audit record — does NOT mutate the original call row
    await writeAdapterCall(db, {
      companyId,
      agentId: original.agentId,
      adapterType: original.adapterType,
      model: original.model,
      status: replayStatus,
      latencyMs,
      inputTokens,
      outputTokens,
      costUsdCents: null,
      source: "replay",
      replayOf: original.id,
      errorCode,
      promptText: extractPromptText(original.promptPayload),
      promptPayload: original.promptPayload,
      responseText: outputText.slice(0, 120),
      responsePayload: outputText ? { text: outputText } : null,
      requestId: replayId,
      occurredAt: new Date(startedAt),
    });

    res.write(`event: done\ndata: ${JSON.stringify({ replayId, latencyMs, status: replayStatus })}\n\n`);
    res.end();
  });

  return router;
}

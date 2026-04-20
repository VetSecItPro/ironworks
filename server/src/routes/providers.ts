/**
 * REST API for per-workspace HTTP provider secrets.
 *
 * Routes:
 *   GET    /companies/:companyId/providers/:provider/status
 *   PUT    /companies/:companyId/providers/:provider/secret
 *   POST   /companies/:companyId/providers/:provider/test
 *   DELETE /companies/:companyId/providers/:provider/secret
 *
 * "provider" must be one of the four HTTP adapter slugs.
 * Key values are NEVER returned in responses — only keyLastFour is exposed.
 */

import type { Db } from "@ironworksai/db";
import { workspaceProviderSecrets } from "@ironworksai/db";
import { and, eq, isNull } from "drizzle-orm";
import { Router } from "express";
import { listServerAdapters } from "../adapters/index.js";
import { badRequest, notFound } from "../errors.js";
import { logActivity } from "../services/index.js";
import type { ProviderType } from "../services/provider-secret-resolver.js";
import { resolveProviderSecret } from "../services/provider-secret-resolver.js";
import { decryptSecret, encryptSecret, getKeyLastFour } from "../services/secrets-vault.js";
import { assertBoard, assertCanWrite, assertCompanyAccess, getActorInfo } from "./authz.js";

const VALID_PROVIDERS = new Set<string>(["poe_api", "anthropic_api", "openai_api", "openrouter_api"]);

function assertValidProvider(provider: string): asserts provider is ProviderType {
  if (!VALID_PROVIDERS.has(provider)) {
    throw badRequest(`Invalid provider "${provider}". Must be one of: ${[...VALID_PROVIDERS].join(", ")}`);
  }
}

/**
 * Look up the active (non-disabled) row for a provider, or return null.
 * Used for write paths that need the current row before upserting.
 */
async function getActiveRow(db: Db, companyId: string, provider: string) {
  const rows = await db
    .select()
    .from(workspaceProviderSecrets)
    .where(
      and(
        eq(workspaceProviderSecrets.companyId, companyId),
        eq(workspaceProviderSecrets.provider, provider),
        isNull(workspaceProviderSecrets.disabledAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export function providerRoutes(db: Db) {
  const router = Router();

  // ── GET /companies/:companyId/providers/:provider/status ──────────────────
  // Read access: any workspace member. Returns configured state and test result.
  // Key value is never returned — only keyLastFour.
  router.get("/companies/:companyId/providers/:provider/status", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertValidProvider(req.params.provider as string);
    const provider = req.params.provider as ProviderType;

    // Use the resolver so the status reflects the effective source (workspace or env)
    const resolved = await resolveProviderSecret(db, companyId, provider);

    res.json({
      configured: resolved.source !== "none",
      source: resolved.source,
      keyLastFour: resolved.keyLastFour ?? undefined,
      lastTestedAt: resolved.lastTestedAt?.toISOString() ?? undefined,
      lastTestStatus: resolved.lastTestStatus ?? undefined,
    });
  });

  // ── PUT /companies/:companyId/providers/:provider/secret ──────────────────
  // Owner/admin only. Encrypts and upserts the API key row.
  router.put("/companies/:companyId/providers/:provider/secret", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCanWrite(req, companyId, db);
    assertValidProvider(req.params.provider as string);
    const provider = req.params.provider as ProviderType;

    const { apiKey } = req.body as { apiKey?: unknown };
    if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
      throw badRequest("apiKey must be a non-empty string");
    }

    const actor = getActorInfo(req);
    const trimmedKey = apiKey.trim();
    const bundle = encryptSecret(trimmedKey);
    const keyLastFour = getKeyLastFour(trimmedKey);
    const now = new Date();

    // Upsert: update the existing row or insert a fresh one.
    const existing = await db
      .select({ id: workspaceProviderSecrets.id })
      .from(workspaceProviderSecrets)
      .where(and(eq(workspaceProviderSecrets.companyId, companyId), eq(workspaceProviderSecrets.provider, provider)))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (existing) {
      await db
        .update(workspaceProviderSecrets)
        .set({
          encryptedKey: bundle.encryptedKey,
          encryptedDek: bundle.encryptedDek,
          dekIv: bundle.dekIv,
          dekAuthTag: bundle.dekAuthTag,
          keyIv: bundle.keyIv,
          keyAuthTag: bundle.keyAuthTag,
          keyLastFour,
          // Reset test status when the key changes
          lastTestedAt: null,
          lastTestStatus: null,
          lastTestError: null,
          disabledAt: null,
          updatedAt: now,
        })
        .where(eq(workspaceProviderSecrets.id, existing.id));
    } else {
      await db.insert(workspaceProviderSecrets).values({
        companyId,
        provider,
        encryptedKey: bundle.encryptedKey,
        encryptedDek: bundle.encryptedDek,
        dekIv: bundle.dekIv,
        dekAuthTag: bundle.dekAuthTag,
        keyIv: bundle.keyIv,
        keyAuthTag: bundle.keyAuthTag,
        keyLastFour,
        createdByUserId: actor.actorType === "user" ? actor.actorId : null,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Audit log: record the event without logging the key value
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "provider_secret.set",
      entityType: "provider_secret",
      entityId: `${companyId}/${provider}`,
      details: { provider, keyLastFour },
    });

    res.json({ ok: true, keyLastFour });
  });

  // ── POST /companies/:companyId/providers/:provider/test ───────────────────
  // Owner/admin only. Resolves the current key and runs the adapter's
  // testEnvironment(). Persists the result back to the DB row.
  router.post("/companies/:companyId/providers/:provider/test", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCanWrite(req, companyId, db);
    assertValidProvider(req.params.provider as string);
    const provider = req.params.provider as ProviderType;

    const actor = getActorInfo(req);
    const resolved = await resolveProviderSecret(db, companyId, provider);

    if (!resolved.apiKey) {
      throw notFound(`No API key configured for provider "${provider}"`);
    }

    // Map our provider slug to the adapter type string used in the registry
    const adapterTypeMap: Record<ProviderType, string> = {
      anthropic_api: "anthropic_api",
      openai_api: "openai_api",
      openrouter_api: "openrouter_api",
      poe_api: "poe_api",
    };
    const adapterType = adapterTypeMap[provider];
    const adapter = listServerAdapters().find((a) => a.type === adapterType);

    if (!adapter) {
      throw notFound(`Adapter module for "${provider}" is not registered`);
    }

    const testedAt = new Date();
    let passed = false;
    let errorMessage: string | undefined;

    try {
      const result = await adapter.testEnvironment({
        companyId,
        adapterType,
        // Inject the resolved key into the config so the adapter's test
        // uses the workspace key rather than its own env-var fallback
        config: { apiKey: resolved.apiKey },
      });
      passed = result.status === "pass";
      if (!passed) {
        // Collect non-sensitive error detail from checks — never include the key
        const failedChecks = result.checks.filter((c) => c.level === "error");
        errorMessage = failedChecks.map((c) => c.message).join("; ") || result.status;
      }
    } catch (err) {
      passed = false;
      errorMessage = err instanceof Error ? err.message : "unknown error";
    }

    // Persist result to the workspace DB row if one exists
    const existingRow = await getActiveRow(db, companyId, provider);
    if (existingRow) {
      await db
        .update(workspaceProviderSecrets)
        .set({
          lastTestedAt: testedAt,
          lastTestStatus: passed ? "pass" : "fail",
          lastTestError: errorMessage ?? null,
          updatedAt: testedAt,
        })
        .where(eq(workspaceProviderSecrets.id, existingRow.id));
    }

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "provider_secret.test",
      entityType: "provider_secret",
      entityId: `${companyId}/${provider}`,
      // Log outcome only — never the key value
      details: { provider, passed, source: resolved.source },
    });

    res.json({
      passed,
      error: errorMessage,
      testedAt: testedAt.toISOString(),
    });
  });

  // ── DELETE /companies/:companyId/providers/:provider/secret ───────────────
  // Owner/admin only. Soft-delete via disabled_at timestamp.
  router.delete("/companies/:companyId/providers/:provider/secret", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCanWrite(req, companyId, db);
    assertValidProvider(req.params.provider as string);
    const provider = req.params.provider as ProviderType;

    const actor = getActorInfo(req);
    const now = new Date();

    const updated = await db
      .update(workspaceProviderSecrets)
      .set({ disabledAt: now, updatedAt: now })
      .where(
        and(
          eq(workspaceProviderSecrets.companyId, companyId),
          eq(workspaceProviderSecrets.provider, provider),
          isNull(workspaceProviderSecrets.disabledAt),
        ),
      )
      .returning({ id: workspaceProviderSecrets.id })
      .then((rows) => rows[0] ?? null);

    if (!updated) {
      throw notFound(`No active provider secret found for "${provider}"`);
    }

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "provider_secret.removed",
      entityType: "provider_secret",
      entityId: `${companyId}/${provider}`,
      details: { provider },
    });

    res.json({ ok: true });
  });

  return router;
}

import type { Db } from "@ironworksai/db";
import { companies, companySubscriptions } from "@ironworksai/db";
import {
  createSecretSchema,
  rotateSecretSchema,
  SECRET_PROVIDERS,
  type SecretProvider,
  updateSecretSchema,
} from "@ironworksai/shared";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import type { LlmAuthMethod } from "../services/billing.js";
import { logActivity, secretService } from "../services/index.js";
import { assertBoard, assertCanWrite, assertCompanyAccess } from "./authz.js";

/** Secret names that signal how the company authenticates with their LLM provider. */
const LLM_API_KEY_SECRET_NAMES = new Set(["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]);
const LLM_OAUTH_SECRET_NAMES = new Set(["ANTHROPIC_OAUTH_TOKEN"]);

/** Default company monthly budget when the company authenticates via API key ($500). */
const DEFAULT_COMPANY_BUDGET_API_KEY_CENTS = 50_000;

/**
 * Derive the llmAuthMethod from a secret name, returning null if the
 * secret name is unrelated to LLM auth.
 */
function llmAuthMethodFromSecretName(name: string): LlmAuthMethod | null {
  if (LLM_API_KEY_SECRET_NAMES.has(name)) return "api_key";
  if (LLM_OAUTH_SECRET_NAMES.has(name)) return "oauth";
  return null;
}

/**
 * Update the company subscription's llmAuthMethod when a relevant secret is
 * stored. When the method transitions to "api_key" and the company has no
 * budget set yet, apply the default company budget of $500/mo.
 * No-ops silently if the subscription row doesn't exist yet.
 */
async function maybeUpdateLlmAuthMethod(db: Db, companyId: string, secretName: string): Promise<void> {
  const method = llmAuthMethodFromSecretName(secretName);
  if (!method) return;

  await db
    .update(companySubscriptions)
    .set({ llmAuthMethod: method, updatedAt: new Date() })
    .where(eq(companySubscriptions.companyId, companyId));

  // When transitioning to api_key, set a default company budget if not already set.
  if (method === "api_key") {
    const companyRow = await db
      .select({ budgetMonthlyCents: companies.budgetMonthlyCents })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0] ?? null);

    if (companyRow && companyRow.budgetMonthlyCents === 0) {
      await db
        .update(companies)
        .set({ budgetMonthlyCents: DEFAULT_COMPANY_BUDGET_API_KEY_CENTS, updatedAt: new Date() })
        .where(eq(companies.id, companyId));
    }
  }
}

export function secretRoutes(db: Db) {
  const router = Router();
  const svc = secretService(db);
  const configuredDefaultProvider = process.env.IRONWORKS_SECRETS_PROVIDER;
  const defaultProvider = (
    configuredDefaultProvider && SECRET_PROVIDERS.includes(configuredDefaultProvider as SecretProvider)
      ? configuredDefaultProvider
      : "local_encrypted"
  ) as SecretProvider;

  router.get("/companies/:companyId/secret-providers", (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(svc.listProviders());
  });

  router.get("/companies/:companyId/secrets", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const secrets = await svc.list(companyId);
    res.json(secrets);
  });

  router.post("/companies/:companyId/secrets", validate(createSecretSchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCanWrite(req, companyId, db);

    const created = await svc.create(
      companyId,
      {
        name: req.body.name,
        provider: req.body.provider ?? defaultProvider,
        value: req.body.value,
        description: req.body.description,
        externalRef: req.body.externalRef,
      },
      { userId: req.actor.userId ?? "board", agentId: null },
    );

    // Update llmAuthMethod on the subscription when a well-known LLM secret is stored.
    await maybeUpdateLlmAuthMethod(db, companyId, created.name);

    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "secret.created",
      entityType: "secret",
      entityId: created.id,
      details: { name: created.name, provider: created.provider },
    });

    res.status(201).json(created);
  });

  router.post("/secrets/:id/rotate", validate(rotateSecretSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Secret not found" });
      return;
    }
    await assertCanWrite(req, existing.companyId, db);

    const rotated = await svc.rotate(
      id,
      {
        value: req.body.value,
        externalRef: req.body.externalRef,
      },
      { userId: req.actor.userId ?? "board", agentId: null },
    );

    // Update llmAuthMethod when a well-known LLM secret is rotated.
    await maybeUpdateLlmAuthMethod(db, rotated.companyId, rotated.name);

    await logActivity(db, {
      companyId: rotated.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "secret.rotated",
      entityType: "secret",
      entityId: rotated.id,
      details: { version: rotated.latestVersion },
    });

    res.json(rotated);
  });

  router.patch("/secrets/:id", validate(updateSecretSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Secret not found" });
      return;
    }
    await assertCanWrite(req, existing.companyId, db);

    const updated = await svc.update(id, {
      name: req.body.name,
      description: req.body.description,
      externalRef: req.body.externalRef,
    });

    if (!updated) {
      res.status(404).json({ error: "Secret not found" });
      return;
    }

    await logActivity(db, {
      companyId: updated.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "secret.updated",
      entityType: "secret",
      entityId: updated.id,
      details: { name: updated.name },
    });

    res.json(updated);
  });

  router.delete("/secrets/:id", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Secret not found" });
      return;
    }
    await assertCanWrite(req, existing.companyId, db);

    const removed = await svc.remove(id);
    if (!removed) {
      res.status(404).json({ error: "Secret not found" });
      return;
    }

    await logActivity(db, {
      companyId: removed.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "secret.deleted",
      entityType: "secret",
      entityId: removed.id,
      details: { name: removed.name },
    });

    res.json({ ok: true });
  });

  return router;
}

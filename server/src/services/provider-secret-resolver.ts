/**
 * Resolves the active API key for an HTTP provider adapter with the following
 * precedence order:
 *
 *   1. Workspace DB row (workspace_provider_secrets) — decrypted at runtime
 *   2. Process environment variable (e.g. ADAPTER_ANTHROPIC_API_KEY)
 *   3. "none" — caller must handle missing-key error
 *
 * Rationale for this order: per-workspace keys give operators the ability to
 * bring their own credentials, while the env-var fallback lets single-tenant
 * deployments work without a DB row per provider. "none" makes the absent case
 * explicit so callers can surface a clear error instead of silently failing.
 *
 * Disabled rows (disabled_at IS NOT NULL) are skipped and fall through to env.
 */

import type { Db } from "@ironworksai/db";
import { workspaceProviderSecrets } from "@ironworksai/db";
import { and, eq, isNull } from "drizzle-orm";
import { decryptSecret } from "./secrets-vault.js";

export type ProviderType = "poe_api" | "anthropic_api" | "openai_api" | "openrouter_api";

/** Maps provider slug to its env-var fallback name. */
const PROVIDER_ENV_VARS: Record<ProviderType, string> = {
  anthropic_api: "ADAPTER_ANTHROPIC_API_KEY",
  openai_api: "ADAPTER_OPENAI_API_KEY",
  openrouter_api: "ADAPTER_OPENROUTER_API_KEY",
  poe_api: "ADAPTER_POE_API_KEY",
};

export type ResolvedProviderSecret = {
  source: "workspace" | "env" | "none";
  apiKey: string | null;
  lastTestStatus: "pass" | "fail" | "pending" | null;
  lastTestedAt: Date | null;
  keyLastFour: string | null;
};

/**
 * Fetch the workspace DB row for this provider. Returns null if no active
 * (non-disabled) row exists.
 */
async function fetchWorkspaceRow(
  db: Db,
  companyId: string,
  provider: ProviderType,
) {
  const rows = await db
    .select()
    .from(workspaceProviderSecrets)
    .where(
      and(
        eq(workspaceProviderSecrets.companyId, companyId),
        eq(workspaceProviderSecrets.provider, provider),
        // Skip rows that have been soft-deleted
        isNull(workspaceProviderSecrets.disabledAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function resolveProviderSecret(
  db: Db,
  companyId: string,
  provider: ProviderType,
): Promise<ResolvedProviderSecret> {
  // Precedence 1: workspace DB row
  const row = await fetchWorkspaceRow(db, companyId, provider);
  if (row) {
    const apiKey = decryptSecret({
      encryptedKey: row.encryptedKey,
      encryptedDek: row.encryptedDek,
      dekIv: row.dekIv,
      dekAuthTag: row.dekAuthTag,
      keyIv: row.keyIv,
      keyAuthTag: row.keyAuthTag,
    });

    return {
      source: "workspace",
      apiKey,
      lastTestStatus: (row.lastTestStatus as "pass" | "fail" | "pending" | null) ?? null,
      lastTestedAt: row.lastTestedAt ?? null,
      keyLastFour: row.keyLastFour,
    };
  }

  // Precedence 2: process environment variable fallback
  const envKey = process.env[PROVIDER_ENV_VARS[provider]];
  if (envKey && envKey.trim().length > 0) {
    return {
      source: "env",
      apiKey: envKey.trim(),
      lastTestStatus: null,
      lastTestedAt: null,
      keyLastFour: null,
    };
  }

  // Precedence 3: nothing found
  return {
    source: "none",
    apiKey: null,
    lastTestStatus: null,
    lastTestedAt: null,
    keyLastFour: null,
  };
}

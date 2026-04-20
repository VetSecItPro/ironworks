/**
 * Resolve the Anthropic authentication credentials for a given company.
 *
 * When `llmAuthMethod` is provided (from company_subscriptions), it is used as
 * a fast-path hint to skip unnecessary DB lookups:
 *   - "api_key"  → try ANTHROPIC_API_KEY / OPENAI_API_KEY secrets first
 *   - "oauth"    → try ANTHROPIC_OAUTH_TOKEN first
 *   - "none"     → fall through to server env fallback only
 *
 * When `llmAuthMethod` is not provided, the full priority order is tried:
 *   1. Company BYOK API key (secret named "ANTHROPIC_API_KEY" in company_secrets)
 *   2. Company Anthropic OAuth token (secret named "ANTHROPIC_OAUTH_TOKEN")
 *   3. Server-level process.env.ANTHROPIC_API_KEY (local dev / operator fallback)
 *
 * Returns an object describing how to set HTTP headers for the Anthropic API:
 *   - apiKey:    use `x-api-key` header
 *   - oauthToken: use `Authorization: Bearer` header
 *   - null:      no credential available; caller should skip AI and use fallback
 */

import type { Db } from "@ironworksai/db";
import { logger } from "../middleware/logger.js";
import type { LlmAuthMethod } from "../services/billing.js";
import { secretService } from "../services/secrets.js";

export type AnthropicAuth = { type: "api_key"; value: string } | { type: "oauth_token"; value: string };

/** Well-known secret names companies use to store their Anthropic credentials. */
const SECRET_NAME_API_KEY = "ANTHROPIC_API_KEY";
const SECRET_NAME_OAUTH_TOKEN = "ANTHROPIC_OAUTH_TOKEN";

/**
 * Resolve Anthropic credentials for `companyId`.
 *
 * Pass `llmAuthMethod` (read from company_subscriptions) to enable fast-path
 * resolution — skips lookups that are unlikely to match.
 *
 * Never throws — resolution errors are logged as warnings and the
 * function falls through to the next source.
 */
export async function resolveAnthropicAuth(
  companyId: string,
  db: Db,
  llmAuthMethod?: LlmAuthMethod,
): Promise<AnthropicAuth | null> {
  const svc = secretService(db);

  // Fast-path: if the stored method is "oauth", resolve the OAuth token first
  // and skip the API key lookup entirely.
  if (llmAuthMethod === "oauth") {
    try {
      const oauthRow = await svc.getByName(companyId, SECRET_NAME_OAUTH_TOKEN);
      if (oauthRow) {
        const value = await svc.resolveSecretValue(companyId, oauthRow.id, "latest");
        if (value && value.trim().length > 0) {
          return { type: "oauth_token", value: value.trim() };
        }
      }
    } catch (err) {
      logger.warn({ err, companyId }, "Failed to resolve company ANTHROPIC_OAUTH_TOKEN secret (oauth fast-path)");
    }
    // Fall through to env fallback — do NOT try API key if method is oauth
    const envKey = process.env.ANTHROPIC_API_KEY;
    if (envKey && envKey.trim().length > 0) {
      return { type: "api_key", value: envKey.trim() };
    }
    return null;
  }

  // Fast-path: if the stored method is "api_key", resolve only the API key.
  if (llmAuthMethod === "api_key") {
    try {
      const secretRow = await svc.getByName(companyId, SECRET_NAME_API_KEY);
      if (secretRow) {
        const value = await svc.resolveSecretValue(companyId, secretRow.id, "latest");
        if (value && value.trim().length > 0) {
          return { type: "api_key", value: value.trim() };
        }
      }
    } catch (err) {
      logger.warn({ err, companyId }, "Failed to resolve company ANTHROPIC_API_KEY secret (api_key fast-path)");
    }
    const envKey = process.env.ANTHROPIC_API_KEY;
    if (envKey && envKey.trim().length > 0) {
      return { type: "api_key", value: envKey.trim() };
    }
    return null;
  }

  // Default full priority order (llmAuthMethod is "none", undefined, or unknown).

  // 1. Company BYOK API key
  try {
    const secretRow = await svc.getByName(companyId, SECRET_NAME_API_KEY);
    if (secretRow) {
      const value = await svc.resolveSecretValue(companyId, secretRow.id, "latest");
      if (value && value.trim().length > 0) {
        return { type: "api_key", value: value.trim() };
      }
    }
  } catch (err) {
    logger.warn({ err, companyId }, "Failed to resolve company ANTHROPIC_API_KEY secret");
  }

  // 2. Company Anthropic OAuth token
  try {
    const oauthRow = await svc.getByName(companyId, SECRET_NAME_OAUTH_TOKEN);
    if (oauthRow) {
      const value = await svc.resolveSecretValue(companyId, oauthRow.id, "latest");
      if (value && value.trim().length > 0) {
        return { type: "oauth_token", value: value.trim() };
      }
    }
  } catch (err) {
    logger.warn({ err, companyId }, "Failed to resolve company ANTHROPIC_OAUTH_TOKEN secret");
  }

  // 3. Server-level env fallback (local dev / operator-managed instances)
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey && envKey.trim().length > 0) {
    return { type: "api_key", value: envKey.trim() };
  }

  return null;
}

/**
 * Build the auth headers to pass to the Anthropic Messages API.
 */
export function buildAnthropicHeaders(auth: AnthropicAuth): Record<string, string> {
  if (auth.type === "api_key") {
    return { "x-api-key": auth.value };
  }
  // OAuth token uses Authorization: Bearer
  return { Authorization: `Bearer ${auth.value}` };
}

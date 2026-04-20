/**
 * Writes a completed adapter invocation record to the audit log.
 *
 * Two-layer secret defense-in-depth:
 *   1. Caller strips key material before passing adapterConfigSnapshot.
 *   2. This writer strips any remaining keys matching SNAPSHOT_BLOCKLIST
 *      so a future caller that forgets step 1 is still safe.
 *
 * Preview fields are truncated at 120 chars — enough to show the first line
 * of a prompt without loading the full JSONB payload in list views.
 */

import { adapterCalls } from "@ironworksai/db";
import type { Db } from "@ironworksai/db";

/** Key names that must never appear in the persisted config snapshot. */
const SNAPSHOT_BLOCKLIST = new Set([
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

const PREVIEW_MAX_CHARS = 120;

function truncate(text: string | null | undefined): string | null {
  if (!text) return null;
  return text.length <= PREVIEW_MAX_CHARS ? text : `${text.slice(0, PREVIEW_MAX_CHARS - 1)}…`;
}

/**
 * Strip secret key names from a provider config snapshot before persisting.
 * Operates on shallow keys only — nested secrets in well-structured configs
 * should already be redacted by the caller via redactSecrets().
 */
function sanitizeConfigSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!snapshot) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(snapshot)) {
    if (!SNAPSHOT_BLOCKLIST.has(k)) {
      out[k] = v;
    }
  }
  return out;
}

export interface WriteAdapterCallInput {
  companyId: string;
  agentId?: string | null;
  adapterType: string;
  model: string;
  status: "success" | "error";
  latencyMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsdCents?: number | null;
  source: string;
  replayOf?: string | null;
  errorCode?: string | null;
  promptText?: string | null;
  promptPayload?: unknown;
  responseText?: string | null;
  responsePayload?: unknown;
  adapterConfigSnapshot?: Record<string, unknown> | null;
  requestId?: string | null;
  occurredAt?: Date;
}

export async function writeAdapterCall(db: Db, input: WriteAdapterCallInput): Promise<void> {
  await db.insert(adapterCalls).values({
    companyId: input.companyId,
    agentId: input.agentId ?? null,
    adapterType: input.adapterType,
    model: input.model,
    status: input.status,
    latencyMs: input.latencyMs ?? null,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    costUsdCents: input.costUsdCents ?? null,
    source: input.source,
    replayOf: input.replayOf ?? null,
    errorCode: input.errorCode ?? null,
    promptPreview: truncate(input.promptText),
    responsePreview: truncate(input.responseText),
    promptPayload: input.promptPayload ?? null,
    responsePayload: input.responsePayload ?? null,
    adapterConfigSnapshot: sanitizeConfigSnapshot(input.adapterConfigSnapshot),
    requestId: input.requestId ?? null,
    occurredAt: input.occurredAt ?? new Date(),
  });
}

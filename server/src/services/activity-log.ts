import { createHash, randomUUID } from "node:crypto";
import type { Db } from "@ironworksai/db";
import { activityLog } from "@ironworksai/db";
import type { PluginEvent } from "@ironworksai/plugin-sdk";
import { PLUGIN_EVENT_TYPES, type PluginEventType } from "@ironworksai/shared";
import { desc, eq } from "drizzle-orm";
import { redactCurrentUserValue } from "../log-redaction.js";
import { logger } from "../middleware/logger.js";
import { sanitizeRecord } from "../redaction.js";
import { instanceSettingsService } from "./instance-settings.js";
import { publishLiveEvent } from "./live-events.js";
import type { PluginEventBus } from "./plugin-event-bus.js";

const PLUGIN_EVENT_SET: ReadonlySet<string> = new Set(PLUGIN_EVENT_TYPES);

let _pluginEventBus: PluginEventBus | null = null;

// ── getGeneral() cache ────────────────────────────────────────────────────────
// logActivity is a hot path; cache the settings to avoid a DB round-trip per call.
let cachedGeneralSettings: { data: unknown; cachedAt: number } | null = null;
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getCachedGeneralSettings(db: Db) {
  if (cachedGeneralSettings && Date.now() - cachedGeneralSettings.cachedAt < SETTINGS_CACHE_TTL_MS) {
    return cachedGeneralSettings.data;
  }
  const data = await instanceSettingsService(db).getGeneral();
  cachedGeneralSettings = { data, cachedAt: Date.now() };
  return data;
}

/** Wire the plugin event bus so domain events are forwarded to plugins. */
export function setPluginEventBus(bus: PluginEventBus): void {
  if (_pluginEventBus) {
    logger.warn("setPluginEventBus called more than once, replacing existing bus");
  }
  _pluginEventBus = bus;
}

export interface LogActivityInput {
  companyId: string;
  actorType: "agent" | "user" | "system";
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  agentId?: string | null;
  runId?: string | null;
  details?: Record<string, unknown> | null;
}

// ── Signed Log Chain ──────────────────────────────────────────────────────────
//
// Task 3: Compute a SHA-256 chain hash over each entry using the previous
// entry's hash as input. Tampering with any entry breaks the chain.
// The hash is stored in the entry's details.integrityHash field.

/** In-memory cache of the last seen hash per company to anchor the chain. */
const _lastHashByCompany = new Map<string, string>();

function computeEntryHash(
  id: string,
  action: string,
  entityId: string,
  timestamp: string,
  previousHash: string,
): string {
  return createHash("sha256").update(`${id}|${action}|${entityId}|${timestamp}|${previousHash}`).digest("hex");
}

/**
 * Verify the integrity hash chain for a company's recent activity log.
 * Returns { valid: true } when all hashes chain correctly, or
 * { valid: false, firstBrokenIndex: number, brokenEntryId: string } on failure.
 */
export async function verifyLogIntegrity(
  db: Db,
  companyId: string,
  limit = 100,
): Promise<{ valid: boolean; checked: number; firstBrokenIndex?: number; brokenEntryId?: string }> {
  const entries = await db
    .select({
      id: activityLog.id,
      action: activityLog.action,
      entityId: activityLog.entityId,
      createdAt: activityLog.createdAt,
      details: activityLog.details,
    })
    .from(activityLog)
    .where(eq(activityLog.companyId, companyId))
    .orderBy(activityLog.createdAt, activityLog.id)
    .limit(limit);

  if (entries.length === 0) return { valid: true, checked: 0 };

  let previousHash = "genesis";
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const stored = (entry.details as Record<string, unknown> | null)?.integrityHash;
    if (!stored) continue; // entries before this feature was added are skipped
    const expected = computeEntryHash(
      entry.id,
      entry.action,
      entry.entityId,
      new Date(entry.createdAt).toISOString(),
      previousHash,
    );
    if (stored !== expected) {
      return { valid: false, checked: i + 1, firstBrokenIndex: i, brokenEntryId: entry.id };
    }
    previousHash = expected;
  }
  return { valid: true, checked: entries.length };
}

export async function logActivity(db: Db, input: LogActivityInput) {
  const generalSettings = (await getCachedGeneralSettings(db)) as { censorUsernameInLogs: boolean };
  const currentUserRedactionOptions = {
    enabled: generalSettings.censorUsernameInLogs,
  };
  const sanitizedDetails = input.details ? sanitizeRecord(input.details) : null;
  const redactedDetails = sanitizedDetails
    ? redactCurrentUserValue(sanitizedDetails, currentUserRedactionOptions)
    : null;

  // Task 3: Compute integrity hash for this entry and chain it to the previous.
  const entryId = randomUUID();
  const now = new Date();

  // Fix 5: On the first logActivity call per company (after a server restart),
  // seed the in-memory chain from the last persisted hash rather than "genesis".
  if (!_lastHashByCompany.has(input.companyId)) {
    const lastEntry = await db
      .select({ details: activityLog.details })
      .from(activityLog)
      .where(eq(activityLog.companyId, input.companyId))
      .orderBy(desc(activityLog.createdAt))
      .limit(1)
      .then((rows) => rows[0]);
    const lastHash = ((lastEntry?.details as Record<string, unknown> | null)?.integrityHash as string) ?? "genesis";
    _lastHashByCompany.set(input.companyId, lastHash);
  }

  const previousHash = _lastHashByCompany.get(input.companyId) ?? "genesis";
  const integrityHash = computeEntryHash(entryId, input.action, input.entityId, now.toISOString(), previousHash);
  _lastHashByCompany.set(input.companyId, integrityHash);

  const detailsWithHash: Record<string, unknown> = {
    ...(redactedDetails ?? {}),
    integrityHash,
  };

  await db.insert(activityLog).values({
    id: entryId,
    companyId: input.companyId,
    actorType: input.actorType,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    agentId: input.agentId ?? null,
    runId: input.runId ?? null,
    details: detailsWithHash,
    createdAt: now,
  });

  publishLiveEvent({
    companyId: input.companyId,
    type: "activity.logged",
    payload: {
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      agentId: input.agentId ?? null,
      runId: input.runId ?? null,
      details: redactedDetails,
    },
  });

  if (_pluginEventBus && PLUGIN_EVENT_SET.has(input.action)) {
    const event: PluginEvent = {
      eventId: randomUUID(),
      eventType: input.action as PluginEventType,
      occurredAt: new Date().toISOString(),
      actorId: input.actorId,
      actorType: input.actorType,
      entityId: input.entityId,
      entityType: input.entityType,
      companyId: input.companyId,
      payload: {
        ...redactedDetails,
        agentId: input.agentId ?? null,
        runId: input.runId ?? null,
      },
    };
    void _pluginEventBus
      .emit(event)
      .then(({ errors }) => {
        for (const { pluginId, error } of errors) {
          logger.warn({ pluginId, eventType: event.eventType, err: error }, "plugin event handler failed");
        }
      })
      .catch(() => {});
  }
}

/**
 * Clears all module-level mutable state so each `it()` block starts clean.
 * Called by the vitest setup file; never invoke in production code paths.
 */
export function _resetSingletonsForTest(): void {
  _pluginEventBus = null;
  cachedGeneralSettings = null;
  _lastHashByCompany.clear();
}

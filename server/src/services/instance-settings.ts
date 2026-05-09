import type { Db } from "@ironworksai/db";
import { companies, instanceSettings } from "@ironworksai/db";
import {
  type InstanceExperimentalSettings,
  type InstanceGeneralSettings,
  type InstanceSettings,
  instanceExperimentalSettingsSchema,
  instanceGeneralSettingsSchema,
  type PatchInstanceExperimentalSettings,
  type PatchInstanceGeneralSettings,
} from "@ironworksai/shared";
import { eq } from "drizzle-orm";

const DEFAULT_SINGLETON_KEY = "default";

function normalizeGeneralSettings(raw: unknown): InstanceGeneralSettings {
  const parsed = instanceGeneralSettingsSchema.safeParse(raw ?? {});
  if (parsed.success) {
    // Always materialize `notes` with both inner keys populated. Defaults
    // (persistRunNotes=false, persistDecisionNotes=true) apply when the
    // persisted blob is absent or partial, so consumers (UI toggles, runtime
    // checks) always read a fully-populated section.
    const notes = {
      persistRunNotes: parsed.data.notes?.persistRunNotes ?? false,
      persistDecisionNotes: parsed.data.notes?.persistDecisionNotes ?? true,
    };
    // Materialize `vaultSnapshot` with full defaults so the cron + UI always
    // read a populated section. Defaults: enabled=false, cadence="off",
    // keyPrefix="" — cron skips by default. Optional credential refs stay
    // undefined until the operator wires them up.
    const vs = parsed.data.vaultSnapshot;
    const vaultSnapshot = {
      enabled: vs?.enabled ?? false,
      bucketName: vs?.bucketName,
      endpoint: vs?.endpoint,
      accessKeyIdSecretId: vs?.accessKeyIdSecretId,
      secretAccessKeySecretId: vs?.secretAccessKeySecretId,
      keyPrefix: vs?.keyPrefix ?? "",
      cadence: vs?.cadence ?? ("off" as const),
    };
    return {
      censorUsernameInLogs: parsed.data.censorUsernameInLogs ?? false,
      backupRetention: parsed.data.backupRetention,
      scheduler: parsed.data.scheduler,
      promptPreamble: parsed.data.promptPreamble,
      notes,
      vaultSnapshot,
    };
  }
  return {
    censorUsernameInLogs: false,
  };
}

function normalizeExperimentalSettings(raw: unknown): InstanceExperimentalSettings {
  const parsed = instanceExperimentalSettingsSchema.safeParse(raw ?? {});
  if (parsed.success) {
    return {
      enableIsolatedWorkspaces: parsed.data.enableIsolatedWorkspaces ?? false,
      autoRestartDevServerWhenIdle: parsed.data.autoRestartDevServerWhenIdle ?? false,
    };
  }
  return {
    enableIsolatedWorkspaces: false,
    autoRestartDevServerWhenIdle: false,
  };
}

function toInstanceSettings(row: typeof instanceSettings.$inferSelect): InstanceSettings {
  return {
    id: row.id,
    general: normalizeGeneralSettings(row.general),
    experimental: normalizeExperimentalSettings(row.experimental),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function instanceSettingsService(db: Db) {
  async function getOrCreateRow() {
    const existing = await db
      .select()
      .from(instanceSettings)
      .where(eq(instanceSettings.singletonKey, DEFAULT_SINGLETON_KEY))
      .then((rows) => rows[0] ?? null);
    if (existing) return existing;

    const now = new Date();
    const [created] = await db
      .insert(instanceSettings)
      .values({
        singletonKey: DEFAULT_SINGLETON_KEY,
        general: {},
        experimental: {},
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [instanceSettings.singletonKey],
        set: {
          updatedAt: now,
        },
      })
      .returning();

    return created;
  }

  return {
    get: async (): Promise<InstanceSettings> => toInstanceSettings(await getOrCreateRow()),

    getGeneral: async (): Promise<InstanceGeneralSettings> => {
      const row = await getOrCreateRow();
      return normalizeGeneralSettings(row.general);
    },

    getExperimental: async (): Promise<InstanceExperimentalSettings> => {
      const row = await getOrCreateRow();
      return normalizeExperimentalSettings(row.experimental);
    },

    updateGeneral: async (patch: PatchInstanceGeneralSettings): Promise<InstanceSettings> => {
      const current = await getOrCreateRow();
      const currentGeneral = normalizeGeneralSettings(current.general);
      // Nested merge for `notes`: a partial patch like `{ notes: { persistRunNotes: true } }`
      // must preserve the previously-set `persistDecisionNotes`. Shallow spread alone would
      // overwrite the whole sub-object. Other top-level keys keep shallow-replacement
      // semantics — they're either scalars or whole-object replacements (backupRetention,
      // scheduler) where the caller is expected to send the full sub-object.
      const mergedNotes =
        patch.notes !== undefined
          ? {
              persistRunNotes: patch.notes.persistRunNotes ?? currentGeneral.notes?.persistRunNotes ?? false,
              persistDecisionNotes:
                patch.notes.persistDecisionNotes ?? currentGeneral.notes?.persistDecisionNotes ?? true,
            }
          : currentGeneral.notes;
      // Same nested-merge rationale for `vaultSnapshot`: a partial patch like
      // `{ vaultSnapshot: { enabled: true } }` must preserve previously-set
      // bucketName / endpoint / cadence / credential refs. The patch validator
      // strips inner-field defaults so unset keys arrive as `undefined`, and
      // the `??` chain falls through to the prior value.
      const currentVs = currentGeneral.vaultSnapshot;
      const mergedVaultSnapshot =
        patch.vaultSnapshot !== undefined
          ? {
              enabled: patch.vaultSnapshot.enabled ?? currentVs?.enabled ?? false,
              bucketName: patch.vaultSnapshot.bucketName ?? currentVs?.bucketName,
              endpoint: patch.vaultSnapshot.endpoint ?? currentVs?.endpoint,
              accessKeyIdSecretId: patch.vaultSnapshot.accessKeyIdSecretId ?? currentVs?.accessKeyIdSecretId,
              secretAccessKeySecretId:
                patch.vaultSnapshot.secretAccessKeySecretId ?? currentVs?.secretAccessKeySecretId,
              keyPrefix: patch.vaultSnapshot.keyPrefix ?? currentVs?.keyPrefix ?? "",
              cadence: patch.vaultSnapshot.cadence ?? currentVs?.cadence ?? ("off" as const),
            }
          : currentVs;
      const nextGeneral = normalizeGeneralSettings({
        ...currentGeneral,
        ...patch,
        notes: mergedNotes,
        vaultSnapshot: mergedVaultSnapshot,
      });
      const now = new Date();
      const [updated] = await db
        .update(instanceSettings)
        .set({
          general: { ...nextGeneral },
          updatedAt: now,
        })
        .where(eq(instanceSettings.id, current.id))
        .returning();
      return toInstanceSettings(updated ?? current);
    },

    updateExperimental: async (patch: PatchInstanceExperimentalSettings): Promise<InstanceSettings> => {
      const current = await getOrCreateRow();
      const nextExperimental = normalizeExperimentalSettings({
        ...normalizeExperimentalSettings(current.experimental),
        ...patch,
      });
      const now = new Date();
      const [updated] = await db
        .update(instanceSettings)
        .set({
          experimental: { ...nextExperimental },
          updatedAt: now,
        })
        .where(eq(instanceSettings.id, current.id))
        .returning();
      return toInstanceSettings(updated ?? current);
    },

    listCompanyIds: async (): Promise<string[]> =>
      db
        .select({ id: companies.id })
        .from(companies)
        .then((rows) => rows.map((row) => row.id)),
  };
}

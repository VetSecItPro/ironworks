import { z } from "zod";

export const backupRetentionPolicySchema = z.object({
  dailyDays: z.number().int().min(1).max(365).default(7),
  weeklyWeeks: z.number().int().min(0).max(52).default(4),
  monthlyMonths: z.number().int().min(0).max(120).default(1),
});

export const schedulerSettingsSchema = z.object({
  iterationLimitPerDay: z.number().int().min(10).max(10000).default(100),
  iterationLimitPerTask: z.number().int().min(5).max(1000).default(20),
  costAnomalyMultiplier: z.number().min(2).max(20).default(5),
  consecutiveFailureLimit: z.number().int().min(3).max(20).default(5),
  idleSkipEnabled: z.boolean().default(true),
  heartbeatSafetyNetMinutes: z.number().int().min(5).max(60).default(30),
});

/**
 * Instance-wide note persistence preferences. When `persistRunNotes` is true,
 * agent run notes are written to the vault as markdown alongside frontmatter;
 * when false (default), they stay ephemeral. `persistDecisionNotes` defaults
 * to true because decisions are higher-signal and worth persisting by default.
 */
export const instanceNotesSettingsSchema = z.object({
  persistRunNotes: z.boolean().default(false),
  persistDecisionNotes: z.boolean().default(true),
});

/**
 * Scheduled R2 vault-snapshot settings (P3.2).
 *
 * Credentials are NOT stored inline — the schema references `company_secrets`
 * row IDs, and the cron resolves the actual values via `secretService` at run
 * time. `cadence: "off"` (the default) means the cron skips this instance
 * entirely; "daily"/"weekly" gate the per-cadence cron tick.
 */
export const vaultSnapshotSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  bucketName: z.string().min(1).optional(),
  endpoint: z.string().url().optional(),
  accessKeyIdSecretId: z.string().uuid().optional(),
  secretAccessKeySecretId: z.string().uuid().optional(),
  keyPrefix: z.string().default(""),
  cadence: z.enum(["daily", "weekly", "off"]).default("off"),
});

export const instanceGeneralSettingsSchema = z
  .object({
    censorUsernameInLogs: z.boolean().default(false),
    backupRetention: backupRetentionPolicySchema.optional(),
    scheduler: schedulerSettingsSchema.optional(),
    /**
     * Instance-tier prompt preamble. Prepended to every agent's resolved
     * system prompt at heartbeat time, before role/agent tiers. Use for
     * operator-level context that applies to ALL agents in this deployment
     * (e.g., parent-company identity, compliance posture, time-zone defaults).
     * Empty/absent → no prepend, behavior unchanged.
     */
    promptPreamble: z.string().max(4000).optional(),
    notes: instanceNotesSettingsSchema.optional(),
    vaultSnapshot: vaultSnapshotSettingsSchema.optional(),
  })
  .strict();

// Zod 4 materializes defaults during .partial(). PATCH schemas must not inject
// absent fields into the parsed body — the service layer uses key presence to
// determine which columns to write. We redeclare the defaulted fields without
// defaults so the parsed object only contains keys the caller actually sent.
// Patch variant for `notes`: redeclare without defaults so absent inner keys
// don't get materialized at parse time — service-layer merging owns defaults.
export const patchInstanceNotesSettingsSchema = z.object({
  persistRunNotes: z.boolean().optional(),
  persistDecisionNotes: z.boolean().optional(),
});

// Patch variant for `vaultSnapshot`: same rationale as `notes` — strip the
// inner-field defaults so a partial PATCH only carries keys the caller sent.
// The service layer merges with current persisted values.
export const patchVaultSnapshotSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  bucketName: z.string().min(1).optional(),
  endpoint: z.string().url().optional(),
  accessKeyIdSecretId: z.string().uuid().optional(),
  secretAccessKeySecretId: z.string().uuid().optional(),
  keyPrefix: z.string().optional(),
  cadence: z.enum(["daily", "weekly", "off"]).optional(),
});

export const patchInstanceGeneralSettingsSchema = instanceGeneralSettingsSchema.partial().extend({
  censorUsernameInLogs: z.boolean().optional(),
  promptPreamble: z.string().max(4000).optional(),
  notes: patchInstanceNotesSettingsSchema.optional(),
  vaultSnapshot: patchVaultSnapshotSettingsSchema.optional(),
});

export const instanceExperimentalSettingsSchema = z
  .object({
    enableIsolatedWorkspaces: z.boolean().default(false),
    autoRestartDevServerWhenIdle: z.boolean().default(false),
  })
  .strict();

export const patchInstanceExperimentalSettingsSchema = instanceExperimentalSettingsSchema.partial().extend({
  enableIsolatedWorkspaces: z.boolean().optional(),
  autoRestartDevServerWhenIdle: z.boolean().optional(),
});

export type SchedulerSettings = z.infer<typeof schedulerSettingsSchema>;
export type InstanceNotesSettings = z.infer<typeof instanceNotesSettingsSchema>;
export type PatchInstanceNotesSettings = z.infer<typeof patchInstanceNotesSettingsSchema>;
export type InstanceVaultSnapshotSettings = z.infer<typeof vaultSnapshotSettingsSchema>;
export type PatchInstanceVaultSnapshotSettings = z.infer<typeof patchVaultSnapshotSettingsSchema>;
export type InstanceGeneralSettings = z.infer<typeof instanceGeneralSettingsSchema>;
export type PatchInstanceGeneralSettings = z.infer<typeof patchInstanceGeneralSettingsSchema>;
export type InstanceExperimentalSettings = z.infer<typeof instanceExperimentalSettingsSchema>;
export type PatchInstanceExperimentalSettings = z.infer<typeof patchInstanceExperimentalSettingsSchema>;

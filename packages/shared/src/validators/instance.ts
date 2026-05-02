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
  })
  .strict();

// Zod 4 materializes defaults during .partial(). PATCH schemas must not inject
// absent fields into the parsed body — the service layer uses key presence to
// determine which columns to write. We redeclare the defaulted fields without
// defaults so the parsed object only contains keys the caller actually sent.
export const patchInstanceGeneralSettingsSchema = instanceGeneralSettingsSchema.partial().extend({
  censorUsernameInLogs: z.boolean().optional(),
  promptPreamble: z.string().max(4000).optional(),
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
export type InstanceGeneralSettings = z.infer<typeof instanceGeneralSettingsSchema>;
export type PatchInstanceGeneralSettings = z.infer<typeof patchInstanceGeneralSettingsSchema>;
export type InstanceExperimentalSettings = z.infer<typeof instanceExperimentalSettingsSchema>;
export type PatchInstanceExperimentalSettings = z.infer<typeof patchInstanceExperimentalSettingsSchema>;

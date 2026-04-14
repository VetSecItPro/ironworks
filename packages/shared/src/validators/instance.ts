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

export const instanceGeneralSettingsSchema = z.object({
  censorUsernameInLogs: z.boolean().default(false),
  backupRetention: backupRetentionPolicySchema.optional(),
  scheduler: schedulerSettingsSchema.optional(),
}).strict();

export const patchInstanceGeneralSettingsSchema = instanceGeneralSettingsSchema.partial();

export const instanceExperimentalSettingsSchema = z.object({
  enableIsolatedWorkspaces: z.boolean().default(false),
  autoRestartDevServerWhenIdle: z.boolean().default(false),
}).strict();

export const patchInstanceExperimentalSettingsSchema = instanceExperimentalSettingsSchema.partial();

export type SchedulerSettings = z.infer<typeof schedulerSettingsSchema>;
export type InstanceGeneralSettings = z.infer<typeof instanceGeneralSettingsSchema>;
export type PatchInstanceGeneralSettings = z.infer<typeof patchInstanceGeneralSettingsSchema>;
export type InstanceExperimentalSettings = z.infer<typeof instanceExperimentalSettingsSchema>;
export type PatchInstanceExperimentalSettings = z.infer<typeof patchInstanceExperimentalSettingsSchema>;

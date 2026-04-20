export interface BackupRetentionPolicy {
  dailyDays: number; // keep all backups for this many days
  weeklyWeeks: number; // keep one per week for this many weeks
  monthlyMonths: number; // keep one per month for this many months
}

export interface SchedulerSettings {
  iterationLimitPerDay: number;
  iterationLimitPerTask: number;
  costAnomalyMultiplier: number;
  consecutiveFailureLimit: number;
  idleSkipEnabled: boolean;
  heartbeatSafetyNetMinutes: number;
}

export interface InstanceGeneralSettings {
  censorUsernameInLogs: boolean;
  backupRetention?: BackupRetentionPolicy;
  scheduler?: SchedulerSettings;
}

export interface InstanceExperimentalSettings {
  enableIsolatedWorkspaces: boolean;
  autoRestartDevServerWhenIdle: boolean;
}

export interface InstanceSettings {
  id: string;
  general: InstanceGeneralSettings;
  experimental: InstanceExperimentalSettings;
  createdAt: Date;
  updatedAt: Date;
}

import type { BackupRetentionPolicy, SchedulerSettings } from "@ironworksai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { authApi } from "@/api/auth";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";

export function InstanceGeneralSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Instance Settings" }, { label: "General" }]);
  }, [setBreadcrumbs]);

  const generalQuery = useQuery({
    queryKey: queryKeys.instance.generalSettings,
    queryFn: () => instanceSettingsApi.getGeneral(),
  });

  const signOutMutation = useMutation({
    mutationFn: () => authApi.signOut(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to sign out.");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => instanceSettingsApi.updateGeneral({ censorUsernameInLogs: enabled }),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.instance.generalSettings });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to update general settings.");
    },
  });

  const retentionMutation = useMutation({
    mutationFn: async (policy: BackupRetentionPolicy) => instanceSettingsApi.updateGeneral({ backupRetention: policy }),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.instance.generalSettings });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to update backup retention.");
    },
  });

  const schedulerMutation = useMutation({
    mutationFn: async (settings: SchedulerSettings) => instanceSettingsApi.updateGeneral({ scheduler: settings }),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.instance.generalSettings });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to update scheduler settings.");
    },
  });

  if (generalQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading general settings...</div>;
  }

  if (generalQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {generalQuery.error instanceof Error ? generalQuery.error.message : "Failed to load general settings."}
      </div>
    );
  }

  const censorUsernameInLogs = generalQuery.data?.censorUsernameInLogs === true;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">General</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure instance-wide defaults that affect how operator-visible logs are displayed.
        </p>
      </div>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">Censor username in logs</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Hide the username segment in home-directory paths and similar operator-visible log output. Standalone
              username mentions outside of paths are not yet masked in the live transcript view. This is off by default.
            </p>
          </div>
          <button
            type="button"
            data-slot="toggle"
            aria-label="Toggle username log censoring"
            disabled={toggleMutation.isPending}
            className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              censorUsernameInLogs ? "bg-green-600" : "bg-muted",
            )}
            onClick={() => toggleMutation.mutate(!censorUsernameInLogs)}
          >
            <span
              className={cn(
                "inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform",
                censorUsernameInLogs ? "translate-x-4.5" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">Backup retention policy</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Control how long database backups are kept. Daily backups are retained in full, weekly keeps one per
              calendar week, and monthly keeps one per calendar month.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="retention-daily" className="text-xs font-medium text-muted-foreground">
                Daily retention
              </label>
              <select
                id="retention-daily"
                disabled={retentionMutation.isPending}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                value={generalQuery.data?.backupRetention?.dailyDays ?? 7}
                onChange={(e) => {
                  const current = generalQuery.data?.backupRetention ?? {
                    dailyDays: 7,
                    weeklyWeeks: 4,
                    monthlyMonths: 1,
                  };
                  retentionMutation.mutate({ ...current, dailyDays: Number(e.target.value) });
                }}
              >
                <option value={3}>3 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="retention-weekly" className="text-xs font-medium text-muted-foreground">
                Weekly retention
              </label>
              <select
                id="retention-weekly"
                disabled={retentionMutation.isPending}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                value={generalQuery.data?.backupRetention?.weeklyWeeks ?? 4}
                onChange={(e) => {
                  const current = generalQuery.data?.backupRetention ?? {
                    dailyDays: 7,
                    weeklyWeeks: 4,
                    monthlyMonths: 1,
                  };
                  retentionMutation.mutate({ ...current, weeklyWeeks: Number(e.target.value) });
                }}
              >
                <option value={1}>1 week</option>
                <option value={2}>2 weeks</option>
                <option value={4}>4 weeks</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="retention-monthly" className="text-xs font-medium text-muted-foreground">
                Monthly retention
              </label>
              <select
                id="retention-monthly"
                disabled={retentionMutation.isPending}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                value={generalQuery.data?.backupRetention?.monthlyMonths ?? 1}
                onChange={(e) => {
                  const current = generalQuery.data?.backupRetention ?? {
                    dailyDays: 7,
                    weeklyWeeks: 4,
                    monthlyMonths: 1,
                  };
                  retentionMutation.mutate({ ...current, monthlyMonths: Number(e.target.value) });
                }}
              >
                <option value={1}>1 month</option>
                <option value={3}>3 months</option>
                <option value={6}>6 months</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">Scheduler settings</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Control agent iteration limits, anomaly detection thresholds, and idle-skip behavior for the heartbeat
              scheduler.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="scheduler-iter-day" className="text-xs font-medium text-muted-foreground">
                Iteration limit per day
              </label>
              <input
                id="scheduler-iter-day"
                type="number"
                min={10}
                max={10000}
                disabled={schedulerMutation.isPending}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                value={generalQuery.data?.scheduler?.iterationLimitPerDay ?? 100}
                onChange={(e) => {
                  const current = generalQuery.data?.scheduler ?? {
                    iterationLimitPerDay: 100,
                    iterationLimitPerTask: 20,
                    costAnomalyMultiplier: 5,
                    consecutiveFailureLimit: 5,
                    idleSkipEnabled: true,
                    heartbeatSafetyNetMinutes: 30,
                  };
                  schedulerMutation.mutate({ ...current, iterationLimitPerDay: Number(e.target.value) });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="scheduler-iter-task" className="text-xs font-medium text-muted-foreground">
                Iteration limit per task
              </label>
              <input
                id="scheduler-iter-task"
                type="number"
                min={5}
                max={1000}
                disabled={schedulerMutation.isPending}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                value={generalQuery.data?.scheduler?.iterationLimitPerTask ?? 20}
                onChange={(e) => {
                  const current = generalQuery.data?.scheduler ?? {
                    iterationLimitPerDay: 100,
                    iterationLimitPerTask: 20,
                    costAnomalyMultiplier: 5,
                    consecutiveFailureLimit: 5,
                    idleSkipEnabled: true,
                    heartbeatSafetyNetMinutes: 30,
                  };
                  schedulerMutation.mutate({ ...current, iterationLimitPerTask: Number(e.target.value) });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="scheduler-anomaly" className="text-xs font-medium text-muted-foreground">
                Cost anomaly threshold
              </label>
              <select
                id="scheduler-anomaly"
                disabled={schedulerMutation.isPending}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                value={generalQuery.data?.scheduler?.costAnomalyMultiplier ?? 5}
                onChange={(e) => {
                  const current = generalQuery.data?.scheduler ?? {
                    iterationLimitPerDay: 100,
                    iterationLimitPerTask: 20,
                    costAnomalyMultiplier: 5,
                    consecutiveFailureLimit: 5,
                    idleSkipEnabled: true,
                    heartbeatSafetyNetMinutes: 30,
                  };
                  schedulerMutation.mutate({ ...current, costAnomalyMultiplier: Number(e.target.value) });
                }}
              >
                <option value={3}>3x baseline</option>
                <option value={5}>5x baseline</option>
                <option value={8}>8x baseline</option>
                <option value={10}>10x baseline</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="scheduler-fail-limit" className="text-xs font-medium text-muted-foreground">
                Consecutive failure limit
              </label>
              <select
                id="scheduler-fail-limit"
                disabled={schedulerMutation.isPending}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                value={generalQuery.data?.scheduler?.consecutiveFailureLimit ?? 5}
                onChange={(e) => {
                  const current = generalQuery.data?.scheduler ?? {
                    iterationLimitPerDay: 100,
                    iterationLimitPerTask: 20,
                    costAnomalyMultiplier: 5,
                    consecutiveFailureLimit: 5,
                    idleSkipEnabled: true,
                    heartbeatSafetyNetMinutes: 30,
                  };
                  schedulerMutation.mutate({ ...current, consecutiveFailureLimit: Number(e.target.value) });
                }}
              >
                <option value={3}>3 failures</option>
                <option value={5}>5 failures</option>
                <option value={8}>8 failures</option>
                <option value={10}>10 failures</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="scheduler-safety-net" className="text-xs font-medium text-muted-foreground">
                Safety net interval
              </label>
              <select
                id="scheduler-safety-net"
                disabled={schedulerMutation.isPending}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                value={generalQuery.data?.scheduler?.heartbeatSafetyNetMinutes ?? 30}
                onChange={(e) => {
                  const current = generalQuery.data?.scheduler ?? {
                    iterationLimitPerDay: 100,
                    iterationLimitPerTask: 20,
                    costAnomalyMultiplier: 5,
                    consecutiveFailureLimit: 5,
                    idleSkipEnabled: true,
                    heartbeatSafetyNetMinutes: 30,
                  };
                  schedulerMutation.mutate({ ...current, heartbeatSafetyNetMinutes: Number(e.target.value) });
                }}
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="space-y-1">
              <p className="text-sm font-medium">Idle skip</p>
              <p className="max-w-2xl text-xs text-muted-foreground">
                Skip heartbeat wakeups for agents with no assigned work that ran within the safety net window.
              </p>
            </div>
            <button
              type="button"
              data-slot="toggle"
              aria-label="Toggle idle skip"
              disabled={schedulerMutation.isPending}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                (generalQuery.data?.scheduler?.idleSkipEnabled ?? true) ? "bg-green-600" : "bg-muted",
              )}
              onClick={() => {
                const current = generalQuery.data?.scheduler ?? {
                  iterationLimitPerDay: 100,
                  iterationLimitPerTask: 20,
                  costAnomalyMultiplier: 5,
                  consecutiveFailureLimit: 5,
                  idleSkipEnabled: true,
                  heartbeatSafetyNetMinutes: 30,
                };
                schedulerMutation.mutate({ ...current, idleSkipEnabled: !(current.idleSkipEnabled ?? true) });
              }}
            >
              <span
                className={cn(
                  "inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform",
                  (generalQuery.data?.scheduler?.idleSkipEnabled ?? true) ? "translate-x-4.5" : "translate-x-0.5",
                )}
              />
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-destructive/30 bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">Sign out</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Sign out of this IronWorks instance. You will need to sign back in to continue using the app.
            </p>
          </div>
          <Button variant="destructive" size="sm" className="shrink-0" onClick={() => setShowSignOutDialog(true)}>
            <LogOut className="mr-1.5 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </section>

      <Dialog open={showSignOutDialog} onOpenChange={setShowSignOutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out?</DialogTitle>
            <DialogDescription>
              You will be signed out of this instance and redirected to the sign-in page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSignOutDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={signOutMutation.isPending}
              onClick={() => {
                setShowSignOutDialog(false);
                signOutMutation.mutate();
              }}
            >
              Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

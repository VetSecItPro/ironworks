/**
 * @fileoverview Plugin Manager page - admin UI for discovering,
 * installing, enabling/disabling, and uninstalling plugins.
 */

import type { PluginRecord } from "@ironworksai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, Puzzle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { pluginsApi } from "@/api/plugins";
import {
  AvailablePluginsSection,
  ErrorDetailsDialog,
  InstalledPluginsSection,
  UninstallDialog,
} from "@/components/plugin-manager";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";

export function PluginManager() {
  const { selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [installPackage, setInstallPackage] = useState("");
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [uninstallPluginId, setUninstallPluginId] = useState<string | null>(null);
  const [uninstallPluginName, setUninstallPluginName] = useState<string>("");
  const [errorDetailsPlugin, setErrorDetailsPlugin] = useState<PluginRecord | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Settings", href: "/instance/settings/heartbeats" },
      { label: "Plugins" },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs]);

  const {
    data: plugins,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.plugins.all,
    queryFn: () => pluginsApi.list(),
  });

  const examplesQuery = useQuery({
    queryKey: queryKeys.plugins.examples,
    queryFn: () => pluginsApi.listExamples(),
  });

  const invalidatePluginQueries = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.plugins.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.plugins.examples });
    queryClient.invalidateQueries({ queryKey: queryKeys.plugins.uiContributions });
  };

  const installMutation = useMutation({
    mutationFn: (params: { packageName: string; version?: string; isLocalPath?: boolean }) =>
      pluginsApi.install(params),
    onSuccess: () => {
      invalidatePluginQueries();
      setInstallDialogOpen(false);
      setInstallPackage("");
      pushToast({ title: "Plugin installed successfully", tone: "success" });
    },
    onError: (err: Error) => {
      pushToast({ title: "Failed to install plugin", body: err.message, tone: "error" });
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: (pluginId: string) => pluginsApi.uninstall(pluginId),
    onSuccess: () => {
      invalidatePluginQueries();
      pushToast({ title: "Plugin uninstalled successfully", tone: "success" });
    },
    onError: (err: Error) => {
      pushToast({ title: "Failed to uninstall plugin", body: err.message, tone: "error" });
    },
  });

  const enableMutation = useMutation({
    mutationFn: (pluginId: string) => pluginsApi.enable(pluginId),
    onSuccess: () => {
      invalidatePluginQueries();
      pushToast({ title: "Plugin enabled", tone: "success" });
    },
    onError: (err: Error) => {
      pushToast({ title: "Failed to enable plugin", body: err.message, tone: "error" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: (pluginId: string) => pluginsApi.disable(pluginId),
    onSuccess: () => {
      invalidatePluginQueries();
      pushToast({ title: "Plugin disabled", tone: "info" });
    },
    onError: (err: Error) => {
      pushToast({ title: "Failed to disable plugin", body: err.message, tone: "error" });
    },
  });

  const installedPlugins = plugins ?? [];
  const examples = examplesQuery.data ?? [];
  const installedByPackageName = new Map(installedPlugins.map((p) => [p.packageName, p]));
  const examplePackageNames = new Set(examples.map((e) => e.packageName));
  const errorSummaryByPluginId = useMemo(() => {
    const firstLine = (val: string | null | undefined) => {
      if (!val) return "Plugin entered an error state without a stored error message.";
      const line = val
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean);
      return line ?? "Plugin entered an error state without a stored error message.";
    };
    return new Map(installedPlugins.map((p) => [p.id, firstLine(p.lastError)]));
  }, [installedPlugins]);

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading plugins...</div>;
  if (error) return <div className="p-4 text-sm text-destructive">Failed to load plugins.</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Puzzle className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Plugin Manager</h1>
        </div>
        <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Install Plugin
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Install Plugin</DialogTitle>
              <DialogDescription>Enter the npm package name of the plugin you wish to install.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="packageName">npm Package Name</Label>
                <Input
                  id="packageName"
                  placeholder="@ironworksai/plugin-example"
                  value={installPackage}
                  onChange={(e) => setInstallPackage(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInstallDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => installMutation.mutate({ packageName: installPackage })}
                disabled={!installPackage || installMutation.isPending}
              >
                {installMutation.isPending ? "Installing..." : "Install"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">Plugins are alpha.</p>
            <p className="text-muted-foreground">The plugin runtime and API surface are still changing.</p>
          </div>
        </div>
      </div>

      <AvailablePluginsSection
        examples={examples}
        isLoading={examplesQuery.isLoading}
        error={examplesQuery.error}
        installedByPackageName={installedByPackageName}
        installMutation={installMutation}
        enableMutation={enableMutation}
      />

      <InstalledPluginsSection
        plugins={installedPlugins}
        examplePackageNames={examplePackageNames}
        errorSummaryByPluginId={errorSummaryByPluginId}
        enableMutation={enableMutation}
        disableMutation={disableMutation}
        uninstallMutation={uninstallMutation}
        onUninstall={(id, name) => {
          setUninstallPluginId(id);
          setUninstallPluginName(name);
        }}
        onShowError={setErrorDetailsPlugin}
      />

      <UninstallDialog
        pluginId={uninstallPluginId}
        pluginName={uninstallPluginName}
        isPending={uninstallMutation.isPending}
        onClose={() => setUninstallPluginId(null)}
        onConfirm={(id) => uninstallMutation.mutate(id, { onSettled: () => setUninstallPluginId(null) })}
      />

      <ErrorDetailsDialog plugin={errorDetailsPlugin} onClose={() => setErrorDetailsPlugin(null)} />
    </div>
  );
}

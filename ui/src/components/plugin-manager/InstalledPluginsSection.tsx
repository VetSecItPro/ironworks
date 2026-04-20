import type { PluginRecord } from "@ironworksai/shared";
import { AlertTriangle, Power, Puzzle, Settings, Trash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";

interface InstalledPluginsSectionProps {
  plugins: PluginRecord[];
  examplePackageNames: Set<string>;
  errorSummaryByPluginId: Map<string, string>;
  enableMutation: { isPending: boolean; mutate: (id: string) => void };
  disableMutation: { isPending: boolean; mutate: (id: string) => void };
  uninstallMutation: { isPending: boolean };
  onUninstall: (id: string, name: string) => void;
  onShowError: (plugin: PluginRecord) => void;
}

export function InstalledPluginsSection({
  plugins,
  examplePackageNames,
  errorSummaryByPluginId,
  enableMutation,
  disableMutation,
  uninstallMutation,
  onUninstall,
  onShowError,
}: InstalledPluginsSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Puzzle className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-base font-semibold">Installed Plugins</h2>
      </div>

      {!plugins.length ? (
        <Card className="bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <Puzzle className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-sm font-medium">No plugins installed</p>
            <p className="text-xs text-muted-foreground mt-1">Install a plugin to extend functionality.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {plugins.map((plugin) => (
            <li key={plugin.id}>
              <div className="flex items-start gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/instance/settings/plugins/${plugin.id}`}
                      className="font-medium hover:underline truncate block"
                      title={plugin.manifestJson.displayName ?? plugin.packageName}
                    >
                      {plugin.manifestJson.displayName ?? plugin.packageName}
                    </Link>
                    {examplePackageNames.has(plugin.packageName) && <Badge variant="outline">Example</Badge>}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate" title={plugin.packageName}>
                      {plugin.packageName} · v{plugin.manifestJson.version ?? plugin.version}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5" title={plugin.manifestJson.description}>
                    {plugin.manifestJson.description || "No description provided."}
                  </p>
                  {plugin.status === "error" && (
                    <div className="mt-3 rounded-md border border-red-500/25 bg-red-500/[0.06] px-3 py-2">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>Plugin error</span>
                          </div>
                          <p
                            className="mt-1 text-sm text-red-700/90 dark:text-red-200/90 break-words"
                            title={plugin.lastError ?? undefined}
                          >
                            {errorSummaryByPluginId.get(plugin.id)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-500/30 bg-background/60 text-red-700 hover:bg-red-500/10 hover:text-red-800 dark:text-red-200 dark:hover:text-red-100"
                          onClick={() => onShowError(plugin)}
                        >
                          View full error
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 self-center">
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          plugin.status === "ready"
                            ? "default"
                            : plugin.status === "error"
                              ? "destructive"
                              : "secondary"
                        }
                        className={cn("shrink-0", plugin.status === "ready" ? "bg-green-600 hover:bg-green-700" : "")}
                      >
                        {plugin.status}
                      </Badge>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="h-8 w-8"
                        title={plugin.status === "ready" ? "Disable" : "Enable"}
                        onClick={() => {
                          if (plugin.status === "ready") {
                            disableMutation.mutate(plugin.id);
                          } else {
                            enableMutation.mutate(plugin.id);
                          }
                        }}
                        disabled={enableMutation.isPending || disableMutation.isPending}
                      >
                        <Power className={cn("h-4 w-4", plugin.status === "ready" ? "text-green-600" : "")} />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Uninstall"
                        onClick={() => {
                          onUninstall(plugin.id, plugin.manifestJson.displayName ?? plugin.packageName);
                        }}
                        disabled={uninstallMutation.isPending}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button variant="outline" size="sm" className="mt-2 h-8" asChild>
                      <Link to={`/instance/settings/plugins/${plugin.id}`}>
                        <Settings className="h-4 w-4" />
                        Configure
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

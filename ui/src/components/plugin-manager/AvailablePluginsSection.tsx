import type { PluginRecord } from "@ironworksai/shared";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/lib/router";

interface ExamplePlugin {
  packageName: string;
  localPath: string;
  displayName: string;
  description: string;
}

interface AvailablePluginsSectionProps {
  examples: ExamplePlugin[];
  isLoading: boolean;
  error: unknown;
  installedByPackageName: Map<string, PluginRecord>;
  installMutation: {
    isPending: boolean;
    variables?: { packageName: string; isLocalPath?: boolean };
    mutate: (params: { packageName: string; isLocalPath?: boolean }) => void;
  };
  enableMutation: {
    isPending: boolean;
    mutate: (id: string) => void;
  };
}

export function AvailablePluginsSection({
  examples,
  isLoading,
  error,
  installedByPackageName,
  installMutation,
  enableMutation,
}: AvailablePluginsSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-base font-semibold">Available Plugins</h2>
        <Badge variant="outline">Examples</Badge>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading bundled examples...</div>
      ) : error ? (
        <div className="text-sm text-destructive">Failed to load bundled examples.</div>
      ) : examples.length === 0 ? (
        <div className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
          No bundled example plugins were found in this checkout.
        </div>
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {examples.map((example) => {
            const installedPlugin = installedByPackageName.get(example.packageName);
            const installPending =
              installMutation.isPending &&
              installMutation.variables?.isLocalPath &&
              installMutation.variables.packageName === example.localPath;

            return (
              <li key={example.packageName}>
                <div className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{example.displayName}</span>
                      <Badge variant="outline">Example</Badge>
                      {installedPlugin ? (
                        <Badge
                          variant={installedPlugin.status === "ready" ? "default" : "secondary"}
                          className={installedPlugin.status === "ready" ? "bg-green-600 hover:bg-green-700" : ""}
                        >
                          {installedPlugin.status}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Not installed</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{example.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{example.packageName}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {installedPlugin ? (
                      <>
                        {installedPlugin.status !== "ready" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={enableMutation.isPending}
                            onClick={() => enableMutation.mutate(installedPlugin.id)}
                          >
                            Enable
                          </Button>
                        )}
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/instance/settings/plugins/${installedPlugin.id}`}>
                            {installedPlugin.status === "ready" ? "Open Settings" : "Review"}
                          </Link>
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        disabled={installPending || installMutation.isPending}
                        onClick={() =>
                          installMutation.mutate({
                            packageName: example.localPath,
                            isLocalPath: true,
                          })
                        }
                      >
                        {installPending ? "Installing..." : "Install Example"}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

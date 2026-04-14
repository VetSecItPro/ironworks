import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

const INTEGRATIONS = [
  { name: "Slack", status: "available", description: "Send notifications and alerts" },
  { name: "GitHub", status: "available", description: "Sync repos and pull requests" },
  { name: "Jira", status: "planned", description: "Two-way issue sync" },
  { name: "PagerDuty", status: "available", description: "Alert routing and escalation" },
  { name: "Datadog", status: "planned", description: "Metrics and monitoring" },
  { name: "Zapier", status: "available", description: "Connect to 5000+ apps" },
] as const;

export function IntegrationHubSection() {
  return (
    <div id="integrations" className="space-y-4 scroll-mt-6">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Integration Hub
      </div>
      <div className="rounded-md border border-border px-4 py-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Connect external tools and services to your company via webhooks and
          API integrations.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {INTEGRATIONS.map((integration) => (
            <div
              key={integration.name}
              className="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-accent/20 transition-colors"
            >
              <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                {integration.name.slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{integration.name}</span>
                  {integration.status === "planned" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                      Planned
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {integration.description}
                </p>
              </div>
              {integration.status === "available" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs shrink-0"
                >
                  Connect
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

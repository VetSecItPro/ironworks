import type { DashboardSummary } from "@ironworksai/shared";
import { AlertTriangle, X } from "lucide-react";
import { Link } from "@/lib/router";

export function InboxAlerts({
  dashboard,
  showAggregateAgentError,
  showBudgetAlert,
  onDismiss,
}: {
  dashboard: DashboardSummary;
  showAggregateAgentError: boolean;
  showBudgetAlert: boolean;
  onDismiss: (key: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Alerts</h3>
      <div className="divide-y divide-border border border-border">
        {showAggregateAgentError && (
          <div className="group/alert relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50">
            <Link to="/agents" className="flex flex-1 cursor-pointer items-center gap-3 no-underline text-inherit">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <span className="text-sm">
                <span className="font-medium">{dashboard.agents.error}</span>{" "}
                {dashboard.agents.error === 1 ? "agent has" : "agents have"} errors
              </span>
            </Link>
            <button
              type="button"
              onClick={() => onDismiss("alert:agent-errors")}
              className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/alert:opacity-100"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {showBudgetAlert && (
          <div className="group/alert relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50">
            <Link to="/costs" className="flex flex-1 cursor-pointer items-center gap-3 no-underline text-inherit">
              <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-400" />
              <span className="text-sm">
                Budget at <span className="font-medium">{dashboard.costs.monthUtilizationPercent}%</span> utilization
                this month
              </span>
            </Link>
            <button
              type="button"
              onClick={() => onDismiss("alert:budget")}
              className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/alert:opacity-100"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

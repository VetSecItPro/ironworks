import { AlertTriangle } from "lucide-react";
import type { SmartAlert } from "../../api/executive";
import { cn } from "../../lib/utils";

export function AlertsSection({
  alerts,
  onResolve,
  isResolving,
}: {
  alerts: SmartAlert[];
  onResolve: (alertId: string) => void;
  isResolving: boolean;
}) {
  if (alerts.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2 text-amber-400">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          Alerts
          <span className="inline-flex items-center justify-center rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold min-w-[18px] px-1.5 py-0.5">
            {alerts.length}
          </span>
        </h3>
      </div>
      <div className="space-y-1.5">
        {alerts.map((alert: SmartAlert) => (
          <div
            key={alert.id}
            className={cn(
              "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm",
              alert.severity === "critical"
                ? "border-red-500/20 bg-red-500/[0.06]"
                : alert.severity === "high"
                  ? "border-amber-500/20 bg-amber-500/[0.06]"
                  : "border-yellow-500/20 bg-yellow-500/[0.06]",
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  alert.severity === "critical"
                    ? "bg-red-500"
                    : alert.severity === "high"
                      ? "bg-amber-500"
                      : "bg-yellow-500",
                )}
              />
              <div className="min-w-0">
                <p className="font-medium truncate">{alert.title}</p>
                {alert.description && <p className="text-xs text-muted-foreground truncate">{alert.description}</p>}
              </div>
            </div>
            <button
              className="text-xs text-muted-foreground hover:text-foreground shrink-0 transition-colors underline underline-offset-2"
              onClick={() => onResolve(alert.id)}
              disabled={isResolving}
            >
              Resolve
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

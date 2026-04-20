import { Clock } from "lucide-react";
import type { SlaCompliance } from "../../api/executive";
import { cn } from "../../lib/utils";

interface SlaComplianceCardProps {
  slaData: SlaCompliance | undefined;
}

export function SlaComplianceCard({ slaData }: SlaComplianceCardProps) {
  return (
    <div className="rounded-xl border border-border p-5 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Clock className="h-3.5 w-3.5" />
        SLA Compliance
      </h3>
      {slaData ? (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-3xl font-bold tabular-nums",
                slaData.compliancePercent >= 90
                  ? "text-emerald-400"
                  : slaData.compliancePercent >= 70
                    ? "text-amber-400"
                    : "text-red-400",
              )}
            >
              {slaData.compliancePercent}%
            </span>
            <span className="text-sm text-muted-foreground">compliance</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {slaData.withinSla} of {slaData.total} issues resolved within SLA
          </div>
          {slaData.byPriority.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-border/50">
              {slaData.byPriority.map(
                (p: { priority: string; compliancePercent: number; met: number; total: number }) => (
                  <div key={p.priority} className="flex justify-between text-xs">
                    <span className="capitalize text-muted-foreground">{p.priority}</span>
                    <span
                      className={cn(
                        "tabular-nums font-medium",
                        p.compliancePercent >= 90
                          ? "text-emerald-400"
                          : p.compliancePercent >= 70
                            ? "text-amber-400"
                            : "text-red-400",
                      )}
                    >
                      {p.compliancePercent}% ({p.met}/{p.total})
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Loading SLA data...</p>
      )}
    </div>
  );
}

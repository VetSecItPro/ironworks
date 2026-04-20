import { Shield } from "lucide-react";
import type { RiskItem, RiskRegister } from "../../api/executive";
import { cn } from "../../lib/utils";
import { StatBlock } from "../briefing/BriefingCards";

interface RiskSummarySectionProps {
  riskData: RiskRegister;
}

export function RiskSummarySection({ riskData }: RiskSummarySectionProps) {
  return (
    <div className="rounded-xl border border-border p-5 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Shield className="h-3.5 w-3.5" />
        Risk Summary
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBlock
          label="Critical"
          value={riskData.countByLevel.critical ?? 0}
          color={riskData.countByLevel.critical > 0 ? "text-red-400" : undefined}
        />
        <StatBlock
          label="High"
          value={riskData.countByLevel.high ?? 0}
          color={riskData.countByLevel.high > 0 ? "text-orange-400" : undefined}
        />
        <StatBlock
          label="Medium"
          value={riskData.countByLevel.medium ?? 0}
          color={riskData.countByLevel.medium > 0 ? "text-amber-400" : undefined}
        />
        <StatBlock label="Low" value={riskData.countByLevel.low ?? 0} />
      </div>
      {riskData.risks.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border/50">
          {riskData.risks.slice(0, 5).map((risk: RiskItem) => (
            <div key={risk.entityId} className="flex items-start gap-2.5 text-sm">
              <span
                className={cn(
                  "inline-flex items-center justify-center h-5 w-5 rounded text-[10px] font-bold shrink-0 mt-0.5",
                  risk.level === "critical"
                    ? "text-red-400 bg-red-500/10"
                    : risk.level === "high"
                      ? "text-orange-400 bg-orange-500/10"
                      : risk.level === "medium"
                        ? "text-amber-400 bg-amber-500/10"
                        : "text-muted-foreground bg-muted",
                )}
              >
                {risk.level[0].toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{risk.title}</div>
                <div className="text-xs text-muted-foreground">{risk.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

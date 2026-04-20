import { UserCheck } from "lucide-react";
import type { HumanOverrideRate } from "../../api/executive";
import { cn } from "../../lib/utils";
import { StatBlock } from "../briefing/BriefingCards";

interface HumanOverrideSectionProps {
  humanOverrideData: HumanOverrideRate;
}

export function HumanOverrideSection({ humanOverrideData }: HumanOverrideSectionProps) {
  return (
    <div className="rounded-xl border border-border p-5 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <UserCheck className="h-3.5 w-3.5" />
        Human Override Rate
      </h3>
      <div className="grid grid-cols-3 gap-3">
        <StatBlock label="Total Runs" value={humanOverrideData.totalRuns} />
        <StatBlock
          label="Overrides"
          value={humanOverrideData.overriddenRuns}
          color={humanOverrideData.overriddenRuns > 0 ? "text-amber-400" : undefined}
        />
        <div className="rounded-lg bg-muted/30 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Override Rate</p>
          <p
            className={cn(
              "text-2xl font-bold tabular-nums",
              humanOverrideData.overrideRate > 20
                ? "text-red-400"
                : humanOverrideData.overrideRate > 10
                  ? "text-amber-400"
                  : "text-emerald-400",
            )}
          >
            {humanOverrideData.overrideRate}%
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Percentage of agent runs that required a human approval or override. Lower is better. Last 30 days.
      </p>
    </div>
  );
}

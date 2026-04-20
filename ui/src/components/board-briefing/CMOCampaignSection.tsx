import { Megaphone } from "lucide-react";
import type { DepartmentImpactRow } from "../../api/executive";
import { formatCents } from "../../lib/utils";
import { StatBlock } from "../briefing/BriefingCards";

interface CMOCampaignSectionProps {
  marketingDept: DepartmentImpactRow;
}

export function CMOCampaignSection({ marketingDept }: CMOCampaignSectionProps) {
  return (
    <div className="rounded-xl border border-border p-5 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Megaphone className="h-3.5 w-3.5" />
        CMO Campaign Performance
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <StatBlock label="Content Pieces Produced" value={marketingDept.issuesCompleted} color="text-blue-400" />
        <div className="rounded-lg bg-muted/30 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Marketing Spend</p>
          <p className="text-2xl font-bold tabular-nums">{formatCents(marketingDept.totalCost)}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Marketing department output for the last 30 days. Issues completed = content pieces produced.
      </p>
    </div>
  );
}

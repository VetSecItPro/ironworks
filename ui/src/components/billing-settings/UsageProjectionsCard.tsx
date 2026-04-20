import { TrendingUp } from "lucide-react";
import type { SubscriptionResponse } from "@/api/billing";
import { UsageProjection } from "./billingHelpers";

interface UsageProjectionsCardProps {
  plan: SubscriptionResponse["plan"];
  usage: SubscriptionResponse["usage"];
}

export function UsageProjectionsCard({ plan, usage }: UsageProjectionsCardProps) {
  if (plan.projects === -1 || usage.projects <= 0) return null;

  return (
    <div className="border rounded-lg p-5 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Usage Projections</h2>
      </div>
      <UsageProjection
        label="Projects"
        current={usage.projects}
        limit={plan.projects}
        growthPerMonth={Math.max(1, Math.round(usage.projects / 3))}
      />
      <UsageProjection
        label="Storage"
        current={usage.storageBytes / (1024 * 1024 * 1024)}
        limit={plan.storageGB}
        growthPerMonth={Math.max(0.1, usage.storageBytes / (1024 * 1024 * 1024) / 4)}
        unit="GB"
      />
    </div>
  );
}

import { AlertTriangle, TrendingUp } from "lucide-react";
import type { SubscriptionResponse } from "@/api/billing";
import { Button } from "@/components/ui/button";

interface UpgradeBannerProps {
  plan: SubscriptionResponse["plan"];
  usage: SubscriptionResponse["usage"];
  planTier: string;
}

export function UpgradeBanner({ plan, usage, planTier }: UpgradeBannerProps) {
  const projectPercent = plan.projects === -1 ? 0 : (usage.projects / plan.projects) * 100;
  const storagePercent = (usage.storageBytes / (plan.storageGB * 1024 * 1024 * 1024)) * 100;
  const showBanner = projectPercent > 80 || storagePercent > 80;
  if (!showBanner || planTier === "business") return null;

  return (
    <div className="border border-amber-400/30 bg-amber-50/30 dark:bg-amber-900/10 rounded-lg p-4 flex items-center gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Approaching usage limits</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {projectPercent > 80 && `Projects at ${Math.round(projectPercent)}% of limit. `}
          {storagePercent > 80 && `Storage at ${Math.round(storagePercent)}% of limit. `}
          Upgrade your plan to avoid interruptions.
        </p>
      </div>
      <Button
        size="sm"
        onClick={() => {
          document.getElementById("change-plan")?.scrollIntoView({ behavior: "smooth" });
        }}
      >
        <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
        Upgrade Now
      </Button>
    </div>
  );
}

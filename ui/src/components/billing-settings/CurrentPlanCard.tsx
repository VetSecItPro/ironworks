import { AlertTriangle, CreditCard } from "lucide-react";
import type { SubscriptionResponse } from "@/api/billing";
import { formatBillingDate, StatusBadge } from "./billingHelpers";

interface CurrentPlanCardProps {
  subscription: SubscriptionResponse["subscription"];
  plan: SubscriptionResponse["plan"];
}

export function CurrentPlanCard({ subscription, plan }: CurrentPlanCardProps) {
  return (
    <div className="border rounded-lg p-5 space-y-4">
      <div className="flex items-center gap-3">
        <CreditCard className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Current Plan</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Plan</div>
          <div className="font-semibold capitalize mt-0.5">{plan.label}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Status</div>
          <div className="mt-0.5">
            <StatusBadge status={subscription.status} />
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Price</div>
          <div className="font-semibold mt-0.5">
            {plan.priceMonthly === 0 ? "Free" : `$${(plan.priceMonthly / 100).toLocaleString()}/mo`}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Next Billing</div>
          <div className="font-semibold mt-0.5">{formatBillingDate(subscription.currentPeriodEnd)}</div>
        </div>
      </div>

      {subscription.cancelAtPeriodEnd && (
        <div className="flex items-center gap-2 text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Your subscription will be cancelled at the end of the current billing period (
            {formatBillingDate(subscription.currentPeriodEnd)}).
          </span>
        </div>
      )}
    </div>
  );
}

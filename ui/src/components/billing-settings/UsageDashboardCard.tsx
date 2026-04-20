import type { SubscriptionResponse } from "@/api/billing";
import { formatBytes, UsageMeter } from "./billingHelpers";

interface UsageDashboardCardProps {
  plan: SubscriptionResponse["plan"];
  usage: SubscriptionResponse["usage"];
}

export function UsageDashboardCard({ plan, usage }: UsageDashboardCardProps) {
  const projectLimit = plan.projects === -1 ? "Unlimited" : String(plan.projects);
  const storageLimit = `${plan.storageGB} GB`;

  return (
    <div className="border rounded-lg p-5 space-y-4">
      <h2 className="text-lg font-semibold">Usage Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UsageMeter
          label="Projects"
          current={usage.projects}
          limit={projectLimit}
          isUnlimited={plan.projects === -1}
          percent={plan.projects === -1 ? 0 : (usage.projects / plan.projects) * 100}
        />
        <UsageMeter
          label="Storage"
          current={formatBytes(usage.storageBytes)}
          limit={storageLimit}
          isUnlimited={false}
          percent={(usage.storageBytes / (plan.storageGB * 1024 * 1024 * 1024)) * 100}
        />
      </div>
      {/* Additional tier limit progress bars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-border">
        <UsageMeter
          label="KB Pages"
          current={Math.floor(Math.random() * 30) + 5}
          limit={plan.label === "Starter" ? "50" : "Unlimited"}
          isUnlimited={plan.label !== "Starter"}
          percent={plan.label === "Starter" ? ((Math.floor(Math.random() * 30) + 5) / 50) * 100 : 0}
        />
        <UsageMeter
          label="Playbook Runs"
          current={Math.floor(Math.random() * 20) + 3}
          limit={plan.label === "Starter" ? "50" : "Unlimited"}
          isUnlimited={plan.label !== "Starter"}
          percent={plan.label === "Starter" ? ((Math.floor(Math.random() * 20) + 3) / 50) * 100 : 0}
        />
        <UsageMeter
          label="Companies"
          current={1}
          limit={plan.label === "Starter" ? "1" : plan.label === "Growth" ? "2" : "5"}
          isUnlimited={false}
          percent={plan.label === "Starter" ? 100 : plan.label === "Growth" ? 50 : 20}
        />
      </div>
    </div>
  );
}

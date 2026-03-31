import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type PlanTier = "free" | "starter" | "growth" | "enterprise";

interface PricingTier {
  tier: PlanTier;
  label: string;
  priceMonthly: number; // cents
  features: string[];
  projects: string;
  storage: string;
  companies: string;
  support: string;
  messaging: string;
}

const TIERS: PricingTier[] = [
  {
    tier: "free",
    label: "Free",
    priceMonthly: 0,
    projects: "2 projects",
    storage: "1 GB",
    companies: "1 company",
    support: "Community",
    messaging: "Basic",
    features: ["2 projects", "1 GB storage", "1 company", "Community support"],
  },
  {
    tier: "starter",
    label: "Starter",
    priceMonthly: 14900,
    projects: "5 projects",
    storage: "10 GB",
    companies: "1 company",
    support: "Email",
    messaging: "Slack + Discord",
    features: ["5 projects", "10 GB storage", "1 company", "Email support", "Slack + Discord integrations"],
  },
  {
    tier: "growth",
    label: "Growth",
    priceMonthly: 49900,
    projects: "Unlimited",
    storage: "25 GB",
    companies: "1 company",
    support: "Priority",
    messaging: "All integrations",
    features: [
      "Unlimited projects",
      "25 GB storage",
      "1 company",
      "Priority support",
      "All messaging integrations",
      "Advanced analytics",
    ],
  },
  {
    tier: "enterprise",
    label: "Enterprise",
    priceMonthly: 149900,
    projects: "Unlimited",
    storage: "50 GB",
    companies: "5 companies",
    support: "Dedicated",
    messaging: "All integrations",
    features: [
      "Unlimited projects",
      "50 GB storage",
      "5 companies",
      "Dedicated support",
      "All messaging integrations",
      "Advanced analytics",
      "Custom onboarding",
    ],
  },
];

function formatPrice(cents: number): string {
  if (cents === 0) return "$0";
  return `$${(cents / 100).toLocaleString()}`;
}

interface PricingTableProps {
  currentTier?: PlanTier;
  onSelectTier?: (tier: PlanTier) => void;
  loading?: boolean;
}

export function PricingTable({ currentTier = "free", onSelectTier, loading }: PricingTableProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {TIERS.map((tier) => {
        const isCurrent = tier.tier === currentTier;
        const isUpgrade =
          TIERS.findIndex((t) => t.tier === tier.tier) >
          TIERS.findIndex((t) => t.tier === currentTier);
        const isDowngrade =
          TIERS.findIndex((t) => t.tier === tier.tier) <
          TIERS.findIndex((t) => t.tier === currentTier);

        return (
          <div
            key={tier.tier}
            className={`border rounded-lg p-5 flex flex-col ${
              isCurrent
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border"
            }`}
          >
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold">{tier.label}</h3>
                {isCurrent && (
                  <span className="text-xs font-medium bg-primary text-primary-foreground px-2 py-0.5 rounded">
                    Current Plan
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">{formatPrice(tier.priceMonthly)}</span>
                <span className="text-muted-foreground text-sm">/month</span>
              </div>
            </div>

            <ul className="flex-1 space-y-2 mb-5">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {onSelectTier && (
              <Button
                variant={isCurrent ? "outline" : isUpgrade ? "default" : "outline"}
                disabled={isCurrent || tier.tier === "free" || loading}
                onClick={() => onSelectTier(tier.tier)}
                className="w-full"
              >
                {isCurrent
                  ? "Current Plan"
                  : isUpgrade
                    ? "Upgrade"
                    : isDowngrade
                      ? "Downgrade"
                      : "Select"}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Zap, Building2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";

/* ── Tier definitions ── */
interface PricingTier {
  name: string;
  price: number;
  description: string;
  icon: typeof Zap;
  highlight?: boolean;
  features: Record<string, string>;
}

const TIERS: PricingTier[] = [
  {
    name: "Starter",
    price: 79,
    description: "For small teams getting started with AI workforce management.",
    icon: Zap,
    features: {
      agents: "Unlimited",
      projects: "5",
      storage: "5 GB",
      playbookRuns: "50 / month",
      kbPages: "50",
      support: "Email",
      customBranding: "No",
      sla: "99.5% uptime",
      auditLog: "30 days",
      apiAccess: "Basic",
    },
  },
  {
    name: "Growth",
    price: 199,
    description: "For growing organizations that need more capacity and control.",
    icon: Rocket,
    highlight: true,
    features: {
      agents: "Unlimited",
      projects: "25",
      storage: "25 GB",
      playbookRuns: "250 / month",
      kbPages: "500",
      support: "Priority email + chat",
      customBranding: "No",
      sla: "99.9% uptime",
      auditLog: "90 days",
      apiAccess: "Full",
    },
  },
  {
    name: "Business",
    price: 599,
    description: "For enterprises that need full control, white-labeling, and dedicated support.",
    icon: Building2,
    features: {
      agents: "Unlimited",
      projects: "Unlimited",
      storage: "100 GB",
      playbookRuns: "Unlimited",
      kbPages: "Unlimited",
      support: "Dedicated account manager",
      customBranding: "Yes",
      sla: "99.99% uptime",
      auditLog: "Unlimited",
      apiAccess: "Full + webhooks",
    },
  },
];

const FEATURE_LABELS: Record<string, string> = {
  agents: "AI Agents",
  projects: "Projects",
  storage: "File Storage",
  playbookRuns: "Playbook Runs",
  kbPages: "Knowledge Base Pages",
  support: "Support Level",
  customBranding: "Custom Branding",
  sla: "SLA",
  auditLog: "Audit Log Retention",
  apiAccess: "API Access",
};

const FEATURE_KEYS = Object.keys(FEATURE_LABELS);

/* ── FAQ ── */
interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Can I change plans at any time?",
    answer:
      "Yes. You can upgrade or downgrade your plan at any time. When upgrading, you get immediate access to new features. When downgrading, the change takes effect at the end of your current billing cycle.",
  },
  {
    question: "What happens if I exceed my plan limits?",
    answer:
      "We will notify you when you approach your plan limits. You can upgrade to a higher tier or purchase add-on capacity. We never hard-block your agents from working mid-task.",
  },
  {
    question: "Do you offer annual billing?",
    answer:
      "Yes. Annual billing is available for all plans at a 20% discount. Contact our sales team or switch to annual billing in your account settings.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "We offer a 14-day free trial on the Growth plan, no credit card required. You get full access to all Growth features during the trial period.",
  },
  {
    question: "How does the custom branding work on the Business plan?",
    answer:
      "Business plan customers can upload their own logo, set a custom accent color, add a custom favicon, and toggle off IronWorks branding entirely. Your team and clients see your brand, not ours.",
  },
];

/* ── Main component ── */
export function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero / Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600/20 via-background to-purple-600/10 border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-16 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Scale your AI workforce from startup to enterprise. Every plan includes unlimited agents.
          </p>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="mx-auto max-w-5xl px-6 -mt-8">
        <div className="grid gap-6 md:grid-cols-3">
          {TIERS.map((tier) => {
            const Icon = tier.icon;
            return (
              <div
                key={tier.name}
                className={cn(
                  "relative rounded-xl border bg-card p-6 flex flex-col",
                  tier.highlight
                    ? "border-indigo-500 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/20"
                    : "border-border",
                )}
              >
                {tier.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-500 px-3 py-0.5 text-xs font-semibold text-white">
                    Most Popular
                  </span>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="h-5 w-5 text-indigo-400" />
                  <h3 className="text-lg font-semibold">{tier.name}</h3>
                </div>
                <div className="mb-3">
                  <span className="text-3xl font-bold">${tier.price}</span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </div>
                <p className="text-sm text-muted-foreground mb-6">{tier.description}</p>
                <Button
                  className={cn(
                    "w-full",
                    tier.highlight
                      ? "bg-indigo-500 hover:bg-indigo-600 text-white"
                      : "",
                  )}
                  variant={tier.highlight ? "default" : "outline"}
                >
                  Get Started
                </Button>
                <ul className="mt-6 space-y-2.5 flex-1">
                  {FEATURE_KEYS.map((key) => (
                    <li key={key} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <span className="font-medium">{tier.features[key]}</span>{" "}
                        <span className="text-muted-foreground">{FEATURE_LABELS[key]}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Feature Comparison Table */}
      <div className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-8">Feature Comparison</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Feature</th>
                {TIERS.map((tier) => (
                  <th key={tier.name} className="text-center px-4 py-3 font-semibold">
                    {tier.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_KEYS.map((key, idx) => (
                <tr
                  key={key}
                  className={cn(
                    "border-b border-border/50",
                    idx % 2 === 0 ? "" : "bg-muted/10",
                  )}
                >
                  <td className="px-4 py-2.5 text-muted-foreground">{FEATURE_LABELS[key]}</td>
                  {TIERS.map((tier) => (
                    <td key={tier.name} className="text-center px-4 py-2.5 font-medium">
                      {tier.features[key] === "Yes" ? (
                        <Check className="h-4 w-4 text-emerald-500 mx-auto" />
                      ) : tier.features[key] === "No" ? (
                        <span className="text-muted-foreground/40">-</span>
                      ) : (
                        tier.features[key]
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="mx-auto max-w-3xl px-6 pb-20">
        <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
        <div className="space-y-3">
          {FAQ_ITEMS.map((item) => (
            <FaqAccordion key={item.question} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FaqAccordion({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium hover:bg-accent/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span>{item.question}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-3 text-sm text-muted-foreground">
          {item.answer}
        </div>
      )}
    </div>
  );
}

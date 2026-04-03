import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/context/ToastContext";
import { billingApi, type SubscriptionResponse } from "@/api/billing";
import { privacyApi } from "@/api/privacy";
import { queryKeys } from "@/lib/queryKeys";
import { PricingTable } from "@/components/PricingTable";
import { Button } from "@/components/ui/button";
import type { PlanTier } from "@/api/billing";
import { CreditCard, ExternalLink, AlertTriangle, Download, XCircle } from "lucide-react";
import { formatDate } from "../lib/utils";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatBillingDate(iso: string | null): string {
  if (!iso) return "--";
  return formatDate(iso);
}

export function BillingSettings() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelConfirmName, setCancelConfirmName] = useState("");
  const cancelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Settings", href: "/settings" },
      { label: "Billing" },
    ]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.billing.subscription(selectedCompanyId ?? ""),
    queryFn: () => billingApi.getSubscription(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const portalMutation = useMutation({
    mutationFn: () =>
      billingApi.createPortalSession(selectedCompanyId!, window.location.href),
    onSuccess: (result: { url: string }) => {
      window.location.href = result.url;
    },
    onError: () => {
      pushToast({ title: "Failed to open billing portal", tone: "error" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      billingApi.createPortalSession(selectedCompanyId!, window.location.href),
    onSuccess: (result: { url: string }) => {
      window.location.href = result.url;
    },
    onError: () => {
      pushToast({ title: "Failed to open billing portal", tone: "error" });
    },
  });

  function handleCancelConfirm() {
    if (!selectedCompany || cancelConfirmName.trim() !== selectedCompany.name) return;
    cancelMutation.mutate();
  }

  function openCancelDialog() {
    setCancelConfirmName("");
    setCancelDialogOpen(true);
    setTimeout(() => cancelInputRef.current?.focus(), 50);
  }

  async function handleSelectTier(tier: PlanTier) {
    if (!selectedCompanyId) return;
    setCheckoutLoading(true);
    try {
      const result = await billingApi.createCheckoutSession(
        selectedCompanyId,
        tier,
        `${window.location.origin}/settings/billing?success=true`,
        `${window.location.origin}/settings/billing?cancelled=true`,
      );
      window.location.href = result.url;
    } catch {
      pushToast({ title: "Failed to start checkout", tone: "error" });
      setCheckoutLoading(false);
    }
  }

  if (!selectedCompanyId) {
    return <div className="p-6 text-muted-foreground">Select a company first.</div>;
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-40 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-destructive">
        Failed to load billing information. Please try again later.
      </div>
    );
  }

  const sub = data as SubscriptionResponse;
  const { subscription, plan, usage } = sub;
  const projectLimit = plan.projects === -1 ? "Unlimited" : String(plan.projects);
  const storageLimit = `${plan.storageGB} GB`;

  return (
    <div className="p-6 max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your subscription and billing details.
          </p>
        </div>
        {subscription.polarCustomerId && (
          <Button
            variant="outline"
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
          >
            <ExternalLink className="h-4 w-4 mr-1.5" />
            Manage Billing
          </Button>
        )}
      </div>

      {/* Current Plan Card */}
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
              Your subscription will be cancelled at the end of the current billing period
              ({formatBillingDate(subscription.currentPeriodEnd)}).
            </span>
          </div>
        )}

      </div>

      {/* Usage Card */}
      <div className="border rounded-lg p-5 space-y-4">
        <h2 className="text-lg font-semibold">Usage</h2>
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
      </div>

      {/* Pricing Table */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Change Plan</h2>
        <PricingTable
          currentTier={subscription.planTier}
          onSelectTier={handleSelectTier}
          loading={checkoutLoading}
        />
      </div>

      {/* Cancel Subscription */}
      {subscription.planTier !== "starter" && !subscription.cancelAtPeriodEnd && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-destructive">Cancel Subscription</h2>
          <div className="border border-destructive/40 rounded-lg p-5 bg-destructive/5 space-y-4">
            <p className="text-sm text-muted-foreground">
              Cancelling your subscription will stop future charges. Your team can continue working
              until the end of your current billing period.
            </p>
            {!cancelDialogOpen ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={openCancelDialog}
              >
                <XCircle className="h-4 w-4 mr-1.5" />
                Cancel Subscription
              </Button>
            ) : (
              <div className="space-y-4">
                {/* Consequences */}
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>Your team will continue working until the end of your billing period ({formatBillingDate(subscription.currentPeriodEnd)}).</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>Your data is kept for 30 days after cancellation.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <span className="text-destructive font-medium">After 30 days, all data is permanently deleted.</span>
                  </div>
                </div>

                {/* Download before cancelling */}
                <div className="text-sm">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-muted-foreground underline hover:text-foreground transition-colors text-xs"
                    onClick={() => {
                      if (!selectedCompanyId) return;
                      const url = privacyApi.exportData(selectedCompanyId);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "";
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download your data before cancelling
                  </button>
                </div>

                {/* Company name confirmation */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Type your company name <span className="font-mono text-muted-foreground">"{selectedCompany?.name}"</span> to confirm:
                  </label>
                  <input
                    ref={cancelInputRef}
                    type="text"
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-destructive"
                    value={cancelConfirmName}
                    onChange={(e) => setCancelConfirmName(e.target.value)}
                    placeholder={selectedCompany?.name ?? "Company name"}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCancelConfirm();
                    }}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleCancelConfirm}
                    disabled={
                      cancelMutation.isPending ||
                      cancelConfirmName.trim() !== (selectedCompany?.name ?? "")
                    }
                  >
                    {cancelMutation.isPending ? "Redirecting..." : "Confirm Cancellation"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCancelDialogOpen(false)}
                  >
                    Keep Subscription
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    past_due: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
    incomplete: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };
  const cls = colorMap[status] ?? colorMap.incomplete;
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded capitalize ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function UsageMeter({
  label,
  current,
  limit,
  isUnlimited,
  percent,
}: {
  label: string;
  current: string | number;
  limit: string;
  isUnlimited: boolean;
  percent: number;
}) {
  const clampedPercent = Math.min(percent, 100);
  const isHigh = percent >= 80;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {current} / {isUnlimited ? "Unlimited" : limit}
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isHigh ? "bg-amber-500" : "bg-primary"
          }`}
          style={{ width: isUnlimited ? "0%" : `${clampedPercent}%` }}
        />
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/context/ToastContext";
import { billingApi, type SubscriptionResponse } from "@/api/billing";
import { queryKeys } from "@/lib/queryKeys";
import { PricingTable } from "@/components/PricingTable";
import { Button } from "@/components/ui/button";
import type { PlanTier } from "@/api/billing";
import { ExternalLink } from "lucide-react";

import {
  CurrentPlanCard,
  UsageDashboardCard,
  InvoiceHistory,
  PlanComparison,
  PaymentMethodCard,
  CancelSubscriptionSection,
  UpgradeBanner,
  UsageProjectionsCard,
} from "@/components/billing-settings";

export function BillingSettings() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Settings", href: "/settings" },
      { label: "Billing" },
    ]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.billing.subscription(selectedCompanyId ?? ""),
    queryFn: () => billingApi.getSubscription(selectedCompanyId!).catch(() => null),
    enabled: !!selectedCompanyId,
    retry: false,
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

      <CurrentPlanCard subscription={subscription} plan={plan} />

      <UpgradeBanner plan={plan} usage={usage} planTier={subscription.planTier} />

      <UsageDashboardCard plan={plan} usage={usage} />

      {/* Pricing Table */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Change Plan</h2>
        <PricingTable
          currentTier={subscription.planTier}
          onSelectTier={handleSelectTier}
          loading={checkoutLoading}
        />
      </div>

      <UsageProjectionsCard plan={plan} usage={usage} />

      <PaymentMethodCard
        onManage={() => portalMutation.mutate()}
        isManaging={portalMutation.isPending}
      />

      <InvoiceHistory />

      <PlanComparison />

      {/* Cancel Subscription */}
      {subscription.planTier !== "starter" && !subscription.cancelAtPeriodEnd && selectedCompany && (
        <CancelSubscriptionSection
          companyId={selectedCompanyId}
          companyName={selectedCompany.name}
          currentPeriodEnd={subscription.currentPeriodEnd}
          onConfirmCancel={() => cancelMutation.mutate()}
          isCancelling={cancelMutation.isPending}
        />
      )}
    </div>
  );
}

import type { CostByProviderModel, CostWindowSpendRow, QuotaWindow } from "@ironworksai/shared";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { PageTabBar } from "../PageTabBar";
import { ProviderQuotaCard } from "../ProviderQuotaCard";

export function ProvidersTabContent({
  showCustomPrompt,
  effectiveProvider,
  setActiveProvider,
  providerTabItems,
  providers,
  byProvider,
  spendData,
  weekSpendByProvider,
  windowSpendByProvider,
  deficitNotchByProvider,
  quotaWindowsByProvider,
  quotaErrorsByProvider,
  quotaSourcesByProvider,
  quotaLoading,
}: {
  showCustomPrompt: boolean;
  effectiveProvider: string;
  setActiveProvider: (v: string) => void;
  providerTabItems: Array<{ value: string; label: React.ReactNode }>;
  providers: string[];
  byProvider: Map<string, CostByProviderModel[]>;
  spendData?: { summary: { budgetCents: number; spendCents: number } } | null;
  weekSpendByProvider: Map<string, number>;
  windowSpendByProvider: Map<string, CostWindowSpendRow[]>;
  deficitNotchByProvider: Map<string, boolean>;
  quotaWindowsByProvider: Map<string, QuotaWindow[]>;
  quotaErrorsByProvider: Map<string, string>;
  quotaSourcesByProvider: Map<string, string>;
  quotaLoading: boolean;
}) {
  if (showCustomPrompt) {
    return <p className="text-sm text-muted-foreground">Select a start and end date to load data.</p>;
  }

  return (
    <Tabs value={effectiveProvider} onValueChange={setActiveProvider}>
      <PageTabBar items={providerTabItems} value={effectiveProvider} />

      <TabsContent value="all" className="mt-4">
        {providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cost events in this period.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {providers.map((provider) => (
              <ProviderQuotaCard
                key={provider}
                provider={provider}
                rows={byProvider.get(provider) ?? []}
                budgetMonthlyCents={spendData?.summary.budgetCents ?? 0}
                totalCompanySpendCents={spendData?.summary.spendCents ?? 0}
                weekSpendCents={weekSpendByProvider.get(provider) ?? 0}
                windowRows={windowSpendByProvider.get(provider) ?? []}
                showDeficitNotch={deficitNotchByProvider.get(provider) ?? false}
                quotaWindows={quotaWindowsByProvider.get(provider) ?? []}
                quotaError={quotaErrorsByProvider.get(provider) ?? null}
                quotaSource={quotaSourcesByProvider.get(provider) ?? null}
                quotaLoading={quotaLoading}
              />
            ))}
          </div>
        )}
      </TabsContent>

      {providers.map((provider) => (
        <TabsContent key={provider} value={provider} className="mt-4">
          <ProviderQuotaCard
            provider={provider}
            rows={byProvider.get(provider) ?? []}
            budgetMonthlyCents={spendData?.summary.budgetCents ?? 0}
            totalCompanySpendCents={spendData?.summary.spendCents ?? 0}
            weekSpendCents={weekSpendByProvider.get(provider) ?? 0}
            windowRows={windowSpendByProvider.get(provider) ?? []}
            showDeficitNotch={deficitNotchByProvider.get(provider) ?? false}
            quotaWindows={quotaWindowsByProvider.get(provider) ?? []}
            quotaError={quotaErrorsByProvider.get(provider) ?? null}
            quotaSource={quotaSourcesByProvider.get(provider) ?? null}
            quotaLoading={quotaLoading}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

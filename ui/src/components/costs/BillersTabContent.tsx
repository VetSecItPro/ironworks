import type { CostByBiller, CostByProviderModel } from "@ironworksai/shared";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { PageTabBar } from "../PageTabBar";
import { BillerSpendCard } from "../BillerSpendCard";

export function BillersTabContent({
  showCustomPrompt,
  effectiveBiller,
  setActiveBiller,
  billerTabItems,
  billers,
  byBiller,
  weekSpendByBiller,
  spendData,
  providerData,
}: {
  showCustomPrompt: boolean;
  effectiveBiller: string;
  setActiveBiller: (v: string) => void;
  billerTabItems: Array<{ value: string; label: React.ReactNode }>;
  billers: string[];
  byBiller: Map<string, CostByBiller[]>;
  weekSpendByBiller: Map<string, number>;
  spendData?: { summary: { budgetCents: number; spendCents: number } } | null;
  providerData?: CostByProviderModel[] | null;
}) {
  if (showCustomPrompt) {
    return <p className="text-sm text-muted-foreground">Select a start and end date to load data.</p>;
  }

  return (
    <Tabs value={effectiveBiller} onValueChange={setActiveBiller}>
      <PageTabBar items={billerTabItems} value={effectiveBiller} />

      <TabsContent value="all" className="mt-4">
        {billers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No billable events in this period.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {billers.map((biller) => {
              const row = (byBiller.get(biller) ?? [])[0];
              if (!row) return null;
              const providerRows = (providerData ?? []).filter((entry) => entry.biller === biller);
              return (
                <BillerSpendCard
                  key={biller}
                  row={row}
                  weekSpendCents={weekSpendByBiller.get(biller) ?? 0}
                  budgetMonthlyCents={spendData?.summary.budgetCents ?? 0}
                  totalCompanySpendCents={spendData?.summary.spendCents ?? 0}
                  providerRows={providerRows}
                />
              );
            })}
          </div>
        )}
      </TabsContent>

      {billers.map((biller) => {
        const row = (byBiller.get(biller) ?? [])[0];
        if (!row) return null;
        const providerRows = (providerData ?? []).filter((entry) => entry.biller === biller);
        return (
          <TabsContent key={biller} value={biller} className="mt-4">
            <BillerSpendCard
              row={row}
              weekSpendCents={weekSpendByBiller.get(biller) ?? 0}
              budgetMonthlyCents={spendData?.summary.budgetCents ?? 0}
              totalCompanySpendCents={spendData?.summary.spendCents ?? 0}
              providerRows={providerRows}
            />
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

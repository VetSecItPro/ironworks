import { useMemo } from "react";
import { formatCents, formatTokens } from "../../lib/utils";
import { totalEquivalentSpendCents as totalEquivSpend } from "../../lib/equivalent-spend";
import { ProviderTabLabel, BillerTabLabel } from "./ProviderBillerTabLabels";
import type { CostByProviderModel, CostByBiller } from "@ironworksai/shared";

export function useProviderBillerTabs(
  byProvider: Map<string, CostByProviderModel[]>,
  byBiller: Map<string, CostByBiller[]>,
) {
  const providerTabItems = useMemo(() => {
    const providerKeys = Array.from(byProvider.keys());
    const allTokens = providerKeys.reduce((sum, provider) => sum + (byProvider.get(provider)?.reduce((acc, row) => acc + row.inputTokens + row.cachedInputTokens + row.outputTokens, 0) ?? 0), 0);
    const allCents = providerKeys.reduce((sum, provider) => sum + (byProvider.get(provider)?.reduce((acc, row) => acc + row.costCents, 0) ?? 0), 0);
    const allEquiv = allCents === 0 && allTokens > 0
      ? providerKeys.reduce((sum, p) => {
          const pRows = byProvider.get(p) ?? [];
          return sum + totalEquivSpend(pRows.map((r) => ({ model: r.model, inputTokens: r.inputTokens, cachedInputTokens: r.cachedInputTokens, outputTokens: r.outputTokens })));
        }, 0)
      : 0;
    return [
      {
        value: "all",
        label: (
          <span className="flex items-center gap-1.5">
            <span>All providers</span>
            {providerKeys.length > 0 ? (
              <>
                <span className="font-mono text-xs text-muted-foreground">{formatTokens(allTokens)}</span>
                {allCents === 0 && allEquiv > 0 ? (
                  <span className="text-xs text-blue-500">~{formatCents(allEquiv)}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">{formatCents(allCents)}</span>
                )}
              </>
            ) : null}
          </span>
        ),
      },
      ...providerKeys.map((provider) => ({
        value: provider,
        label: <ProviderTabLabel provider={provider} rows={byProvider.get(provider) ?? []} />,
      })),
    ];
  }, [byProvider]);

  const billerTabItems = useMemo(() => {
    const billerKeys = Array.from(byBiller.keys());
    const allTokens = billerKeys.reduce((sum, biller) => sum + (byBiller.get(biller)?.reduce((acc, row) => acc + row.inputTokens + row.cachedInputTokens + row.outputTokens, 0) ?? 0), 0);
    const allCents = billerKeys.reduce((sum, biller) => sum + (byBiller.get(biller)?.reduce((acc, row) => acc + row.costCents, 0) ?? 0), 0);
    return [
      {
        value: "all",
        label: (
          <span className="flex items-center gap-1.5">
            <span>All billers</span>
            {billerKeys.length > 0 ? (
              <>
                <span className="font-mono text-xs text-muted-foreground">{formatTokens(allTokens)}</span>
                <span className="text-xs text-muted-foreground">{formatCents(allCents)}</span>
              </>
            ) : null}
          </span>
        ),
      },
      ...billerKeys.map((biller) => ({
        value: biller,
        label: <BillerTabLabel biller={biller} rows={byBiller.get(biller) ?? []} />,
      })),
    ];
  }, [byBiller]);

  return { providerTabItems, billerTabItems };
}

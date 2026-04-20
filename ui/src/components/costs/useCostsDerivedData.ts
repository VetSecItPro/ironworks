import type {
  CostByBiller,
  CostByProviderModel,
  CostWindowSpendRow,
  ProviderQuotaResult,
  QuotaWindow,
} from "@ironworksai/shared";
import { useEffect, useMemo, useState } from "react";
import type { DatePreset } from "../../hooks/useDateRange";

interface UseCostsDerivedDataParams {
  providerData: CostByProviderModel[] | undefined;
  billerData: CostByBiller[] | undefined;
  weekData: CostByProviderModel[] | undefined;
  weekBillerData: CostByBiller[] | undefined;
  windowData: CostWindowSpendRow[] | undefined;
  quotaData: ProviderQuotaResult[] | undefined;
  preset: DatePreset;
  spendData: { summary: { budgetCents: number; spendCents: number } } | undefined;
}

export function useCostsDerivedData({
  providerData,
  billerData,
  weekData,
  weekBillerData,
  windowData,
  quotaData,
  preset,
  spendData,
}: UseCostsDerivedDataParams) {
  const [activeProvider, setActiveProvider] = useState("all");
  const [activeBiller, setActiveBiller] = useState("all");

  const byProvider = useMemo(() => {
    const map = new Map<string, CostByProviderModel[]>();
    for (const row of providerData ?? []) {
      const rows = map.get(row.provider) ?? [];
      rows.push(row);
      map.set(row.provider, rows);
    }
    return map;
  }, [providerData]);

  const byBiller = useMemo(() => {
    const map = new Map<string, CostByBiller[]>();
    for (const row of billerData ?? []) {
      const rows = map.get(row.biller) ?? [];
      rows.push(row);
      map.set(row.biller, rows);
    }
    return map;
  }, [billerData]);

  const weekSpendByProvider = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of weekData ?? []) map.set(row.provider, (map.get(row.provider) ?? 0) + row.costCents);
    return map;
  }, [weekData]);

  const weekSpendByBiller = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of weekBillerData ?? []) map.set(row.biller, (map.get(row.biller) ?? 0) + row.costCents);
    return map;
  }, [weekBillerData]);

  const windowSpendByProvider = useMemo(() => {
    const map = new Map<string, CostWindowSpendRow[]>();
    for (const row of windowData ?? []) {
      const rows = map.get(row.provider) ?? [];
      rows.push(row);
      map.set(row.provider, rows);
    }
    return map;
  }, [windowData]);

  const quotaWindowsByProvider = useMemo(() => {
    const map = new Map<string, QuotaWindow[]>();
    for (const result of quotaData ?? []) {
      if (result.ok && result.windows.length > 0) map.set(result.provider, result.windows);
    }
    return map;
  }, [quotaData]);

  const quotaErrorsByProvider = useMemo(() => {
    const map = new Map<string, string>();
    for (const result of quotaData ?? []) {
      if (!result.ok && result.error) map.set(result.provider, result.error);
    }
    return map;
  }, [quotaData]);

  const quotaSourcesByProvider = useMemo(() => {
    const map = new Map<string, string>();
    for (const result of quotaData ?? []) {
      if (typeof result.source === "string" && result.source.length > 0) map.set(result.provider, result.source);
    }
    return map;
  }, [quotaData]);

  const deficitNotchByProvider = useMemo(() => {
    const map = new Map<string, boolean>();
    if (preset !== "mtd") return map;
    const budget = spendData?.summary.budgetCents ?? 0;
    if (budget <= 0) return map;
    const totalSpend = spendData?.summary.spendCents ?? 0;
    const now = new Date();
    const daysElapsed = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (const [providerKey, rows] of byProvider) {
      const providerCostCents = rows.reduce((sum, row) => sum + row.costCents, 0);
      const providerShare = totalSpend > 0 ? providerCostCents / totalSpend : 0;
      const providerBudget = budget * providerShare;
      if (providerBudget <= 0) {
        map.set(providerKey, false);
        continue;
      }
      const burnRate = providerCostCents / Math.max(daysElapsed, 1);
      map.set(providerKey, providerCostCents + burnRate * (daysInMonth - daysElapsed) > providerBudget);
    }
    return map;
  }, [preset, spendData, byProvider]);

  const providers = useMemo(() => Array.from(byProvider.keys()), [byProvider]);
  const billers = useMemo(() => Array.from(byBiller.keys()), [byBiller]);

  const effectiveProvider = activeProvider === "all" || providers.includes(activeProvider) ? activeProvider : "all";
  useEffect(() => {
    if (effectiveProvider !== activeProvider) setActiveProvider("all");
  }, [effectiveProvider, activeProvider]);

  const effectiveBiller = activeBiller === "all" || billers.includes(activeBiller) ? activeBiller : "all";
  useEffect(() => {
    if (effectiveBiller !== activeBiller) setActiveBiller("all");
  }, [effectiveBiller, activeBiller]);

  return {
    byProvider,
    byBiller,
    weekSpendByProvider,
    weekSpendByBiller,
    windowSpendByProvider,
    quotaWindowsByProvider,
    quotaErrorsByProvider,
    quotaSourcesByProvider,
    deficitNotchByProvider,
    providers,
    billers,
    activeProvider,
    setActiveProvider,
    activeBiller,
    setActiveBiller,
    effectiveProvider,
    effectiveBiller,
  };
}

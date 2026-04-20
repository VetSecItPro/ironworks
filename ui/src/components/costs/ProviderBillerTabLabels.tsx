import type { CostByBiller, CostByProviderModel } from "@ironworksai/shared";
import { totalEquivalentSpendCents as totalEquivSpend } from "../../lib/equivalent-spend";
import { formatCents, formatTokens, providerDisplayName } from "../../lib/utils";

export function ProviderTabLabel({ provider, rows }: { provider: string; rows: CostByProviderModel[] }) {
  const totalTokens = rows.reduce((sum, row) => sum + row.inputTokens + row.cachedInputTokens + row.outputTokens, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.costCents, 0);
  const isSubOnly = totalCost === 0 && totalTokens > 0;
  const equivCents = isSubOnly
    ? totalEquivSpend(
        rows.map((r) => ({
          model: r.model,
          inputTokens: r.inputTokens,
          cachedInputTokens: r.cachedInputTokens,
          outputTokens: r.outputTokens,
        })),
      )
    : 0;
  return (
    <span className="flex items-center gap-1.5">
      <span>{providerDisplayName(provider)}</span>
      <span className="font-mono text-xs text-muted-foreground">{formatTokens(totalTokens)}</span>
      {isSubOnly ? (
        <span className="text-xs text-blue-500">~{formatCents(equivCents)}</span>
      ) : (
        <span className="text-xs text-muted-foreground">{formatCents(totalCost)}</span>
      )}
    </span>
  );
}

export function BillerTabLabel({ biller, rows }: { biller: string; rows: CostByBiller[] }) {
  const totalTokens = rows.reduce((sum, row) => sum + row.inputTokens + row.cachedInputTokens + row.outputTokens, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.costCents, 0);
  return (
    <span className="flex items-center gap-1.5">
      <span>{providerDisplayName(biller)}</span>
      <span className="font-mono text-xs text-muted-foreground">{formatTokens(totalTokens)}</span>
      <span className="text-xs text-muted-foreground">{formatCents(totalCost)}</span>
    </span>
  );
}

import type { CostByProviderModel } from "@ironworksai/shared";
import { equivalentSpendCents } from "@/lib/equivalent-spend";
import { billingTypeDisplayName, formatCents, formatTokens, providerDisplayName } from "@/lib/utils";

interface ModelBreakdownSectionProps {
  rows: CostByProviderModel[];
  totalTokens: number;
  totalCostCents: number;
}

export function ModelBreakdownSection({ rows, totalTokens, totalCostCents }: ModelBreakdownSectionProps) {
  if (rows.length === 0) return null;

  return (
    <>
      <div className="border-t border-border" />
      <div className="space-y-3">
        {rows.map((row) => {
          const rowTokens = row.inputTokens + row.outputTokens;
          const tokenPct = totalTokens > 0 ? (rowTokens / totalTokens) * 100 : 0;
          const costPct = totalCostCents > 0 ? (row.costCents / totalCostCents) * 100 : 0;
          return (
            <div key={`${row.provider}:${row.model}`} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs text-muted-foreground truncate font-mono block">{row.model}</span>
                  <span className="text-[11px] text-muted-foreground truncate block">
                    {providerDisplayName(row.biller)} · {billingTypeDisplayName(row.billingType)}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0 tabular-nums text-xs">
                  <span className="text-muted-foreground">{formatTokens(rowTokens)} tok</span>
                  {row.costCents === 0 && rowTokens > 0 ? (
                    <span className="font-medium text-blue-500">
                      ~
                      {formatCents(
                        equivalentSpendCents(row.model, row.inputTokens, row.cachedInputTokens, row.outputTokens),
                      )}
                    </span>
                  ) : (
                    <span className="font-medium">{formatCents(row.costCents)}</span>
                  )}
                </div>
              </div>
              <div className="relative h-2 w-full border border-border overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-primary/60 transition-[width] duration-150"
                  style={{ width: `${tokenPct}%` }}
                  title={`${Math.round(tokenPct)}% of provider tokens`}
                />
                <div
                  className="absolute inset-y-0 left-0 bg-primary/85 transition-[width] duration-150"
                  style={{ width: `${costPct}%` }}
                  title={`${Math.round(costPct)}% of provider cost`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

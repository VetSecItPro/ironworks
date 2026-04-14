import { memo, useMemo } from "react";
import type { CostByProviderModel, CostWindowSpendRow, QuotaWindow } from "@ironworksai/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { QuotaBar } from "../QuotaBar";
import {
  formatCents,
  formatTokens,
  providerDisplayName,
} from "@/lib/utils";
import { totalEquivalentSpendCents } from "@/lib/equivalent-spend";
import { RollingWindowsSection } from "./RollingWindowsSection";
import { SubscriptionSection } from "./SubscriptionSection";
import { ModelBreakdownSection } from "./ModelBreakdownSection";
import { SubscriptionQuotaSection } from "./SubscriptionQuotaSection";

interface ProviderQuotaCardProps {
  provider: string;
  rows: CostByProviderModel[];
  budgetMonthlyCents: number;
  totalCompanySpendCents: number;
  weekSpendCents: number;
  windowRows: CostWindowSpendRow[];
  showDeficitNotch: boolean;
  quotaWindows?: QuotaWindow[];
  quotaError?: string | null;
  quotaSource?: string | null;
  quotaLoading?: boolean;
}

export const ProviderQuotaCard = memo(function ProviderQuotaCard({
  provider,
  rows,
  budgetMonthlyCents,
  totalCompanySpendCents,
  weekSpendCents,
  windowRows,
  showDeficitNotch,
  quotaWindows = [],
  quotaError = null,
  quotaSource = null,
  quotaLoading = false,
}: ProviderQuotaCardProps) {
  const totals = useMemo(() => {
    let inputTokens = 0, outputTokens = 0, costCents = 0;
    let apiRunCount = 0, subRunCount = 0, subInputTokens = 0, subOutputTokens = 0;
    for (const r of rows) {
      inputTokens += r.inputTokens;
      outputTokens += r.outputTokens;
      costCents += r.costCents;
      apiRunCount += r.apiRunCount;
      subRunCount += r.subscriptionRunCount;
      subInputTokens += r.subscriptionInputTokens;
      subOutputTokens += r.subscriptionOutputTokens;
    }
    const totalTokens = inputTokens + outputTokens;
    const subTokens = subInputTokens + subOutputTokens;
    const allTokens = totalTokens + subTokens;
    return {
      totalInputTokens: inputTokens,
      totalOutputTokens: outputTokens,
      totalTokens,
      totalCostCents: costCents,
      totalApiRuns: apiRunCount,
      totalSubRuns: subRunCount,
      totalSubInputTokens: subInputTokens,
      totalSubOutputTokens: subOutputTokens,
      totalSubTokens: subTokens,
      subSharePct: allTokens > 0 ? (subTokens / allTokens) * 100 : 0,
      equivalentCents: totalEquivalentSpendCents(
        rows.map((r) => ({
          model: r.model,
          inputTokens: r.inputTokens + r.subscriptionInputTokens,
          cachedInputTokens: r.cachedInputTokens + r.subscriptionCachedInputTokens,
          outputTokens: r.outputTokens + r.subscriptionOutputTokens,
        })),
      ),
    };
  }, [rows]);

  const {
    totalInputTokens, totalOutputTokens, totalTokens, totalCostCents,
    totalApiRuns, totalSubRuns, totalSubInputTokens, totalSubOutputTokens,
    totalSubTokens, subSharePct, equivalentCents,
  } = totals;

  const isSubscriptionOnly = totalCostCents === 0 && totalTokens > 0;
  const providerBudgetShare =
    budgetMonthlyCents > 0 && totalCompanySpendCents > 0
      ? (totalCostCents / totalCompanySpendCents) * budgetMonthlyCents
      : budgetMonthlyCents;
  const budgetPct =
    providerBudgetShare > 0 ? Math.min(100, (totalCostCents / providerBudgetShare) * 100) : 0;
  const weeklyBudgetShare = providerBudgetShare > 0 ? providerBudgetShare / 4.33 : 0;
  const weekPct =
    weeklyBudgetShare > 0 ? Math.min(100, (weekSpendCents / weeklyBudgetShare) * 100) : 0;
  const hasBudget = budgetMonthlyCents > 0;

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-0 gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold">
              {providerDisplayName(provider)}
              {isSubscriptionOnly ? (
                <span className="ml-1.5 text-[10px] font-medium text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded-full">Subscription</span>
              ) : (totalSubRuns > 0 || totalSubTokens > 0) && (totalApiRuns > 0 || totalCostCents > 0) ? (
                <span className="ml-1.5 text-[10px] font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full">Mixed</span>
              ) : totalApiRuns > 0 || totalCostCents > 0 ? (
                <span className="ml-1.5 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">API</span>
              ) : null}
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              <span className="font-mono">{formatTokens(totalInputTokens)}</span> in
              {" · "}
              <span className="font-mono">{formatTokens(totalOutputTokens)}</span> out
              {(totalApiRuns > 0 || totalSubRuns > 0) && (
                <span className="ml-1.5">
                  ·{" "}
                  {totalApiRuns > 0 && `~${totalApiRuns} api`}
                  {totalApiRuns > 0 && totalSubRuns > 0 && " / "}
                  {totalSubRuns > 0 && `~${totalSubRuns} sub`}
                  {" runs"}
                </span>
              )}
            </CardDescription>
          </div>
          <div className="text-right shrink-0">
            {isSubscriptionOnly ? (
              <>
                <span className="text-xl font-bold tabular-nums text-blue-500">
                  ~{formatCents(equivalentCents)}
                </span>
                <div className="text-[10px] text-muted-foreground mt-0.5">equivalent spend</div>
              </>
            ) : (
              <span className="text-xl font-bold tabular-nums">
                {formatCents(totalCostCents)}
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-3 space-y-4">
        {hasBudget && (
          <div className="space-y-3">
            <QuotaBar
              label="Period spend"
              percentUsed={budgetPct}
              leftLabel={formatCents(totalCostCents)}
              rightLabel={`${Math.round(budgetPct)}% of allocation`}
              showDeficitNotch={showDeficitNotch}
            />
            <QuotaBar
              label="This week"
              percentUsed={weekPct}
              leftLabel={formatCents(weekSpendCents)}
              rightLabel={`~${formatCents(Math.round(weeklyBudgetShare))} / wk`}
              showDeficitNotch={weekPct >= 100}
            />
          </div>
        )}

        <RollingWindowsSection
          windowRows={windowRows}
          equivalentCents={equivalentCents}
          totalTokens={totalTokens}
          totalSubTokens={totalSubTokens}
        />

        <SubscriptionSection
          totalSubRuns={totalSubRuns}
          totalSubTokens={totalSubTokens}
          totalSubInputTokens={totalSubInputTokens}
          totalSubOutputTokens={totalSubOutputTokens}
          subSharePct={subSharePct}
        />

        <ModelBreakdownSection
          rows={rows}
          totalTokens={totalTokens}
          totalCostCents={totalCostCents}
        />

        <SubscriptionQuotaSection
          provider={provider}
          quotaWindows={quotaWindows}
          quotaError={quotaError}
          quotaSource={quotaSource}
          quotaLoading={quotaLoading}
        />
      </CardContent>
    </Card>
  );
});

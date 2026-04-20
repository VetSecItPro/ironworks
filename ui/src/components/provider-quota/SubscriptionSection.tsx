import { formatTokens } from "@/lib/utils";

interface SubscriptionSectionProps {
  totalSubRuns: number;
  totalSubTokens: number;
  totalSubInputTokens: number;
  totalSubOutputTokens: number;
  subSharePct: number;
}

export function SubscriptionSection({
  totalSubRuns,
  totalSubTokens,
  totalSubInputTokens,
  totalSubOutputTokens,
  subSharePct,
}: SubscriptionSectionProps) {
  if (totalSubRuns <= 0) return null;

  return (
    <>
      <div className="border-t border-border" />
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subscription</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{totalSubRuns}</span> runs
          {" · "}
          {totalSubTokens > 0 && (
            <>
              <span className="font-mono text-foreground">{formatTokens(totalSubTokens)}</span> total
              {" · "}
            </>
          )}
          <span className="font-mono text-foreground">{formatTokens(totalSubInputTokens)}</span> in
          {" · "}
          <span className="font-mono text-foreground">{formatTokens(totalSubOutputTokens)}</span> out
        </p>
        {subSharePct > 0 && (
          <>
            <div className="h-1.5 w-full border border-border overflow-hidden">
              <div
                className="h-full bg-primary/60 transition-[width] duration-150"
                style={{ width: `${subSharePct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{Math.round(subSharePct)}% of token usage via subscription</p>
          </>
        )}
      </div>
    </>
  );
}

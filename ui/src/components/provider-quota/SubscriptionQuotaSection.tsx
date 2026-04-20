import type { QuotaWindow } from "@ironworksai/shared";
import { quotaSourceDisplayName } from "@/lib/utils";
import { ClaudeSubscriptionPanel } from "../ClaudeSubscriptionPanel";
import { CodexSubscriptionPanel } from "../CodexSubscriptionPanel";
import { QuotaPanelSkeleton } from "./QuotaPanelSkeleton";

interface SubscriptionQuotaSectionProps {
  provider: string;
  quotaWindows: QuotaWindow[];
  quotaError: string | null;
  quotaSource: string | null;
  quotaLoading: boolean;
}

export function SubscriptionQuotaSection({
  provider,
  quotaWindows,
  quotaError,
  quotaSource,
  quotaLoading,
}: SubscriptionQuotaSectionProps) {
  const isClaudeQuotaPanel = provider === "anthropic";
  const isCodexQuotaPanel = provider === "openai" && quotaSource?.startsWith("codex-");
  const supportsSubscriptionQuota = provider === "anthropic" || provider === "openai";
  const showSection = supportsSubscriptionQuota && (quotaLoading || quotaWindows.length > 0 || quotaError != null);

  if (!showSection) return null;

  return (
    <>
      <div className="border-t border-border" />
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subscription quota</p>
          {quotaSource && !isClaudeQuotaPanel && !isCodexQuotaPanel ? (
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {quotaSourceDisplayName(quotaSource)}
            </span>
          ) : null}
        </div>
        {quotaLoading ? (
          <QuotaPanelSkeleton />
        ) : isClaudeQuotaPanel ? (
          <ClaudeSubscriptionPanel windows={quotaWindows} source={quotaSource} error={quotaError} />
        ) : isCodexQuotaPanel ? (
          <CodexSubscriptionPanel windows={quotaWindows} source={quotaSource} error={quotaError} />
        ) : (
          <>
            {quotaError ? <p className="text-xs text-destructive">{quotaError}</p> : null}
            <div className="space-y-2.5">
              {quotaWindows.map((qw) => {
                const fillColor =
                  qw.usedPercent == null
                    ? null
                    : qw.usedPercent >= 90
                      ? "bg-red-400"
                      : qw.usedPercent >= 70
                        ? "bg-yellow-400"
                        : "bg-green-400";
                return (
                  <div key={qw.label} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono text-muted-foreground shrink-0">{qw.label}</span>
                      <span className="flex-1" />
                      {qw.valueLabel != null ? (
                        <span className="font-medium tabular-nums">{qw.valueLabel}</span>
                      ) : qw.usedPercent != null ? (
                        <span className="font-medium tabular-nums">{qw.usedPercent}% used</span>
                      ) : null}
                    </div>
                    {qw.usedPercent != null && fillColor != null && (
                      <div className="h-2 w-full border border-border overflow-hidden">
                        <div
                          className={`h-full transition-[width] duration-150 ${fillColor}`}
                          style={{ width: `${qw.usedPercent}%` }}
                        />
                      </div>
                    )}
                    {qw.detail ? (
                      <p className="text-xs text-muted-foreground">{qw.detail}</p>
                    ) : qw.resetsAt ? (
                      <p className="text-xs text-muted-foreground">
                        resets {new Date(qw.resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}

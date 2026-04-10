import { useMemo } from "react";
import type { CostWindowSpendRow } from "@ironworksai/shared";
import { formatCents, formatTokens } from "@/lib/utils";

const ROLLING_WINDOWS = ["5h", "24h", "7d"] as const;

interface RollingWindowsSectionProps {
  windowRows: CostWindowSpendRow[];
  equivalentCents: number;
  totalTokens: number;
  totalSubTokens: number;
}

export function RollingWindowsSection({
  windowRows,
  equivalentCents,
  totalTokens,
  totalSubTokens,
}: RollingWindowsSectionProps) {
  const windowMap = useMemo(
    () => new Map(windowRows.map((r) => [r.window, r])),
    [windowRows],
  );
  const maxWindowCents = useMemo(
    () => Math.max(...windowRows.map((r) => r.costCents), 0),
    [windowRows],
  );

  if (windowRows.length === 0) return null;

  return (
    <>
      <div className="border-t border-border" />
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Rolling windows
        </p>
        <div className="space-y-2.5">
          {ROLLING_WINDOWS.map((w) => {
            const row = windowMap.get(w);
            if (!row) return null;
            const cents = row.costCents;
            const tokens = row.inputTokens + row.outputTokens;
            const barPct = maxWindowCents > 0 ? (cents / maxWindowCents) * 100 : 0;
            return (
              <div key={w} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-muted-foreground w-6 shrink-0">{w}</span>
                  <span className="text-muted-foreground font-mono flex-1">
                    {formatTokens(tokens)} tok
                  </span>
                  {cents === 0 && tokens > 0 ? (
                    <span className="font-medium tabular-nums text-blue-500">~{formatCents(equivalentCents > 0 ? Math.round(equivalentCents * (tokens / Math.max(1, totalTokens + totalSubTokens))) : 0)}</span>
                  ) : (
                    <span className="font-medium tabular-nums">{formatCents(cents)}</span>
                  )}
                </div>
                <div className="h-2 w-full border border-border overflow-hidden">
                  <div
                    className="h-full bg-primary/60 transition-[width] duration-150"
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

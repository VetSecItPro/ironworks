/**
 * Rollup analytics tab — powered by the nightly cost_rollup_daily aggregation.
 * Data is 1 day behind live (rollup runs after UTC midnight). Includes:
 *   - Range picker: 7d / 30d / 90d / MTD / YTD
 *   - SVG sparkline: daily total spend
 *   - Top agents leaderboard: sorted by spend descending
 *   - Month-over-month summary card
 *
 * Uses lightweight SVG for charting (no chart library dependency).
 */

import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { costsApi, type CostRange, type RollupTimeSeriesPoint } from "../../api/costs";

// ── Range options ──────────────────────────────────────────────────────────────

const RANGE_OPTIONS: Array<{ value: CostRange; label: string }> = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "mtd", label: "MTD" },
  { value: "ytd", label: "YTD" },
];

// ── SVG Sparkline ─────────────────────────────────────────────────────────────

interface SparklineProps {
  points: RollupTimeSeriesPoint[];
}

function DailySpendChart({ points }: SparklineProps) {
  const W = 640;
  const H = 180;
  const PAD = { top: 16, right: 16, bottom: 32, left: 56 };

  // Sum spend per day when grouped by agent/adapter
  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of points) {
      map.set(p.day, (map.get(p.day) ?? 0) + p.costUsd);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, costUsd]) => ({ day, costUsd }));
  }, [points]);

  if (byDay.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
        No spend data for this range
      </div>
    );
  }

  const maxCost = Math.max(...byDay.map((d) => d.costUsd), 0.000001);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const xStep = innerW / Math.max(byDay.length - 1, 1);

  function xOf(i: number) {
    return PAD.left + i * xStep;
  }

  function yOf(v: number) {
    return PAD.top + innerH * (1 - v / maxCost);
  }

  const polyline = byDay.map((d, i) => `${xOf(i).toFixed(1)},${yOf(d.costUsd).toFixed(1)}`).join(" ");

  // Area fill — close the path below the line
  const areaPath = [
    `M ${xOf(0).toFixed(1)} ${yOf(0).toFixed(1)}`,
    ...byDay.map((d, i) => `L ${xOf(i).toFixed(1)} ${yOf(d.costUsd).toFixed(1)}`),
    `L ${xOf(byDay.length - 1).toFixed(1)} ${yOf(0).toFixed(1)}`,
    "Z",
  ].join(" ");

  // Y-axis ticks: 0, mid, max
  const yTicks = [0, maxCost / 2, maxCost];

  // X-axis labels: first, mid, last
  const xLabels = [0, Math.floor(byDay.length / 2), byDay.length - 1].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  );

  function formatUsd(v: number) {
    if (v >= 1) return `$${v.toFixed(2)}`;
    if (v >= 0.01) return `$${v.toFixed(3)}`;
    return `$${v.toFixed(5)}`;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <defs>
        <linearGradient id="spend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Y-axis gridlines + labels */}
      {yTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            y1={yOf(tick)}
            x2={W - PAD.right}
            y2={yOf(tick)}
            stroke="hsl(var(--border))"
            strokeWidth={0.5}
          />
          <text
            x={PAD.left - 4}
            y={yOf(tick)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={10}
            fill="hsl(var(--muted-foreground))"
          >
            {formatUsd(tick)}
          </text>
        </g>
      ))}

      {/* Area fill */}
      <path d={areaPath} fill="url(#spend-fill)" />

      {/* Line */}
      <polyline
        points={polyline}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* X-axis labels */}
      {xLabels.map((i) => (
        <text
          key={byDay[i].day}
          x={xOf(i)}
          y={H - 6}
          textAnchor="middle"
          fontSize={9}
          fill="hsl(var(--muted-foreground))"
        >
          {byDay[i].day.slice(5)}
        </text>
      ))}
    </svg>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  companyId: string;
}

export function RollupAnalyticsTabContent({ companyId }: Props) {
  const [range, setRange] = useState<CostRange>("30d");

  const {
    data: tsData,
    isLoading: tsLoading,
    error: tsError,
  } = useQuery({
    queryKey: ["rollup-time-series", companyId, range],
    queryFn: () => costsApi.rollupTimeSeries(companyId, range, "agent"),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000, // 5 min — rollup is nightly, no need to hammer
  });

  const {
    data: lbData,
    isLoading: lbLoading,
  } = useQuery({
    queryKey: ["rollup-leaderboard", companyId, range],
    queryFn: () => costsApi.rollupLeaderboard(companyId, range, 10),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: momData } = useQuery({
    queryKey: ["rollup-mom", companyId],
    queryFn: () => costsApi.rollupMom(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-6">
      {/* Range picker */}
      <div className="flex items-center gap-1">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRange(opt.value)}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              range === opt.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="ml-2 text-xs text-muted-foreground">(1-day lag — nightly rollup)</span>
      </div>

      {/* MoM summary */}
      {momData && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MomCard label="This month" value={momData.currentMonth.totalCostUsd} sub={`${momData.currentMonth.from} – ${momData.currentMonth.to}`} />
          <MomCard label="Last month" value={momData.previousMonth.totalCostUsd} sub={`${momData.previousMonth.from} – ${momData.previousMonth.to}`} />
          <MomCard
            label="Change ($)"
            value={momData.deltaUsd}
            signed
            sub="month-over-month"
          />
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Change (%)</p>
            {momData.deltaPct === null ? (
              <p className="mt-1 text-sm text-muted-foreground">N/A</p>
            ) : (
              <div className="mt-1 flex items-center gap-1">
                {momData.deltaPct >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-destructive" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-green-500" />
                )}
                <span className={`text-sm font-semibold ${momData.deltaPct >= 0 ? "text-destructive" : "text-green-500"}`}>
                  {momData.deltaPct >= 0 ? "+" : ""}{momData.deltaPct.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Daily spend chart */}
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 text-sm font-medium">Daily Spend — {range.toUpperCase()}</h3>
        {tsLoading ? (
          <div className="h-[180px] animate-pulse rounded bg-muted" />
        ) : tsError ? (
          <p className="text-sm text-destructive">{(tsError as Error).message}</p>
        ) : (
          <DailySpendChart points={tsData?.points ?? []} />
        )}
      </div>

      {/* Top agents leaderboard */}
      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-medium">Top Agents by Spend — {range.toUpperCase()}</h3>
        </div>
        {lbLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
              <div key={i} className="h-8 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">Agent</th>
                <th className="px-4 py-2 text-right">Calls</th>
                <th className="px-4 py-2 text-right">Input tokens</th>
                <th className="px-4 py-2 text-right">Output tokens</th>
                <th className="px-4 py-2 text-right">Spend (USD)</th>
              </tr>
            </thead>
            <tbody>
              {(lbData?.entries ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    No spend data for this range
                  </td>
                </tr>
              ) : (
                (lbData?.entries ?? []).map((entry, i) => (
                  <tr key={entry.agentId} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-2 font-medium">{entry.agentName ?? entry.agentId}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{entry.callCount.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{entry.inputTokens.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{entry.outputTokens.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      ${entry.costUsd.toFixed(4)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function MomCard({
  label,
  value,
  sub,
  signed = false,
}: {
  label: string;
  value: number;
  sub: string;
  signed?: boolean;
}) {
  const positive = value >= 0;
  const color = signed ? (positive ? "text-destructive" : "text-green-500") : "";
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${color}`}>
        {signed && positive ? "+" : ""}${Math.abs(value).toFixed(2)}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

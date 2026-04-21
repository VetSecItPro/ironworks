/**
 * Settings > Cost Dashboard page.
 *
 * Time-series spend charts, provider breakdown, agent leaderboard, and
 * month-over-month comparison. Backed by the cost_rollup_daily table via
 * three analytics endpoints, with a live fallback for today's data.
 *
 * Chart rendering uses lightweight inline SVG — no external chart library
 * required, keeping the bundle lean. Each chart component below encapsulates
 * its own layout math. If recharts is added to ui/package.json in future,
 * replace the SVG components without touching the data-fetching layer.
 */

import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompany } from "../../context/CompanyContext";

// ── API types ─────────────────────────────────────────────────────────────────

type CostRange = "7d" | "30d" | "90d" | "mtd" | "ytd";
type GroupBy = "day" | "agent" | "adapter";

interface TimeSeriesPoint {
  day: string;
  agentId: string | null;
  agentName: string | null;
  provider: string;
  source: string;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface TimeSeriesResponse {
  range: CostRange;
  groupBy: GroupBy;
  from: string;
  to: string;
  points: TimeSeriesPoint[];
}

interface LeaderboardEntry {
  agentId: string;
  agentName: string;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface LeaderboardResponse {
  range: CostRange;
  limit: number;
  entries: LeaderboardEntry[];
}

interface ProviderTotal {
  provider: string;
  costUsd: number;
}

interface MomResponse {
  currentMonth: { from: string; to: string; totalCostUsd: number; byProvider: ProviderTotal[] };
  previousMonth: { from: string; to: string; totalCostUsd: number; byProvider: ProviderTotal[] };
  deltaUsd: number;
  deltaPct: number | null;
}

// ── API functions ─────────────────────────────────────────────────────────────

function fetchTimeSeries(companyId: string, range: CostRange, groupBy: GroupBy) {
  return api.get<TimeSeriesResponse>(`/companies/${companyId}/costs/time-series?range=${range}&group_by=${groupBy}`);
}

function fetchLeaderboard(companyId: string, range: CostRange) {
  return api.get<LeaderboardResponse>(`/companies/${companyId}/costs/leaderboard?range=${range}&limit=10`);
}

function fetchMom(companyId: string) {
  return api.get<MomResponse>(`/companies/${companyId}/costs/mom`);
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatUsd(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  // Sub-dollar: show more precision so $0.001 doesn't appear as $0.00
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function shortDate(iso: string): string {
  // "2026-04-20" -> "Apr 20"
  const [, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1]} ${Number(d)}`;
}

// ── Chart: simple SVG line chart ──────────────────────────────────────────────

interface LineChartProps {
  /** One value per x-tick */
  values: number[];
  /** Labels below x-axis */
  labels: string[];
  width?: number;
  height?: number;
}

function LineChart({ values, labels, width = 600, height = 160 }: LineChartProps) {
  if (values.length === 0) return <EmptyChartPlaceholder width={width} height={height} />;

  const pad = { top: 12, right: 16, bottom: 32, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const max = Math.max(...values, 0.000001);
  const step = values.length > 1 ? innerW / (values.length - 1) : innerW;

  // Map values to SVG coordinates
  const pts = values.map((v, i) => ({
    x: pad.left + i * step,
    y: pad.top + innerH - (v / max) * innerH,
  }));

  const polyline = pts.map((p) => `${p.x},${p.y}`).join(" ");

  // Y-axis ticks (3 levels)
  const yTicks = [0, 0.5, 1].map((pct) => ({
    y: pad.top + innerH * (1 - pct),
    label: formatUsd(max * pct),
  }));

  // X-axis labels: show at most ~6 evenly spaced
  const stride = Math.max(1, Math.ceil(labels.length / 6));
  const xLabels = labels.map((l, i) => ({ i, l })).filter(({ i }) => i % stride === 0 || i === labels.length - 1);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} aria-label="Spend over time line chart">
      {/* Y gridlines */}
      {yTicks.map((t) => (
        <g key={t.y}>
          <line x1={pad.left} y1={t.y} x2={width - pad.right} y2={t.y} stroke="currentColor" strokeOpacity={0.08} />
          <text x={pad.left - 6} y={t.y + 4} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.5}>
            {t.label}
          </text>
        </g>
      ))}

      {/* Line */}
      <polyline
        points={polyline}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Area fill */}
      <polygon
        points={`${pts[0].x},${pad.top + innerH} ${polyline} ${pts[pts.length - 1].x},${pad.top + innerH}`}
        fill="hsl(var(--primary))"
        opacity={0.08}
      />

      {/* Data dots */}
      {pts.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: index is the stable key for fixed point series
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="hsl(var(--primary))" />
      ))}

      {/* X-axis labels */}
      {xLabels.map(({ i, l }) => (
        <text
          key={i}
          x={pad.left + i * step}
          y={height - 6}
          textAnchor="middle"
          fontSize={9}
          fill="currentColor"
          opacity={0.5}
        >
          {l}
        </text>
      ))}
    </svg>
  );
}

// ── Chart: stacked bar chart for adapter breakdown ────────────────────────────

interface StackedBarProps {
  /** Each series has a name and an array of values (one per day) */
  series: { name: string; values: number[] }[];
  labels: string[];
  width?: number;
  height?: number;
}

const BAR_COLORS = [
  "hsl(var(--primary))",
  "hsl(220 70% 60%)",
  "hsl(160 60% 50%)",
  "hsl(35 90% 55%)",
  "hsl(280 60% 60%)",
];

function StackedBarChart({ series, labels, width = 600, height = 160 }: StackedBarProps) {
  if (series.length === 0 || labels.length === 0) {
    return <EmptyChartPlaceholder width={width} height={height} />;
  }

  const pad = { top: 12, right: 16, bottom: 32, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const totals = labels.map((_, i) => series.reduce((s, sr) => s + (sr.values[i] ?? 0), 0));
  const max = Math.max(...totals, 0.000001);

  const barCount = labels.length;
  const barGap = 4;
  const barW = Math.max(4, (innerW - barGap * (barCount - 1)) / barCount);
  const step = barW + barGap;

  const yTicks = [0, 0.5, 1].map((pct) => ({
    y: pad.top + innerH * (1 - pct),
    label: formatUsd(max * pct),
  }));

  const stride = Math.max(1, Math.ceil(labels.length / 6));
  const xLabels = labels.map((l, i) => ({ i, l })).filter(({ i }) => i % stride === 0 || i === labels.length - 1);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} aria-label="Spend by adapter stacked bar chart">
      {/* Y gridlines */}
      {yTicks.map((t) => (
        <g key={t.y}>
          <line x1={pad.left} y1={t.y} x2={width - pad.right} y2={t.y} stroke="currentColor" strokeOpacity={0.08} />
          <text x={pad.left - 6} y={t.y + 4} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.5}>
            {t.label}
          </text>
        </g>
      ))}

      {/* Bars */}
      {labels.map((_, col) => {
        let yOffset = pad.top + innerH;
        return series.map((sr, si) => {
          const val = sr.values[col] ?? 0;
          const barH = (val / max) * innerH;
          yOffset -= barH;
          const x = pad.left + col * step;
          const y = yOffset;
          return (
            <rect
              // biome-ignore lint/suspicious/noArrayIndexKey: stable column×series key
              key={`${col}-${si}`}
              x={x}
              y={y}
              width={barW}
              height={barH}
              fill={BAR_COLORS[si % BAR_COLORS.length]}
              opacity={0.85}
            />
          );
        });
      })}

      {/* X-axis labels */}
      {xLabels.map(({ i, l }) => (
        <text
          key={i}
          x={pad.left + i * step + barW / 2}
          y={height - 6}
          textAnchor="middle"
          fontSize={9}
          fill="currentColor"
          opacity={0.5}
        >
          {l}
        </text>
      ))}
    </svg>
  );
}

// ── Shared empty placeholder ──────────────────────────────────────────────────

function EmptyChartPlaceholder({ width, height }: { width: number; height: number }) {
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} aria-label="No chart data">
      <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={13} fill="currentColor" opacity={0.35}>
        No data for this period
      </text>
    </svg>
  );
}

// ── Range picker ──────────────────────────────────────────────────────────────

const RANGE_LABELS: Record<CostRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  mtd: "Month to date",
  ytd: "Year to date",
};

function RangePicker({ value, onChange }: { value: CostRange; onChange: (r: CostRange) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as CostRange)}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(RANGE_LABELS) as CostRange[]).map((r) => (
          <SelectItem key={r} value={r}>
            {RANGE_LABELS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── MoM card ──────────────────────────────────────────────────────────────────

function MomCard({ data }: { data: MomResponse }) {
  const up = data.deltaUsd >= 0;
  const pctLabel = data.deltaPct !== null ? `${Math.abs(data.deltaPct).toFixed(1)}%` : "N/A";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Month over Month</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">This month</p>
            <p className="text-2xl font-semibold tabular-nums">{formatUsd(data.currentMonth.totalCostUsd)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.currentMonth.from} to {data.currentMonth.to}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last month</p>
            <p className="text-2xl font-semibold tabular-nums">{formatUsd(data.previousMonth.totalCostUsd)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.previousMonth.from} to {data.previousMonth.to}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          {up ? (
            <TrendingUp className="size-4 text-destructive" />
          ) : (
            <TrendingDown className="size-4 text-green-600 dark:text-green-400" />
          )}
          <span
            className={
              up ? "text-destructive font-medium text-sm" : "text-green-600 dark:text-green-400 font-medium text-sm"
            }
          >
            {up ? "+" : "-"}
            {pctLabel} ({up ? "+" : ""}
            {formatUsd(data.deltaUsd)})
          </span>
          <span className="text-xs text-muted-foreground">vs previous month</span>
        </div>

        {data.currentMonth.byProvider.length > 0 && (
          <div className="mt-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">By provider</p>
            {data.currentMonth.byProvider
              .sort((a, b) => b.costUsd - a.costUsd)
              .map((p) => (
                <div key={p.provider} className="flex justify-between text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{p.provider}</span>
                  <span className="tabular-nums">{formatUsd(p.costUsd)}</span>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Leaderboard table ─────────────────────────────────────────────────────────

function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">No agent cost data for this period.</p>;
  }

  const maxCost = entries[0].costUsd;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b">
            <th className="pb-2 font-medium w-6">#</th>
            <th className="pb-2 font-medium">Agent</th>
            <th className="pb-2 font-medium text-right">Calls</th>
            <th className="pb-2 font-medium text-right">Tokens</th>
            <th className="pb-2 font-medium text-right">Cost</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => {
            const barWidth = maxCost > 0 ? (e.costUsd / maxCost) * 100 : 0;
            return (
              <tr key={e.agentId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="py-2 pr-2 text-muted-foreground tabular-nums">{i + 1}</td>
                <td className="py-2">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium truncate max-w-[200px]">{e.agentName}</span>
                    {/* Inline bar shows relative cost at a glance */}
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${barWidth}%` }} />
                    </div>
                  </div>
                </td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">{e.callCount.toLocaleString()}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">
                  {formatTokenCount(e.inputTokens + e.outputTokens)}
                </td>
                <td className="py-2 text-right tabular-nums font-medium">{formatUsd(e.costUsd)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-3 mt-2">
      {items.map(({ label, color }) => (
        <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: color }} />
          {label}
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function CostDashboard() {
  const { selectedCompanyId } = useCompany();
  const [range, setRange] = useState<CostRange>("30d");

  const companyId = selectedCompanyId ?? "";
  const enabled = !!companyId;

  const timeSeriesByDay = useQuery({
    queryKey: ["cost-analytics", "time-series", companyId, range, "day"],
    queryFn: () => fetchTimeSeries(companyId, range, "day"),
    enabled,
  });

  const timeSeriesByAdapter = useQuery({
    queryKey: ["cost-analytics", "time-series", companyId, range, "adapter"],
    queryFn: () => fetchTimeSeries(companyId, range, "adapter"),
    enabled,
  });

  const leaderboard = useQuery({
    queryKey: ["cost-analytics", "leaderboard", companyId, range],
    queryFn: () => fetchLeaderboard(companyId, range),
    enabled,
  });

  const mom = useQuery({
    queryKey: ["cost-analytics", "mom", companyId],
    queryFn: () => fetchMom(companyId),
    enabled,
    // MoM is month-scoped — stale after 5 min
    staleTime: 5 * 60 * 1000,
  });

  if (!companyId) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Select a company to view cost analytics.
      </div>
    );
  }

  // ── Derive chart data from raw API responses ──────────────────────────────

  // Spend-per-day line chart
  const dayPoints = timeSeriesByDay.data?.points ?? [];
  const dayLabels = [...new Set(dayPoints.map((p) => p.day))].sort();
  const dayValues = dayLabels.map((day) => dayPoints.filter((p) => p.day === day).reduce((s, p) => s + p.costUsd, 0));

  // Adapter stacked bar chart
  const adapterPoints = timeSeriesByAdapter.data?.points ?? [];
  const adapterDays = [...new Set(adapterPoints.map((p) => p.day))].sort();
  const providers = [...new Set(adapterPoints.map((p) => p.provider))].sort();
  const adapterSeries = providers.map((prov, si) => ({
    name: prov,
    values: adapterDays.map((day) =>
      adapterPoints.filter((p) => p.day === day && p.provider === prov).reduce((s, p) => s + p.costUsd, 0),
    ),
    color: BAR_COLORS[si % BAR_COLORS.length],
  }));

  const totalSpend = dayValues.reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Cost Dashboard</h2>
          <p className="text-sm text-muted-foreground">Spend analytics from aggregated adapter call data.</p>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </div>

      {/* Summary stat */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total spend</p>
            <p className="text-3xl font-semibold tabular-nums mt-1">{formatUsd(totalSpend)}</p>
            <p className="text-xs text-muted-foreground mt-1">{RANGE_LABELS[range]}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total calls</p>
            <p className="text-3xl font-semibold tabular-nums mt-1">
              {dayPoints.reduce((s, p) => s + p.callCount, 0).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{RANGE_LABELS[range]}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total tokens</p>
            <p className="text-3xl font-semibold tabular-nums mt-1">
              {formatTokenCount(dayPoints.reduce((s, p) => s + p.inputTokens + p.outputTokens, 0))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{RANGE_LABELS[range]}</p>
          </CardContent>
        </Card>
      </div>

      {/* Spend over time */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Spend over time</CardTitle>
        </CardHeader>
        <CardContent>
          {timeSeriesByDay.isLoading ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
          ) : (
            <LineChart values={dayValues} labels={dayLabels.map(shortDate)} />
          )}
        </CardContent>
      </Card>

      {/* Adapter breakdown stacked bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Spend by adapter</CardTitle>
        </CardHeader>
        <CardContent>
          {timeSeriesByAdapter.isLoading ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
          ) : (
            <>
              <StackedBarChart series={adapterSeries} labels={adapterDays.map(shortDate)} />
              {adapterSeries.length > 0 && (
                <ChartLegend items={adapterSeries.map((s) => ({ label: s.name, color: s.color }))} />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Bottom row: leaderboard + MoM */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Top agents by cost</CardTitle>
          </CardHeader>
          <CardContent>
            {leaderboard.isLoading ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
            ) : (
              <LeaderboardTable entries={leaderboard.data?.entries ?? []} />
            )}
          </CardContent>
        </Card>

        {/* Month-over-month */}
        {mom.isLoading ? (
          <Card>
            <CardContent className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              Loading...
            </CardContent>
          </Card>
        ) : mom.data ? (
          <MomCard data={mom.data} />
        ) : null}
      </div>
    </div>
  );
}

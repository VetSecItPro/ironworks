import type { VelocityWeek } from "../../api/velocity";
import { cn } from "../../lib/utils";

/* ── Performance Trend SVG Line Chart ── */

const TREND_W = 600;
const TREND_H = 180;
const TREND_PAD = { top: 16, right: 24, bottom: 36, left: 44 };
const TREND_INNER_W = TREND_W - TREND_PAD.left - TREND_PAD.right;
const TREND_INNER_H = TREND_H - TREND_PAD.top - TREND_PAD.bottom;

export function PerformanceTrendChart({ snapshots }: { snapshots: Array<{ date: Date; score: number }> }) {
  const scores = snapshots.map((s) => s.score);
  const minScore = Math.max(0, Math.min(...scores) - 10);
  const maxScore = Math.min(100, Math.max(...scores) + 10);
  const range = Math.max(maxScore - minScore, 10);

  const yTicks = 4;

  function xPos(i: number) {
    return TREND_PAD.left + (i / Math.max(snapshots.length - 1, 1)) * TREND_INNER_W;
  }

  function yPos(score: number) {
    return TREND_PAD.top + TREND_INNER_H - ((score - minScore) / range) * TREND_INNER_H;
  }

  const polyline = snapshots.map((s, i) => `${xPos(i)},${yPos(s.score)}`).join(" ");

  const areaPath = [
    `M ${xPos(0)} ${yPos(snapshots[0]!.score)}`,
    ...snapshots.slice(1).map((s, i) => `L ${xPos(i + 1)} ${yPos(s.score)}`),
    `L ${xPos(snapshots.length - 1)} ${TREND_PAD.top + TREND_INNER_H}`,
    `L ${xPos(0)} ${TREND_PAD.top + TREND_INNER_H}`,
    "Z",
  ].join(" ");

  return (
    <svg viewBox={`0 0 ${TREND_W} ${TREND_H}`} className="w-full" style={{ height: TREND_H }} aria-hidden="true">
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
          <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Y grid lines */}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const val = minScore + (range / yTicks) * i;
        const y = yPos(val);
        return (
          <g key={i}>
            <line
              x1={TREND_PAD.left}
              y1={y}
              x2={TREND_W - TREND_PAD.right}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeWidth={1}
            />
            <text
              x={TREND_PAD.left - 6}
              y={y + 4}
              textAnchor="end"
              fontSize={10}
              className="fill-muted-foreground"
              fontFamily="var(--font-sans)"
            >
              {Math.round(val)}
            </text>
          </g>
        );
      })}

      {/* Area fill */}
      <path d={areaPath} fill="url(#trend-fill)" />

      {/* Line */}
      <polyline
        points={polyline}
        fill="none"
        stroke="#6366f1"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Data points */}
      {snapshots.map((s, i) => (
        <circle key={i} cx={xPos(i)} cy={yPos(s.score)} r={3} fill="#6366f1" />
      ))}

      {/* X-axis labels */}
      {snapshots.map((s, i) => {
        if (snapshots.length > 6 && i !== 0 && i !== snapshots.length - 1 && i % 3 !== 0) return null;
        const d = s.date;
        const label = `${d.getMonth() + 1}/${d.getDate()}`;
        return (
          <text
            key={i}
            x={xPos(i)}
            y={TREND_H - 6}
            textAnchor="middle"
            fontSize={10}
            className="fill-muted-foreground"
            fontFamily="var(--font-sans)"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

/* ── Velocity SVG Bar Chart ── */

const VEL_W = 600;
const VEL_H = 160;
const VEL_PAD = { top: 12, right: 16, bottom: 32, left: 40 };
const VEL_INNER_W = VEL_W - VEL_PAD.left - VEL_PAD.right;
const VEL_INNER_H = VEL_H - VEL_PAD.top - VEL_PAD.bottom;

export function VelocityChart({ data }: { data: VelocityWeek[] }) {
  const maxVal = Math.max(...data.map((d) => d.issuesCompleted), 1);
  const barCount = data.length;
  const barGap = 4;
  const barW = Math.max(8, (VEL_INNER_W - barGap * (barCount - 1)) / barCount);

  const yTicks = 4;
  const yStep = maxVal / yTicks;

  return (
    <svg viewBox={`0 0 ${VEL_W} ${VEL_H}`} className="w-full" style={{ height: VEL_H }} aria-hidden="true">
      {/* Y grid lines */}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const val = yStep * i;
        const y = VEL_PAD.top + VEL_INNER_H - (val / maxVal) * VEL_INNER_H;
        return (
          <g key={i}>
            <line
              x1={VEL_PAD.left}
              y1={y}
              x2={VEL_W - VEL_PAD.right}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeWidth={1}
            />
            <text
              x={VEL_PAD.left - 4}
              y={y + 4}
              textAnchor="end"
              fontSize={10}
              className="fill-muted-foreground"
              fontFamily="var(--font-sans)"
            >
              {Math.round(val)}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const x = VEL_PAD.left + i * (barW + barGap);
        const barH = maxVal > 0 ? (d.issuesCompleted / maxVal) * VEL_INNER_H : 0;
        const y = VEL_PAD.top + VEL_INNER_H - barH;
        const labelDate = new Date(d.weekStart + "T12:00:00");
        const label = `${labelDate.getMonth() + 1}/${labelDate.getDate()}`;

        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} fill="#3b82f6" fillOpacity={0.75} rx={2} />
            {(i === 0 || i === barCount - 1 || i % 2 === 0) && (
              <text
                x={x + barW / 2}
                y={VEL_H - 4}
                textAnchor="middle"
                fontSize={10}
                className="fill-muted-foreground"
                fontFamily="var(--font-sans)"
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ── KPI Card ── */

export function KpiCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border p-4 space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn("text-2xl font-bold tabular-nums", color)}>{value}</p>
    </div>
  );
}

import type { Issue } from "@ironworksai/shared";
import { BarChart3 } from "lucide-react";

export function GoalBurnupChart({
  issues,
  targetDate,
  startDate: goalStartDate,
}: {
  issues: Issue[];
  targetDate: string | null;
  startDate: string | null;
}) {
  const total = issues.length;
  if (total < 5) return null;

  // Build completion timeline
  const completedIssues = issues
    .filter((i) => (i.status === "done" || i.status === "cancelled") && i.completedAt)
    .map((i) => new Date(i.completedAt!).getTime())
    .sort((a, b) => a - b);

  // Build scope timeline (when issues were created)
  const scopeEvents = issues.map((i) => new Date(i.createdAt).getTime()).sort((a, b) => a - b);

  const createdDates = issues.map((i) => new Date(i.createdAt).getTime());
  const startDate = goalStartDate ? new Date(goalStartDate).getTime() : Math.min(...createdDates);
  const now = Date.now();
  const endDate = targetDate ? Math.max(new Date(targetDate).getTime(), now) : now;
  const range = endDate - startDate || 1;

  // Build scope line points (cumulative issues created over time)
  const scopePoints: Array<{ x: number; y: number }> = [];
  let scopeCount = 0;
  for (const ts of scopeEvents) {
    scopeCount++;
    const x = ((ts - startDate) / range) * 100;
    scopePoints.push({ x: Math.min(100, Math.max(0, x)), y: scopeCount });
  }
  // Extend to now
  const nowX = ((now - startDate) / range) * 100;
  scopePoints.push({ x: Math.min(100, nowX), y: scopeCount });

  // Build completed line points (cumulative completed over time)
  const completedPoints: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  let doneCount = 0;
  for (const ts of completedIssues) {
    doneCount++;
    const x = ((ts - startDate) / range) * 100;
    completedPoints.push({ x: Math.min(100, Math.max(0, x)), y: doneCount });
  }
  completedPoints.push({ x: Math.min(100, nowX), y: doneCount });

  const svgW = 360;
  const svgH = 110;
  const maxY = Math.max(total, 1);

  const toSvgPath = (points: Array<{ x: number; y: number }>) =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${(p.x / 100) * svgW} ${svgH - 20 - (p.y / maxY) * (svgH - 30)}`)
      .join(" ");

  const scopePath = toSvgPath(scopePoints);
  const completedPath = toSvgPath(completedPoints);
  // Ideal line: diagonal from 0 to total
  const idealPath = `M 0 ${svgH - 20} L ${svgW} ${svgH - 20 - (svgH - 30)}`;

  const startLabel = new Date(startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = targetDate
    ? new Date(targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "Now";

  return (
    <div className="rounded-xl border border-border p-4 space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <BarChart3 className="h-3.5 w-3.5" />
        Burnup
      </h4>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid */}
        <line x1="0" y1={svgH - 20} x2={svgW} y2={svgH - 20} className="stroke-muted/30" strokeWidth="0.5" />
        <line
          x1="0"
          y1={(svgH - 20) / 2}
          x2={svgW}
          y2={(svgH - 20) / 2}
          className="stroke-muted/30"
          strokeWidth="0.5"
        />
        <line x1="0" y1="10" x2={svgW} y2="10" className="stroke-muted/30" strokeWidth="0.5" />

        {/* Y labels */}
        <text x="2" y="8" className="fill-muted-foreground text-[7px]">
          {total}
        </text>
        <text x="2" y={svgH - 16} className="fill-muted-foreground text-[7px]">
          0
        </text>

        {/* Ideal line (dashed) */}
        {targetDate && (
          <path
            d={idealPath}
            fill="none"
            className="stroke-muted-foreground/30"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
        )}

        {/* Scope line (total issues) */}
        <path d={scopePath} fill="none" className="stroke-violet-500/60" strokeWidth="1.5" />

        {/* Completed line */}
        <path d={completedPath} fill="none" className="stroke-emerald-500" strokeWidth="2" />

        {/* X labels */}
        <text x="2" y={svgH - 2} className="fill-muted-foreground text-[7px]">
          {startLabel}
        </text>
        <text x={svgW - 2} y={svgH - 2} textAnchor="end" className="fill-muted-foreground text-[7px]">
          {endLabel}
        </text>
      </svg>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-emerald-500 shrink-0" />
          Completed
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-violet-500/60 shrink-0" />
          Total Scope
        </span>
        {targetDate && (
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3 bg-muted-foreground/30 shrink-0" />
            Ideal
          </span>
        )}
        <span className="ml-auto">
          {doneCount}/{total} done
        </span>
      </div>
    </div>
  );
}

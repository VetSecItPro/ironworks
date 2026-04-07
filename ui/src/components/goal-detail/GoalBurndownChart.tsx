import type { Issue } from "@ironworksai/shared";

export function GoalBurndownChart({
  issues,
  targetDate,
}: {
  issues: Issue[];
  targetDate: string | null;
}) {
  const total = issues.length;
  if (total === 0) return null;

  // Build completion timeline: sorted list of completion dates
  const completedIssues = issues
    .filter((i) => (i.status === "done" || i.status === "cancelled") && i.completedAt)
    .map((i) => new Date(i.completedAt!).getTime())
    .sort((a, b) => a - b);

  // Determine date range
  const createdDates = issues.map((i) => new Date(i.createdAt).getTime());
  const startDate = Math.min(...createdDates);
  const now = Date.now();
  const endDate = targetDate ? Math.max(new Date(targetDate).getTime(), now) : now;
  const range = endDate - startDate || 1;

  // Build stepped actual burndown points
  const actualPoints: Array<{ x: number; y: number }> = [{ x: 0, y: total }];
  let remaining = total;
  for (const ts of completedIssues) {
    remaining--;
    const x = ((ts - startDate) / range) * 100;
    actualPoints.push({ x: Math.min(100, Math.max(0, x)), y: remaining });
  }
  // Extend to current time
  const nowX = ((now - startDate) / range) * 100;
  actualPoints.push({ x: Math.min(100, nowX), y: remaining });

  // Build SVG path for actual line (stepped)
  const actualPath = actualPoints
    .map((p, i) => {
      if (i === 0) return `M ${p.x * 3.6} ${(1 - p.y / total) * 80 + 10}`;
      const prev = actualPoints[i - 1];
      return `L ${p.x * 3.6} ${(1 - prev.y / total) * 80 + 10} L ${p.x * 3.6} ${(1 - p.y / total) * 80 + 10}`;
    })
    .join(" ");

  // Ideal line: from (0, total) to (100%, 0)
  const idealPath = "M 0 10 L 360 90";

  const startLabel = new Date(startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = targetDate
    ? new Date(targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "Now";

  return (
    <div className="rounded-xl border border-border p-4 space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Burndown</h4>
      <svg viewBox="0 0 360 110" className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        <line x1="0" y1="10" x2="360" y2="10" className="stroke-muted/30" strokeWidth="0.5" />
        <line x1="0" y1="50" x2="360" y2="50" className="stroke-muted/30" strokeWidth="0.5" />
        <line x1="0" y1="90" x2="360" y2="90" className="stroke-muted/30" strokeWidth="0.5" />

        {/* Y-axis labels */}
        <text x="2" y="8" className="fill-muted-foreground text-[7px]">{total}</text>
        <text x="2" y="94" className="fill-muted-foreground text-[7px]">0</text>

        {/* Ideal line (dashed) */}
        {targetDate && (
          <path d={idealPath} fill="none" className="stroke-muted-foreground/40" strokeWidth="1" strokeDasharray="4 3" />
        )}

        {/* Actual burndown */}
        <path d={actualPath} fill="none" className="stroke-blue-500" strokeWidth="2" />

        {/* X-axis labels */}
        <text x="2" y="106" className="fill-muted-foreground text-[7px]">{startLabel}</text>
        <text x="358" y="106" textAnchor="end" className="fill-muted-foreground text-[7px]">{endLabel}</text>
      </svg>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-blue-500 shrink-0" />
          Actual
        </span>
        {targetDate && (
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3 bg-muted-foreground/40 shrink-0" />
            Ideal
          </span>
        )}
        <span className="ml-auto">{total - remaining}/{total} done</span>
      </div>
    </div>
  );
}

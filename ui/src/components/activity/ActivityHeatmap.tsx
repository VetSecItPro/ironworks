import { Calendar } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ActivityEvent } from "@ironworksai/shared";

function cellColor(count: number, maxCount: number): string {
  if (count === 0) return "bg-muted/40";
  const intensity = count / maxCount;
  if (intensity > 0.75) return "bg-emerald-500";
  if (intensity > 0.5) return "bg-emerald-400";
  if (intensity > 0.25) return "bg-emerald-300 dark:bg-emerald-600";
  return "bg-emerald-200 dark:bg-emerald-700";
}

export function ActivityHeatmap({ events }: { events: ActivityEvent[] }) {
  // Build 26-week x 7-day grid (6 months)
  const weeks = 26;
  const now = new Date();
  const grid: number[][] = [];
  for (let w = 0; w < weeks; w++) {
    const week: number[] = [];
    for (let d = 0; d < 7; d++) {
      const dayOffset = (weeks - 1 - w) * 7 + (6 - d);
      const date = new Date(now.getTime() - dayOffset * 86400000);
      const dayStr = date.toISOString().slice(0, 10);
      const count = events.filter((e) => new Date(e.createdAt).toISOString().slice(0, 10) === dayStr).length;
      week.push(count);
    }
    grid.push(week);
  }
  const maxCount = Math.max(...grid.flat(), 1);

  return (
    <div className="rounded-lg border border-border p-4 space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Calendar className="h-3.5 w-3.5" />
        Activity Density (6 months)
      </h4>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}>
        {grid.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((count, di) => (
              <div
                key={di}
                className={cn("aspect-square w-full min-w-[8px] rounded-[3px]", cellColor(count, maxCount))}
                title={`${count} events`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>Less</span>
        <div className="h-2 w-2 rounded-[2px] bg-muted/40" />
        <div className="h-2 w-2 rounded-[2px] bg-emerald-200 dark:bg-emerald-700" />
        <div className="h-2 w-2 rounded-[2px] bg-emerald-300 dark:bg-emerald-600" />
        <div className="h-2 w-2 rounded-[2px] bg-emerald-400" />
        <div className="h-2 w-2 rounded-[2px] bg-emerald-500" />
        <span>More</span>
      </div>
    </div>
  );
}

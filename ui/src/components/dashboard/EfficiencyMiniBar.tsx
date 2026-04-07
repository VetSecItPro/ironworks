import { cn } from "../../lib/utils";

export function EfficiencyMiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-[width] duration-300", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

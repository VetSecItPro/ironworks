import { cn } from "../../lib/utils";

export function ProgressBar({ percent, size = "md" }: { percent: number; size?: "sm" | "md" }) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className={cn("w-full bg-muted rounded-full overflow-hidden", size === "sm" ? "h-1.5" : "h-2.5")}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          clamped === 100
            ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
            : clamped > 50
              ? "bg-gradient-to-r from-blue-600 to-blue-400"
              : clamped > 0
                ? "bg-gradient-to-r from-amber-500 to-amber-400"
                : "bg-muted",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

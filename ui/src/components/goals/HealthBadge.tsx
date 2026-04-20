import { cn } from "../../lib/utils";
import { type GoalHealth, HEALTH_CONFIG } from "./goal-health";

export function HealthBadge({ health }: { health: GoalHealth }) {
  if (health === "no_data") return null;
  const cfg = HEALTH_CONFIG[health];
  return (
    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0", cfg.className)}>
      {cfg.label}
    </span>
  );
}

export function ConfidenceIndicator({ confidence }: { confidence: number | null | undefined }) {
  if (confidence == null) return null;
  const color = confidence > 66 ? "bg-emerald-500" : confidence > 33 ? "bg-amber-500" : "bg-red-500";
  return (
    <span className="flex items-center gap-1 shrink-0" title={`Confidence: ${confidence}%`}>
      <span className={cn("h-2 w-2 rounded-full", color)} />
      <span className="text-[10px] text-muted-foreground tabular-nums">{confidence}</span>
    </span>
  );
}

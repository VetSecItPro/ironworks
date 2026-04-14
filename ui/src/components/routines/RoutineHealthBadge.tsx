import { AlertTriangle } from "lucide-react";

export function RoutineHealthBadge({ lastRunAt, status }: { lastRunAt?: string | Date | null; status: string }) {
  if (status !== "active") return null;
  if (!lastRunAt) return null;
  const lastRun = new Date(lastRunAt).getTime();
  const hoursSinceRun = (Date.now() - lastRun) / (1000 * 60 * 60);
  // Consider "late" if active routine hasn't run in 48+ hours
  if (hoursSinceRun < 48) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-amber-500" title={`Last run ${Math.round(hoursSinceRun)}h ago`}>
      <AlertTriangle className="h-3 w-3" />
      Late
    </span>
  );
}

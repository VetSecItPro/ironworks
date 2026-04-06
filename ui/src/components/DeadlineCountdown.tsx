import { useMemo } from "react";
import { Clock } from "lucide-react";
import { cn } from "../lib/utils";

interface DeadlineCountdownProps {
  targetDate: Date | string | null | undefined;
  status?: string;
  className?: string;
}

/**
 * Shows a human-readable countdown like "Due in 2 days" or "3 days overdue"
 * with color coding: green for > 3 days, amber for 1-3 days, red for overdue.
 */
export function DeadlineCountdown({ targetDate, status, className }: DeadlineCountdownProps) {
  const info = useMemo(() => {
    if (!targetDate) return null;
    const target = typeof targetDate === "string" ? new Date(targetDate) : targetDate;
    if (isNaN(target.getTime())) return null;

    // If the issue is completed or cancelled, don't show countdown
    if (status === "done" || status === "cancelled") return null;

    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    let label: string;
    let tone: "green" | "amber" | "red";

    if (diffDays < 0) {
      const absDays = Math.abs(diffDays);
      label = absDays === 1 ? "1 day overdue" : `${absDays} days overdue`;
      tone = "red";
    } else if (diffDays === 0) {
      label = "Due today";
      tone = "red";
    } else if (diffDays === 1) {
      label = "Due tomorrow";
      tone = "amber";
    } else if (diffDays <= 3) {
      label = `Due in ${diffDays} days`;
      tone = "amber";
    } else if (diffDays <= 7) {
      label = `Due in ${diffDays} days`;
      tone = "green";
    } else {
      const weeks = Math.floor(diffDays / 7);
      label = weeks === 1 ? "Due in 1 week" : `Due in ${weeks} weeks`;
      tone = "green";
    }

    return { label, tone };
  }, [targetDate, status]);

  if (!info) return null;

  const toneClass = {
    green: "text-green-600 dark:text-green-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
  }[info.tone];

  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium whitespace-nowrap", toneClass, className)}>
      <Clock className="h-3 w-3" />
      {info.label}
    </span>
  );
}

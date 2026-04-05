import { useEffect, useState } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "../lib/utils";

/* ------------------------------------------------------------------ */
/*  Types & storage                                                    */
/* ------------------------------------------------------------------ */

type Priority = "critical" | "high" | "medium" | "low";

interface SLAPolicy {
  responseTimeMinutes: number;
  resolutionTimeMinutes: number;
}

type SLAPolicies = Record<Priority, SLAPolicy>;

const STORAGE_KEY = "ironworks.sla-policies";

const DEFAULT_POLICIES: SLAPolicies = {
  critical: { responseTimeMinutes: 60, resolutionTimeMinutes: 240 },
  high: { responseTimeMinutes: 240, resolutionTimeMinutes: 1440 },
  medium: { responseTimeMinutes: 1440, resolutionTimeMinutes: 4320 },
  low: { responseTimeMinutes: 4320, resolutionTimeMinutes: 10080 },
};

function loadPolicies(): SLAPolicies {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SLAPolicies;
  } catch { /* ignore */ }
  return { ...DEFAULT_POLICIES };
}

/* ------------------------------------------------------------------ */
/*  Timer logic                                                        */
/* ------------------------------------------------------------------ */

function computeRemaining(createdAt: string | Date, targetMinutes: number): number {
  const created = new Date(createdAt).getTime();
  const deadline = created + targetMinutes * 60_000;
  return deadline - Date.now();
}

function formatCountdown(remainingMs: number): string {
  const abs = Math.abs(remainingMs);
  const totalSeconds = Math.floor(abs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const prefix = remainingMs < 0 ? "-" : "";

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainH = hours % 24;
    return `${prefix}${days}d ${remainH}h`;
  }

  if (hours > 0) {
    return `${prefix}${hours}h ${minutes}m`;
  }
  return `${prefix}${minutes}m ${seconds}s`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface SLATimerProps {
  priority: string;
  status: string;
  createdAt: string | Date;
  className?: string;
}

const CLOSED_STATUSES = new Set(["done", "cancelled"]);
const VALID_PRIORITIES = new Set(["critical", "high", "medium", "low"]);

export function SLATimer({ priority, status, createdAt, className }: SLATimerProps) {
  const [, setTick] = useState(0);

  // Force re-render every second for countdown
  useEffect(() => {
    if (CLOSED_STATUSES.has(status)) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  if (!VALID_PRIORITIES.has(priority) || CLOSED_STATUSES.has(status)) {
    return null;
  }

  const policies = loadPolicies();
  const policy = policies[priority as Priority];
  if (!policy) return null;

  const responseRemaining = computeRemaining(createdAt, policy.responseTimeMinutes);
  const resolutionRemaining = computeRemaining(createdAt, policy.resolutionTimeMinutes);

  const responseBreached = responseRemaining < 0;
  const resolutionBreached = resolutionRemaining < 0;
  const responseWarning = !responseBreached && responseRemaining < 15 * 60_000; // under 15 min
  const resolutionWarning = !resolutionBreached && resolutionRemaining < 30 * 60_000; // under 30 min

  return (
    <div className={cn("flex items-center gap-3 text-xs", className)}>
      {/* Response SLA */}
      <div className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-md border",
        responseBreached
          ? "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400"
          : responseWarning
            ? "border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400"
            : "border-border bg-muted/30 text-muted-foreground",
      )}>
        {responseBreached ? (
          <AlertTriangle className="h-3 w-3" />
        ) : (
          <Clock className="h-3 w-3" />
        )}
        <span className="font-medium">Response:</span>
        <span className={cn("font-mono tabular-nums", responseBreached && "font-semibold")}>
          {formatCountdown(responseRemaining)}
        </span>
        {responseBreached && <span className="text-[9px] uppercase font-bold">BREACHED</span>}
      </div>

      {/* Resolution SLA */}
      <div className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-md border",
        resolutionBreached
          ? "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400"
          : resolutionWarning
            ? "border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400"
            : "border-border bg-muted/30 text-muted-foreground",
      )}>
        {resolutionBreached ? (
          <AlertTriangle className="h-3 w-3" />
        ) : (
          <Clock className="h-3 w-3" />
        )}
        <span className="font-medium">Resolution:</span>
        <span className={cn("font-mono tabular-nums", resolutionBreached && "font-semibold")}>
          {formatCountdown(resolutionRemaining)}
        </span>
        {resolutionBreached && <span className="text-[9px] uppercase font-bold">BREACHED</span>}
      </div>
    </div>
  );
}

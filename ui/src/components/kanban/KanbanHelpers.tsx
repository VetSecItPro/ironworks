import type { Issue } from "@ironworksai/shared";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "../../lib/utils";
import type { Agent, KanbanGoalInfo, SwimlaneMode } from "./types";
import { HEALTH_BADGE_COLORS, statusLabel } from "./types";

/* ---- Column Health Indicator ---- */

export function ColumnHealthIndicator({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;
  const now = Date.now();
  const ages = issues.map((i) => (now - new Date(i.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  const avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;
  const color = avgAge > 14 ? "bg-red-500" : avgAge > 7 ? "bg-amber-500" : "bg-emerald-500";
  const label = avgAge < 1 ? "<1d" : `${Math.round(avgAge)}d`;
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground/80" title={`Average card age: ${label}`}>
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", color)} />
      {label} avg
    </span>
  );
}

/* ---- Bulk Operations Bar ---- */

export function BulkOperationsBar({
  selectedCount,
  agents,
  onChangeStatus,
  onChangeAssignee,
  onChangePriority,
  onClear,
}: {
  selectedCount: number;
  agents?: Agent[];
  onChangeStatus: (status: string) => void;
  onChangeAssignee: (agentId: string) => void;
  onChangePriority: (priority: string) => void;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-lg border border-border bg-background/95 backdrop-blur-sm px-4 py-2 shadow-lg">
      <span className="text-sm font-medium">{selectedCount} selected</span>
      <Select onValueChange={onChangeStatus}>
        <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="backlog">Backlog</SelectItem>
          <SelectItem value="todo">Todo</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="in_review">In Review</SelectItem>
          <SelectItem value="done">Done</SelectItem>
        </SelectContent>
      </Select>
      {agents && agents.length > 0 && (
        <Select onValueChange={onChangeAssignee}>
          <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select onValueChange={onChangePriority}>
        <SelectTrigger className="h-7 w-auto min-w-[80px] text-xs">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="critical">Critical</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>
      <button
        onClick={onClear}
        className="ml-1 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Clear selection"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ---- Swimlane Header ---- */

export function SwimlaneHeader({
  label,
  count,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 px-2 py-2 w-full hover:bg-accent/30 rounded transition-colors"
    >
      {collapsed ? (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
    </button>
  );
}

/* ---- Swimlane Toggle Bar ---- */

export function SwimlaneToggle({ mode, onChange }: { mode: SwimlaneMode; onChange: (mode: SwimlaneMode) => void }) {
  const options: { value: SwimlaneMode; label: string }[] = [
    { value: "none", label: "No lanes" },
    { value: "agent", label: "By Agent" },
    { value: "project", label: "By Project" },
    { value: "priority", label: "By Priority" },
  ];

  return (
    <div className="flex items-center gap-1 border border-border rounded-md overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={cn(
            "px-2.5 py-1 text-xs transition-colors",
            mode === opt.value
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
          )}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ---- Goal-Aware Board Header ---- */

export function GoalBoardHeader({ goalInfo }: { goalInfo: KanbanGoalInfo }) {
  const healthLabel = goalInfo.healthStatus?.replace(/_/g, " ") ?? "";
  const healthColor = HEALTH_BADGE_COLORS[goalInfo.healthStatus ?? ""] ?? "bg-muted text-muted-foreground";
  const barColor =
    goalInfo.progressPercent === 100
      ? "bg-emerald-500"
      : goalInfo.progressPercent > 50
        ? "bg-blue-500"
        : "bg-amber-500";

  return (
    <div className="rounded-lg border border-border px-4 py-2.5 space-y-1.5 bg-muted/20">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold truncate">{goalInfo.title}</span>
        {healthLabel && (
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0", healthColor)}>
            {healthLabel}
          </span>
        )}
        <span className="text-xs text-muted-foreground tabular-nums ml-auto shrink-0">
          {Math.round(goalInfo.progressPercent)}%
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", barColor)}
          style={{ width: `${Math.min(100, goalInfo.progressPercent)}%` }}
        />
      </div>
    </div>
  );
}

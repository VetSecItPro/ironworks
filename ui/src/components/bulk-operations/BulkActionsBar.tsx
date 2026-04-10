import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface BulkActionsBarProps {
  selectedCount: number;
  onClear: () => void;
  onMove?: () => void;
  onLabel?: () => void;
  onDelete?: () => void;
  onStatusChange?: (status: string) => void;
  onPriorityChange?: (priority: string) => void;
  className?: string;
}

export function BulkActionsBar({
  selectedCount,
  onClear,
  onMove,
  onLabel,
  onDelete,
  onStatusChange,
  onPriorityChange,
  className,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        "sticky bottom-4 z-30 mx-auto flex w-fit items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200",
        className,
      )}
      role="toolbar"
      aria-label={`Bulk actions for ${selectedCount} selected items`}
    >
      <span className="text-xs font-medium text-muted-foreground">
        {selectedCount} selected
      </span>
      <div className="h-4 w-px bg-border" />

      {onStatusChange && (
        <select
          aria-label="Set status for selected items"
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onStatusChange(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="" disabled>Set status...</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="in_review">In Review</option>
          <option value="done">Done</option>
          <option value="backlog">Backlog</option>
        </select>
      )}

      {onPriorityChange && (
        <select
          aria-label="Set priority for selected items"
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onPriorityChange(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="" disabled>Set priority...</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      )}

      {onMove && (
        <Button variant="ghost" size="sm" onClick={onMove} className="h-7 text-xs gap-1">
          <ArrowRight className="h-3 w-3" />
          Move
        </Button>
      )}

      {onLabel && (
        <Button variant="ghost" size="sm" onClick={onLabel} className="h-7 text-xs gap-1">
          <Tag className="h-3 w-3" />
          Label
        </Button>
      )}

      {onDelete && (
        <Button variant="ghost" size="sm" onClick={onDelete} className="h-7 text-xs gap-1 text-destructive hover:text-destructive">
          <Trash2 className="h-3 w-3" />
          Delete
        </Button>
      )}

      <div className="h-4 w-px bg-border" />
      <Button variant="ghost" size="sm" onClick={onClear} className="h-7 text-xs">
        <X className="h-3 w-3 mr-1" />
        Clear
      </Button>
    </div>
  );
}

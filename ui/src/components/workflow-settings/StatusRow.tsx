import { useState } from "react";
import { ArrowDown, ArrowUp, Check, GripVertical, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "../../lib/utils";
import type { CustomStatus } from "./workflowTypes";
import { COLOR_OPTIONS } from "./workflowTypes";

interface StatusRowProps {
  status: CustomStatus;
  onUpdate: (updated: CustomStatus) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function StatusRow({
  status,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: StatusRowProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(status.label);

  function handleSave() {
    if (label.trim()) {
      onUpdate({ ...status, label: label.trim() });
    }
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-2 py-2 px-2 rounded-md hover:bg-accent/30 group">
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
      <div className={cn("h-3 w-3 rounded-full shrink-0", status.color)} />

      {editing ? (
        <div className="flex items-center gap-1 flex-1">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
            className="h-7 text-xs flex-1"
            autoFocus
          />
          <Button variant="ghost" size="icon-xs" onClick={handleSave}>
            <Check className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={() => setEditing(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <span className="text-sm flex-1">{status.label}</span>
      )}

      <span className={cn(
        "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
        status.category === "open"
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
          : "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
      )}>
        {status.category}
      </span>

      {/* Color picker */}
      <select
        value={status.color}
        onChange={(e) => onUpdate({ ...status, color: e.target.value })}
        className="h-6 text-[10px] bg-muted border border-border rounded px-1"
      >
        {COLOR_OPTIONS.map((c) => (
          <option key={c} value={c}>{c.replace("bg-", "").replace("-500", "")}</option>
        ))}
      </select>

      {/* Category toggle */}
      <button
        className="text-[10px] text-muted-foreground hover:text-foreground"
        onClick={() => onUpdate({ ...status, category: status.category === "open" ? "closed" : "open" })}
      >
        toggle
      </button>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {!editing && (
          <Button variant="ghost" size="icon-xs" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3" />
          </Button>
        )}
        <Button variant="ghost" size="icon-xs" onClick={onMoveUp} disabled={isFirst}>
          <ArrowUp className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onMoveDown} disabled={isLast}>
          <ArrowDown className="h-3 w-3" />
        </Button>
        {!status.isDefault && (
          <Button variant="ghost" size="icon-xs" className="text-destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

import { Plus, Tag } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "../../lib/utils";

interface BulkLabelDialogProps {
  open: boolean;
  onClose: () => void;
  selectedCount: number;
  availableLabels: string[];
  onApply: (labels: string[]) => void;
}

export function BulkLabelDialog({ open, onClose, selectedCount, availableLabels, onApply }: BulkLabelDialogProps) {
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const [newLabel, setNewLabel] = useState("");

  if (!open) return null;

  function toggleLabel(label: string) {
    setSelectedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function addCustomLabel() {
    const trimmed = newLabel.trim();
    if (trimmed && !selectedLabels.has(trimmed)) {
      setSelectedLabels((prev) => new Set([...prev, trimmed]));
      setNewLabel("");
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" role="button" tabIndex={0} aria-label="Close dialog" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); onClose(); } }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Apply Labels"
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <Tag className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Apply Labels</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Apply to {selectedCount} selected issue{selectedCount !== 1 ? "s" : ""}
        </p>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {availableLabels.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => toggleLabel(label)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs border transition-colors",
                selectedLabels.has(label)
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border hover:border-primary/40",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-4">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="New label..."
            aria-label="New label name"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") addCustomLabel();
            }}
          />
          <Button variant="ghost" size="sm" onClick={addCustomLabel} className="h-8 text-xs shrink-0">
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onApply([...selectedLabels]);
              onClose();
            }}
            disabled={selectedLabels.size === 0}
          >
            Apply {selectedLabels.size} label{selectedLabels.size !== 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}

import { Plus, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";

interface LabelsPickerContentProps {
  labelSearch: string;
  setLabelSearch: (v: string) => void;
  inline?: boolean;
  labels: Array<{ id: string; name: string; color: string }>;
  issueLabelIds: string[];
  toggleLabel: (labelId: string) => void;
  deleteLabel: (labelId: string) => void;
  newLabelName: string;
  setNewLabelName: (v: string) => void;
  newLabelColor: string;
  setNewLabelColor: (v: string) => void;
  onCreateLabel: (data: { name: string; color: string }) => void;
  isCreating: boolean;
}

export function LabelsPickerContent({
  labelSearch, setLabelSearch, inline,
  labels, issueLabelIds, toggleLabel, deleteLabel,
  newLabelName, setNewLabelName, newLabelColor, setNewLabelColor,
  onCreateLabel, isCreating,
}: LabelsPickerContentProps) {
  return (
    <>
      <input
        className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/70"
        placeholder="Search labels..."
        value={labelSearch}
        onChange={(e) => setLabelSearch(e.target.value)}
        autoFocus={!inline}
      />
      <div className="max-h-44 overflow-y-auto overscroll-contain space-y-0.5">
        {labels
          .filter((label) => {
            if (!labelSearch.trim()) return true;
            return label.name.toLowerCase().includes(labelSearch.toLowerCase());
          })
          .map((label) => {
            const selected = issueLabelIds.includes(label.id);
            return (
              <div key={label.id} className="flex items-center gap-1">
                <button
                  className={cn(
                    "flex items-center gap-2 flex-1 px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-left",
                    selected && "bg-accent"
                  )}
                  onClick={() => toggleLabel(label.id)}
                >
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                  <span className="truncate">{label.name}</span>
                </button>
                <button
                  type="button"
                  className="p-1 text-muted-foreground hover:text-destructive rounded"
                  onClick={() => deleteLabel(label.id)}
                  title={`Delete ${label.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
      </div>
      <div className="mt-2 border-t border-border pt-2 space-y-1">
        <div className="flex items-center gap-1">
          <input className="h-7 w-7 p-0 rounded bg-transparent" type="color" value={newLabelColor} onChange={(e) => setNewLabelColor(e.target.value)} />
          <input className="flex-1 px-2 py-1.5 text-xs bg-transparent outline-none rounded placeholder:text-muted-foreground/70" placeholder="New label" value={newLabelName} onChange={(e) => setNewLabelName(e.target.value)} />
        </div>
        <button
          className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 text-xs rounded border border-border hover:bg-accent/50 disabled:opacity-50"
          disabled={!newLabelName.trim() || isCreating}
          onClick={() => onCreateLabel({ name: newLabelName.trim(), color: newLabelColor })}
        >
          <Plus className="h-3 w-3" />
          {isCreating ? "Creating..." : "Create label"}
        </button>
      </div>
    </>
  );
}

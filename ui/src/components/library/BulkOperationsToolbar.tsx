import { CheckSquare, Globe, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BulkOperationsToolbar({
  selectedCount,
  onChangeVisibility,
  onDelete,
  onClearSelection,
}: {
  selectedCount: number;
  onChangeVisibility: (visibility: string) => void;
  onDelete: () => void;
  onClearSelection: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-accent/50 border-b border-border text-xs">
      <CheckSquare className="h-3.5 w-3.5 text-primary" />
      <span className="font-medium">{selectedCount} selected</span>
      <div className="flex items-center gap-1 ml-auto">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] px-2"
          onClick={() => onChangeVisibility("company")}
        >
          <Globe className="h-3 w-3 mr-0.5" />
          Public
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] px-2"
          onClick={() => onChangeVisibility("private")}
        >
          <Lock className="h-3 w-3 mr-0.5" />
          Private
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-destructive" onClick={onDelete}>
          <Trash2 className="h-3 w-3 mr-0.5" />
          Delete
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={onClearSelection}>
          Clear
        </Button>
      </div>
    </div>
  );
}

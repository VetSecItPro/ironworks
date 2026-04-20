import { Button } from "@/components/ui/button";
import { cn } from "../../lib/utils";

interface ConfigActionBarProps {
  isMobile: boolean;
  showBar: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Floating save/cancel bar that appears when the agent config or
 * instructions tab has unsaved changes. Renders differently for
 * desktop (sticky float-right) vs mobile (fixed bottom).
 */
export function ConfigActionBar({ isMobile, showBar, isSaving, onSave, onCancel }: ConfigActionBarProps) {
  if (isMobile) {
    if (!showBar) return null;
    return (
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-sm">
        <div
          className="flex items-center justify-end gap-2 px-3 py-2"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
        >
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={isSaving}>
            {isSaving ? "Saving\u2026" : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "sticky top-6 z-10 float-right transition-opacity duration-150",
        showBar ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
    >
      <div className="flex items-center gap-2 bg-background/90 backdrop-blur-sm border border-border rounded-lg px-3 py-1.5 shadow-lg">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={isSaving}>
          {isSaving ? "Saving\u2026" : "Save"}
        </Button>
      </div>
    </div>
  );
}

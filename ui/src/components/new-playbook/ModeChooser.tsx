import { Bot, PenLine } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ModeChooserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectManual: () => void;
  onSelectAuto: () => void;
}

export function ModeChooser({ open, onOpenChange, onSelectManual, onSelectAuto }: ModeChooserProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Playbook</DialogTitle>
          <DialogDescription>How would you like to create your playbook?</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-4">
          <button
            onClick={onSelectManual}
            className="flex flex-col items-center gap-3 p-6 rounded-lg border border-border hover:border-foreground/30 hover:bg-accent/50 transition-colors"
          >
            <PenLine className="h-8 w-8 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">Manual</p>
              <p className="text-xs text-muted-foreground mt-1">Build step-by-step with a form</p>
            </div>
          </button>

          <button
            onClick={onSelectAuto}
            className="flex flex-col items-center gap-3 p-6 rounded-lg border border-border hover:border-foreground/30 hover:bg-accent/50 transition-colors relative"
          >
            <Bot className="h-8 w-8 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">AI-Assisted</p>
              <p className="text-xs text-muted-foreground mt-1">Describe it, AI generates it</p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

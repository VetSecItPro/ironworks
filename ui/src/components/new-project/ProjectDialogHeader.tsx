import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2 } from "lucide-react";

interface ProjectDialogHeaderProps {
  companyName?: string;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  onClose: () => void;
}

export function ProjectDialogHeader({
  companyName,
  expanded,
  setExpanded,
  onClose,
}: ProjectDialogHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {companyName && (
          <span className="bg-muted px-1.5 py-0.5 rounded text-xs font-medium">
            {companyName.slice(0, 3).toUpperCase()}
          </span>
        )}
        <span className="text-muted-foreground/80">&rsaquo;</span>
        <span>New project</span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={onClose}
        >
          <span className="text-lg leading-none">&times;</span>
        </Button>
      </div>
    </div>
  );
}

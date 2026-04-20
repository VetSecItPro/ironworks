import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "../../lib/utils";

export function SkillsPageHeader({
  onScan,
  scanPending,
  onToggleCreate,
}: {
  onScan: () => void;
  scanPending: boolean;
  onToggleCreate: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Reusable capabilities and tools available to your agents.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onScan} disabled={scanPending}>
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", scanPending && "animate-spin")} />
          Scan
        </Button>
        <Button size="sm" onClick={onToggleCreate}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Skill
        </Button>
      </div>
    </div>
  );
}

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DataExportSectionProps {
  isLoading: boolean;
  onExport: () => void;
}

export function DataExportSection({ isLoading, onExport }: DataExportSectionProps) {
  return (
    <div className="space-y-4">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <Download className="h-3.5 w-3.5" />
        Data Export
      </div>
      <div className="rounded-md border border-border px-4 py-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Download all your company data including agents, projects, issues, knowledge base, and activity history.
        </p>
        <p className="text-xs text-muted-foreground italic">API keys and secrets are never included in exports.</p>
        <Button size="sm" variant="outline" onClick={onExport} disabled={isLoading}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {isLoading ? "Generating export..." : "Export my data"}
        </Button>
      </div>
    </div>
  );
}

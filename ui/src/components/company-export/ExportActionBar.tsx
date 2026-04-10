import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportActionBar({
  companyName,
  selectedCount,
  totalFiles,
  warningCount,
  downloadPending,
  onDownload,
}: {
  companyName: string;
  selectedCount: number;
  totalFiles: number;
  warningCount: number;
  downloadPending: boolean;
  onDownload: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 border-b border-border bg-background px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="font-medium">
            {companyName} export
          </span>
          <span className="text-muted-foreground">
            {selectedCount} / {totalFiles} file{totalFiles === 1 ? "" : "s"} selected
          </span>
          {warningCount > 0 && (
            <span className="text-amber-500">
              {warningCount} warning{warningCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <Button
          size="sm"
          onClick={onDownload}
          disabled={selectedCount === 0 || downloadPending}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {downloadPending
            ? "Building export..."
            : `Export ${selectedCount} file${selectedCount === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}

export function ExportWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="mx-5 mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      {warnings.map((w) => (
        <div key={w} className="text-xs text-amber-500">{w}</div>
      ))}
    </div>
  );
}

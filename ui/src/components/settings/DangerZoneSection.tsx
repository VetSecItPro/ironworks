import type { Company } from "@ironworksai/shared";
import { AlertTriangle, Archive, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DangerZoneSectionProps {
  selectedCompany: Company;
  onArchive: () => void;
  onDelete: () => void;
  isArchiving: boolean;
  isDeleting: boolean;
  archiveError: Error | null;
  deleteError: Error | null;
}

export function DangerZoneSection({
  selectedCompany,
  onArchive,
  onDelete,
  isArchiving,
  isDeleting,
  archiveError,
  deleteError,
}: DangerZoneSectionProps) {
  const isArchived = selectedCompany.status === "archived";

  return (
    <div id="danger-zone" className="space-y-4 scroll-mt-6">
      <h2 className="text-xs font-medium text-destructive uppercase tracking-wide flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5" />
        Danger Zone
      </h2>

      {/* Export reminder pinned at top so it's seen before either action runs. */}
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 flex items-start gap-2">
        <Download className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-none" />
        <div className="text-xs text-muted-foreground">
          Before archiving or deleting, export your data first.{" "}
          <a href="#data-privacy" className="underline hover:text-foreground">
            Go to Data Export
          </a>{" "}
          — agents, knowledge base, issues, and activity history. Secrets are excluded by design.
        </div>
      </div>

      {/* Archive — soft, reversible. */}
      <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-4">
        <div className="flex items-start gap-2">
          <Archive className="h-4 w-4 text-muted-foreground mt-0.5 flex-none" />
          <div className="flex-1 space-y-1">
            <div className="text-sm font-medium">Archive company</div>
            <p className="text-xs text-muted-foreground">
              Hides the company from the sidebar. <strong>All data is kept</strong> (agents, channels, knowledge,
              secrets, history). Reversible by an instance admin.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" variant="outline" disabled={isArchiving || isArchived} onClick={onArchive}>
            {isArchiving ? "Archiving..." : isArchived ? "Already archived" : "Archive company"}
          </Button>
          {archiveError && (
            <span className="text-xs text-destructive">
              {archiveError instanceof Error ? archiveError.message : "Failed to archive"}
            </span>
          )}
        </div>
      </div>

      {/* Delete — hard, irreversible. Strong confirmation lives in the handler. */}
      <div className="space-y-2 rounded-md border border-destructive bg-destructive/10 px-4 py-4">
        <div className="flex items-start gap-2">
          <Trash2 className="h-4 w-4 text-destructive mt-0.5 flex-none" />
          <div className="flex-1 space-y-1">
            <div className="text-sm font-medium text-destructive">Delete company permanently</div>
            <p className="text-xs text-muted-foreground">
              <strong className="text-destructive">Cannot be undone.</strong> Wipes everything: agents, heartbeats,
              channels, knowledge base, library files, secrets, issues, activity log. You will be asked to type the
              company name to confirm.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" variant="destructive" disabled={isDeleting} onClick={onDelete}>
            {isDeleting ? "Deleting..." : "Delete company"}
          </Button>
          {deleteError && (
            <span className="text-xs text-destructive">
              {deleteError instanceof Error ? deleteError.message : "Failed to delete"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

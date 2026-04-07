import { Button } from "@/components/ui/button";
import type { Company } from "@ironworksai/shared";

interface DangerZoneSectionProps {
  selectedCompany: Company;
  onArchive: () => void;
  isArchiving: boolean;
  archiveError: Error | null;
}

export function DangerZoneSection({
  selectedCompany,
  onArchive,
  isArchiving,
  archiveError,
}: DangerZoneSectionProps) {
  return (
    <div id="danger-zone" className="space-y-4 scroll-mt-6">
      <h2 className="text-xs font-medium text-destructive uppercase tracking-wide">
        Danger Zone
      </h2>
      <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-4">
        <p className="text-sm text-muted-foreground">
          Archive this company to hide it from the sidebar. This persists in
          the database.
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="destructive"
            disabled={
              isArchiving || selectedCompany.status === "archived"
            }
            onClick={onArchive}
          >
            {isArchiving
              ? "Archiving..."
              : selectedCompany.status === "archived"
                ? "Already archived"
                : "Archive company"}
          </Button>
          {archiveError && (
            <span className="text-xs text-destructive">
              {archiveError instanceof Error
                ? archiveError.message
                : "Failed to archive company"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

import type { KnowledgePage, KnowledgePageRevision } from "../../api/knowledge";
import { Button } from "@/components/ui/button";
import { timeAgo } from "../../lib/timeAgo";
import { Eye, Undo2, X } from "lucide-react";
import { SimpleDiff } from "./SimpleDiff";

export function KBRevisionHistory({
  selectedPage,
  revisions,
  compareRevision,
  compareRevisionData,
  onSetCompareRevision,
  onRevert,
  isReverting,
}: {
  selectedPage: KnowledgePage;
  revisions: KnowledgePageRevision[];
  compareRevision: number | null;
  compareRevisionData: KnowledgePageRevision | null;
  onSetCompareRevision: (rev: number | null) => void;
  onRevert: (revisionNumber: number) => void;
  isReverting: boolean;
}) {
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Revision History</h3>
        {compareRevision !== null && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onSetCompareRevision(null)}>
            <X className="h-3 w-3 mr-1" />Close Diff
          </Button>
        )}
      </div>

      {/* Version diff view */}
      {compareRevision !== null && compareRevisionData && (
        <div className="rounded-lg border border-border p-3 mb-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            Comparing: Revision #{compareRevision} vs Current (#{selectedPage.revisionNumber})
          </div>
          <SimpleDiff oldText={compareRevisionData.body} newText={selectedPage.body} />
        </div>
      )}

      {revisions.map((rev) => (
        <div key={rev.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Revision #{rev.revisionNumber}</div>
            <div className="text-xs text-muted-foreground">
              {rev.changeSummary ?? "No summary"} - {timeAgo(rev.createdAt)}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {rev.revisionNumber !== selectedPage.revisionNumber && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => onSetCompareRevision(
                    compareRevision === rev.revisionNumber ? null : rev.revisionNumber,
                  )}
                >
                  <Eye className="h-3 w-3 mr-1" />{compareRevision === rev.revisionNumber ? "Hide Diff" : "Compare"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={isReverting}
                  onClick={() => onRevert(rev.revisionNumber)}
                >
                  <Undo2 className="h-3 w-3 mr-1" />Revert
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
      {revisions.length === 0 && <p className="text-sm text-muted-foreground">No revisions yet.</p>}
    </div>
  );
}

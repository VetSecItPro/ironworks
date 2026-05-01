import type { IssueDocument } from "@ironworksai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { issuesApi } from "../../api/issues";
import { useToast } from "../../context/ToastContext";
import { queryKeys } from "../../lib/queryKeys";
import { cn, relativeTime } from "../../lib/utils";
import { MarkdownBody } from "../MarkdownBody";

interface DocumentRevisionsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: string;
  doc: IssueDocument | null;
}

/**
 * Drawer listing all revisions of an issue document with body preview and a
 * "Revert to this revision" action. Reverts work via the existing upsert PUT —
 * we send the old body plus the latestRevisionId of the live document so the
 * server's optimistic-concurrency check passes; the revert becomes a brand-new
 * revision rather than a delete-and-replay (so audit history stays intact).
 */
export function DocumentRevisionsDrawer({ open, onOpenChange, issueId, doc }: DocumentRevisionsDrawerProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);

  const revisionsQuery = useQuery({
    queryKey: ["issue-document-revisions", issueId, doc?.key],
    queryFn: () => issuesApi.listDocumentRevisions(issueId, doc!.key),
    enabled: open && !!doc,
  });

  const revertMutation = useMutation({
    mutationFn: async (revisionBody: string) => {
      if (!doc) throw new Error("no document");
      return issuesApi.upsertDocument(issueId, doc.key, {
        title: doc.title,
        format: "markdown",
        body: revisionBody,
        baseRevisionId: doc.latestRevisionId,
      });
    },
    onSuccess: () => {
      pushToast({ title: "Reverted to selected revision", tone: "success" });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.documents(issueId) });
      queryClient.invalidateQueries({ queryKey: ["issue-document-revisions", issueId, doc?.key] });
      onOpenChange(false);
    },
    onError: (err) => {
      pushToast({ title: err instanceof Error ? `Revert failed: ${err.message}` : "Revert failed", tone: "error" });
    },
  });

  const revisions = revisionsQuery.data ?? [];
  const selected = revisions.find((r) => r.id === selectedRevisionId) ?? revisions[0] ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Document revisions
          </SheetTitle>
          <SheetDescription>
            {doc ? <span className="font-mono text-xs">{doc.key}</span> : "No document selected"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 grid grid-cols-[200px_1fr] gap-4 overflow-hidden mt-4">
          <div className="overflow-y-auto border-r border-border pr-2">
            {revisionsQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : revisions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No revisions yet.</p>
            ) : (
              <ul className="space-y-1">
                {revisions.map((rev) => (
                  <li key={rev.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full text-left rounded-md px-2 py-1.5 text-xs hover:bg-accent/50",
                        (selected?.id ?? revisions[0]?.id) === rev.id && "bg-accent",
                      )}
                      onClick={() => setSelectedRevisionId(rev.id)}
                    >
                      <div className="font-medium">v{rev.revisionNumber}</div>
                      <div className="text-muted-foreground text-[10px]">{relativeTime(new Date(rev.createdAt))}</div>
                      {rev.changeSummary ? (
                        <div className="text-muted-foreground text-[10px] truncate" title={rev.changeSummary}>
                          {rev.changeSummary}
                        </div>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="overflow-y-auto pr-2">
            {selected ? (
              <>
                <div className="flex items-center justify-between mb-3 sticky top-0 bg-background py-1">
                  <div className="text-xs text-muted-foreground">
                    Showing v{selected.revisionNumber}
                    {doc && doc.latestRevisionId === selected.id ? " (current)" : ""}
                  </div>
                  {doc && doc.latestRevisionId !== selected.id ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={revertMutation.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Revert ${doc.key} to v${selected.revisionNumber}? This creates a new revision with the old content; previous revisions stay in history.`,
                          )
                        ) {
                          revertMutation.mutate(selected.body);
                        }
                      }}
                    >
                      <RotateCcw className="h-3 w-3 mr-1.5" />
                      {revertMutation.isPending ? "Reverting…" : "Revert to this"}
                    </Button>
                  ) : null}
                </div>
                <MarkdownBody className="text-sm">{selected.body}</MarkdownBody>
              </>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { CheckCircle2, Clock, FileText, RotateCcw, Send, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router";
import type { Deliverable } from "../../api/deliverables";
import { DOC_TYPE_LABELS, formatDeliverableDate } from "./deliverableHelpers";
import { StatusBadge } from "./StatusBadge";

interface DeliverableRowProps {
  deliverable: Deliverable;
  onApprove: (id: string) => void;
  onRequestRevision: (id: string, note: string) => void;
  onReject: (id: string, note: string) => void;
  onDeliver: (id: string) => void;
  isUpdating: boolean;
}

export function DeliverableRow({
  deliverable,
  onApprove,
  onRequestRevision,
  onReject,
  onDeliver,
  isUpdating,
}: DeliverableRowProps) {
  const docTypeLabel = DOC_TYPE_LABELS[deliverable.documentType ?? ""] ?? deliverable.documentType ?? "Document";
  const isInReview = deliverable.deliverableStatus === "review";
  const [showNoteFor, setShowNoteFor] = useState<"revision" | "reject" | null>(null);
  const [reviewerNote, setReviewerNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (showNoteFor && noteRef.current) noteRef.current.focus();
  }, [showNoteFor]);

  const handleSubmitNote = () => {
    if (!reviewerNote.trim()) return;
    if (showNoteFor === "revision") onRequestRevision(deliverable.id, reviewerNote.trim());
    if (showNoteFor === "reject") onReject(deliverable.id, reviewerNote.trim());
    setReviewerNote("");
    setShowNoteFor(null);
  };

  const existingNote = (deliverable as unknown as { reviewerNote?: string }).reviewerNote ?? null;

  return (
    <div className="px-4 py-3 border-b border-border last:border-0 hover:bg-accent/20 transition-colors">
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/knowledge/${deliverable.id}`} className="text-sm font-medium hover:underline truncate">
              {deliverable.title}
            </Link>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
              {docTypeLabel}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            {deliverable.agentName && (
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {deliverable.agentName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDeliverableDate(deliverable.updatedAt)}
            </span>
          </div>
          {existingNote && (
            <div className="mt-1.5 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 border border-border">
              <span className="font-medium">Reviewer note:</span> {existingNote}
            </div>
          )}
        </div>

        <StatusBadge status={deliverable.deliverableStatus} />

        {isInReview && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-600 border-red-200 dark:border-red-800 dark:text-red-400"
              disabled={isUpdating}
              onClick={() => setShowNoteFor(showNoteFor === "reject" ? null : "reject")}
            >
              <XCircle className="h-3 w-3 mr-1" />
              Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={isUpdating}
              onClick={() => setShowNoteFor(showNoteFor === "revision" ? null : "revision")}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Revise
            </Button>
            <Button size="sm" className="h-7 text-xs" disabled={isUpdating} onClick={() => onApprove(deliverable.id)}>
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Approve
            </Button>
          </div>
        )}
        {deliverable.deliverableStatus === "approved" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs shrink-0"
            disabled={isUpdating}
            onClick={() => onDeliver(deliverable.id)}
          >
            <Send className="h-3 w-3 mr-1" />
            Mark Delivered
          </Button>
        )}
      </div>

      {showNoteFor && (
        <div className="mt-2 flex gap-2">
          <textarea
            ref={noteRef}
            value={reviewerNote}
            onChange={(e) => setReviewerNote(e.target.value)}
            placeholder={showNoteFor === "reject" ? "Reason for rejection..." : "What needs to be revised..."}
            className="flex-1 rounded border border-border bg-transparent px-2 py-1.5 text-xs resize-none h-16"
          />
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              variant={showNoteFor === "reject" ? "destructive" : "outline"}
              className="h-7 text-xs"
              disabled={isUpdating || !reviewerNote.trim()}
              onClick={handleSubmitNote}
            >
              {showNoteFor === "reject" ? "Confirm Reject" : "Request Revision"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setShowNoteFor(null);
                setReviewerNote("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Filter,
  GitBranch,
  Link as LinkIcon,
  MessageSquare,
  Send,
  RotateCcw,
  X,
} from "lucide-react";
import { MarkdownBody } from "../components/MarkdownBody";
import { deliverablesApi, type Deliverable } from "../api/deliverables";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "@/lib/router";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  review: { label: "Pending Review", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" },
  delivered: { label: "Delivered", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  "weekly-report": "Weekly Report",
  "monthly-report": "Monthly Report",
  "board-packet": "Board Packet",
  "post-mortem": "Post-Mortem",
  "decision": "Decision",
  "meeting-minutes": "Meeting Minutes",
  "client-update": "Client Update",
  "retrospective": "Retrospective",
};

function StatusBadge({ status }: { status: string | null }) {
  const cfg = STATUS_CONFIG[status ?? "draft"] ?? STATUS_CONFIG.draft;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", cfg.className)}>
      {cfg.label}
    </span>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ------------------------------------------------------------------ */
/*  Deliverable Row                                                    */
/* ------------------------------------------------------------------ */

interface DeliverableRowProps {
  deliverable: Deliverable;
  onApprove: (id: string) => void;
  onRequestRevision: (id: string) => void;
  isUpdating: boolean;
}

function DeliverableRow({ deliverable, onApprove, onRequestRevision, isUpdating }: DeliverableRowProps) {
  const docTypeLabel = DOC_TYPE_LABELS[deliverable.documentType ?? ""] ?? deliverable.documentType ?? "Document";
  const isInReview = deliverable.deliverableStatus === "review";

  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0 hover:bg-accent/20 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={`/knowledge/${deliverable.id}`}
            className="text-sm font-medium hover:underline truncate"
          >
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
            {formatDate(deliverable.updatedAt)}
          </span>
        </div>
      </div>

      <StatusBadge status={deliverable.deliverableStatus} />

      {isInReview && (
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={isUpdating}
            onClick={() => onRequestRevision(deliverable.id)}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Revise
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={isUpdating}
            onClick={() => onApprove(deliverable.id)}
          >
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
          onClick={() => {
            deliverablesApi.updateStatus(deliverable.companyId, deliverable.id, "delivered");
          }}
        >
          <Send className="h-3 w-3 mr-1" />
          Mark Delivered
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Deliverable Preview Panel (markdown/code rendering) (12.20)        */
/* ------------------------------------------------------------------ */

function DeliverablePreview({
  deliverable,
  onClose,
}: {
  deliverable: Deliverable;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"preview" | "versions" | "annotations">("preview");

  // Mock version history (12.20)
  const versions = [
    { version: "v3", date: deliverable.updatedAt, author: deliverable.agentName ?? "Agent", current: true },
    { version: "v2", date: new Date(new Date(deliverable.updatedAt).getTime() - 86400000 * 2).toISOString(), author: deliverable.agentName ?? "Agent", current: false },
    { version: "v1", date: new Date(new Date(deliverable.updatedAt).getTime() - 86400000 * 5).toISOString(), author: deliverable.agentName ?? "Agent", current: false },
  ];

  // Mock annotations (12.20)
  const [annotations, setAnnotations] = useState<Array<{ line: number; text: string; author: string }>>([
    { line: 3, text: "Consider adding more context here", author: "CTO" },
    { line: 7, text: "Numbers need verification", author: "CFO" },
  ]);
  const [newAnnotation, setNewAnnotation] = useState("");
  const [annotatingLine, setAnnotatingLine] = useState<number | null>(null);

  // Mock linked issue (12.20)
  const linkedIssue = deliverable.title.includes("Report")
    ? { id: "IW-42", title: "Generate weekly board report" }
    : null;

  return (
    <div className="fixed inset-y-0 right-0 w-[500px] max-w-full bg-background border-l border-border shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold truncate">{deliverable.title}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <StatusBadge status={deliverable.deliverableStatus} />
            {linkedIssue && (
              <Link
                to={`/issues/${linkedIssue.id}`}
                className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:underline"
              >
                <LinkIcon className="h-2.5 w-2.5" />
                {linkedIssue.id}
              </Link>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-border shrink-0">
        {(["preview", "versions", "annotations"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-xs font-medium border-b-2 transition-colors capitalize",
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === "preview" && <Eye className="h-3 w-3 inline mr-1" />}
            {tab === "versions" && <GitBranch className="h-3 w-3 inline mr-1" />}
            {tab === "annotations" && <MessageSquare className="h-3 w-3 inline mr-1" />}
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "preview" && (
          <div className="p-4">
            {(deliverable as unknown as { body?: string }).body ? (
              <MarkdownBody>{(deliverable as unknown as { body?: string }).body!}</MarkdownBody>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No content available for preview
              </div>
            )}
          </div>
        )}

        {activeTab === "versions" && (
          <div className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground mb-3">Deliverable version timeline</p>
            {versions.map((v, i) => (
              <div
                key={v.version}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                  v.current ? "border-primary/30 bg-primary/5" : "border-border hover:bg-accent/20",
                )}
              >
                <div className="flex flex-col items-center">
                  <span className={cn(
                    "text-xs font-bold px-2 py-0.5 rounded",
                    v.current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}>
                    {v.version}
                  </span>
                  {i < versions.length - 1 && <div className="w-px h-4 bg-border mt-1" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{v.author}</span>
                    {v.current && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-medium">Current</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDate(v.date)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "annotations" && (
          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">Click-to-comment annotations on specific lines</p>
            {annotations.map((ann, i) => (
              <div key={i} className="flex gap-2 p-2 rounded-md border border-border bg-muted/10">
                <div className="flex items-center justify-center h-5 w-5 rounded bg-muted text-[10px] font-mono font-bold text-muted-foreground shrink-0 mt-0.5">
                  L{ann.line}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs">{ann.text}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">by {ann.author}</p>
                </div>
              </div>
            ))}
            {/* Add annotation */}
            <div className="flex gap-2 mt-2">
              <input
                type="number"
                min={1}
                className="w-14 rounded border border-border bg-transparent px-2 py-1.5 text-xs"
                placeholder="Line"
                value={annotatingLine ?? ""}
                onChange={(e) => setAnnotatingLine(e.target.value ? Number(e.target.value) : null)}
              />
              <input
                className="flex-1 rounded border border-border bg-transparent px-2 py-1.5 text-xs"
                placeholder="Add comment..."
                value={newAnnotation}
                onChange={(e) => setNewAnnotation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newAnnotation.trim() && annotatingLine) {
                    setAnnotations([...annotations, { line: annotatingLine, text: newAnnotation.trim(), author: "You" }]);
                    setNewAnnotation("");
                    setAnnotatingLine(null);
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Deliverables Page                                             */
/* ------------------------------------------------------------------ */

export function Deliverables() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [previewDeliverable, setPreviewDeliverable] = useState<Deliverable | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Deliverables" }]);
  }, [setBreadcrumbs]);

  const { data: deliverables, isLoading } = useQuery({
    queryKey: ["deliverables", selectedCompanyId, statusFilter],
    queryFn: () => deliverablesApi.list(selectedCompanyId!, statusFilter === "all" ? undefined : statusFilter),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      deliverablesApi.updateStatus(selectedCompanyId!, id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliverables", selectedCompanyId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) });
    },
    onError: () => {
      pushToast({ title: "Failed to update deliverable status", tone: "error" });
    },
  });

  const pendingReviewCount = (deliverables ?? []).filter((d) => d.deliverableStatus === "review").length;

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Deliverables</h1>
          {pendingReviewCount > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {pendingReviewCount} pending review
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="review">Pending Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!deliverables || deliverables.length === 0 ? (
          <EmptyState
            icon={FileText}
            message="No deliverables yet. Auto-generated reports, board packets, and other documents will appear here."
          />
        ) : (
          <div className="divide-y divide-border">
            {deliverables.map((d) => (
              <div key={d.id} className="flex items-center">
                <div className="flex-1 min-w-0">
                  <DeliverableRow
                    deliverable={d}
                    isUpdating={updateMutation.isPending}
                    onApprove={(id) => updateMutation.mutate({ id, status: "approved" })}
                    onRequestRevision={(id) => updateMutation.mutate({ id, status: "draft" })}
                  />
                </div>
                {/* Preview button (12.20) */}
                <button
                  onClick={() => setPreviewDeliverable(d)}
                  className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title="Preview deliverable"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Panel (12.20) */}
      {previewDeliverable && (
        <DeliverablePreview
          deliverable={previewDeliverable}
          onClose={() => setPreviewDeliverable(null)}
        />
      )}
    </div>
  );
}

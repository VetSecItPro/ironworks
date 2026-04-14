import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FileText, Filter } from "lucide-react";
import { deliverablesApi, type Deliverable } from "../api/deliverables";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { DeliverableRow, DeliverablePreview } from "@/components/deliverables";

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
    mutationFn: ({ id, status, reviewerNote }: { id: string; status: string; reviewerNote?: string }) =>
      deliverablesApi.updateStatus(selectedCompanyId!, id, status, reviewerNote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliverables", selectedCompanyId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) });
    },
    onError: () => {
      pushToast({ title: "Failed to update deliverable status", tone: "error" });
    },
  });

  const pendingReviewCount = (deliverables ?? []).filter((d) => d.deliverableStatus === "review").length;

  if (isLoading && !deliverables) return <PageSkeleton />;

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
              <SelectItem value="revision_requested">Revision Requested</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
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
                    onRequestRevision={(id, note) => updateMutation.mutate({ id, status: "revision_requested", reviewerNote: note })}
                    onReject={(id, note) => updateMutation.mutate({ id, status: "rejected", reviewerNote: note })}
                    onDeliver={(id) => updateMutation.mutate({ id, status: "delivered" })}
                  />
                </div>
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

      {previewDeliverable && (
        <DeliverablePreview
          deliverable={previewDeliverable}
          onClose={() => setPreviewDeliverable(null)}
        />
      )}
    </div>
  );
}

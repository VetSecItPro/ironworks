import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Link2, Plus, X } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "@/lib/router";
import { cn, relativeTime } from "@/lib/utils";
import { approvalsApi } from "../../api/approvals";
import { issuesApi } from "../../api/issues";
import { useToast } from "../../context/ToastContext";
import { queryKeys } from "../../lib/queryKeys";

interface Approval {
  id: string;
  type: string;
  status: string;
  createdAt: string | Date;
}

interface IssueApprovalsSectionProps {
  issueId: string;
  companyId: string;
  linkedApprovals: Approval[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IssueApprovalsSection({
  issueId,
  companyId,
  linkedApprovals,
  open,
  onOpenChange,
}: IssueApprovalsSectionProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);

  const pendingQuery = useQuery({
    queryKey: ["approvals", "pending", companyId],
    queryFn: () => approvalsApi.list(companyId, "pending"),
    enabled: pickerOpen,
  });

  const linkMutation = useMutation({
    mutationFn: (approvalId: string) => issuesApi.linkApproval(issueId, approvalId),
    onSuccess: () => {
      pushToast({ title: "Approval linked", tone: "success" });
      setPickerOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.approvals(issueId) });
    },
    onError: (err) =>
      pushToast({ title: err instanceof Error ? `Link failed: ${err.message}` : "Link failed", tone: "error" }),
  });

  const unlinkMutation = useMutation({
    mutationFn: (approvalId: string) => issuesApi.unlinkApproval(issueId, approvalId),
    onSuccess: () => {
      pushToast({ title: "Approval unlinked", tone: "success" });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.approvals(issueId) });
    },
    onError: (err) =>
      pushToast({ title: err instanceof Error ? `Unlink failed: ${err.message}` : "Unlink failed", tone: "error" }),
  });

  const linkedIds = new Set(linkedApprovals.map((a) => a.id));
  const linkable = (pendingQuery.data ?? []).filter((a) => !linkedIds.has(a.id));

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="rounded-lg border border-border">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left">
        <span className="text-sm font-medium text-muted-foreground">Linked Approvals ({linkedApprovals.length})</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border divide-y divide-border">
          {linkedApprovals.map((approval) => (
            <div
              key={approval.id}
              className="flex items-center justify-between px-3 py-2 text-xs hover:bg-accent/20 transition-colors"
            >
              <Link to={`/approvals/${approval.id}`} className="flex items-center gap-2 flex-1 min-w-0">
                <StatusBadge status={approval.status} />
                <span className="font-medium">
                  {approval.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
                <span className="font-mono text-muted-foreground">{approval.id.slice(0, 8)}</span>
              </Link>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-muted-foreground">{relativeTime(approval.createdAt)}</span>
                <button
                  type="button"
                  aria-label="Unlink approval"
                  title="Unlink"
                  onClick={() => unlinkMutation.mutate(approval.id)}
                  disabled={unlinkMutation.isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
          <div className="px-3 py-2">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                  <Plus className="h-3 w-3 mr-1" />
                  Link approval
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-1" align="start">
                <div className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Pending approvals (workspace)
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {pendingQuery.isLoading ? (
                    <p className="px-2 py-2 text-xs text-muted-foreground">Loading…</p>
                  ) : linkable.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-muted-foreground">No pending approvals to link.</p>
                  ) : (
                    linkable.map((a) => (
                      <button
                        type="button"
                        key={a.id}
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-left"
                        onClick={() => linkMutation.mutate(a.id)}
                        disabled={linkMutation.isPending}
                      >
                        <Link2 className="h-3 w-3 shrink-0" />
                        <span className="font-medium truncate">
                          {a.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                        <span className="font-mono text-muted-foreground text-[10px] ml-auto shrink-0">
                          {a.id.slice(0, 8)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

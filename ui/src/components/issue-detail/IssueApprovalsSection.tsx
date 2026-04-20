import { ChevronDown } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link } from "@/lib/router";
import { cn, relativeTime } from "@/lib/utils";

interface Approval {
  id: string;
  type: string;
  status: string;
  createdAt: string | Date;
}

interface IssueApprovalsSectionProps {
  linkedApprovals: Approval[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IssueApprovalsSection({ linkedApprovals, open, onOpenChange }: IssueApprovalsSectionProps) {
  if (linkedApprovals.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="rounded-lg border border-border">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left">
        <span className="text-sm font-medium text-muted-foreground">Linked Approvals ({linkedApprovals.length})</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border divide-y divide-border">
          {linkedApprovals.map((approval) => (
            <Link
              key={approval.id}
              to={`/approvals/${approval.id}`}
              className="flex items-center justify-between px-3 py-2 text-xs hover:bg-accent/20 transition-colors"
            >
              <div className="flex items-center gap-2">
                <StatusBadge status={approval.status} />
                <span className="font-medium">
                  {approval.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
                <span className="font-mono text-muted-foreground">{approval.id.slice(0, 8)}</span>
              </div>
              <span className="text-muted-foreground">{relativeTime(approval.createdAt)}</span>
            </Link>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

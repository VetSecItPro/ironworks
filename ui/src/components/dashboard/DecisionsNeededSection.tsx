import { Briefcase, ShieldCheck, UserPlus } from "lucide-react";
import { Link } from "@/lib/router";

export function DecisionsNeededSection({
  pendingHiringCount,
  pendingApprovalsCount,
}: {
  pendingHiringCount: number;
  pendingApprovalsCount: number;
}) {
  if (pendingHiringCount === 0 && pendingApprovalsCount === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-400 flex items-center gap-2">
        <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
        Decisions Needed
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {pendingHiringCount > 0 && (
          <Link
            to="/hiring"
            className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-4 py-3 no-underline text-inherit hover:bg-amber-500/10 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <UserPlus className="h-4 w-4 text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  {pendingHiringCount} hiring request{pendingHiringCount !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-muted-foreground">Pending review</p>
              </div>
            </div>
            <span className="text-xs text-amber-400 shrink-0">Review</span>
          </Link>
        )}
        {pendingApprovalsCount > 0 && (
          <Link
            to="/approvals"
            className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-4 py-3 no-underline text-inherit hover:bg-amber-500/10 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  {pendingApprovalsCount} pending approval{pendingApprovalsCount !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-muted-foreground">Awaiting board review</p>
              </div>
            </div>
            <span className="text-xs text-amber-400 shrink-0">Review</span>
          </Link>
        )}
      </div>
    </div>
  );
}

import { Link } from "@/lib/router";
import type { Issue } from "@ironworksai/shared";
import { StatusIcon } from "../StatusIcon";
import { cn } from "../../lib/utils";

interface DepListViewProps {
  blockers: Issue[];
  blocked: Issue[];
  criticalPath: Set<string>;
}

export function DepListView({ blockers, blocked, criticalPath }: DepListViewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {blockers.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Blocked by ({blockers.length})
          </h4>
          <div className="border border-border rounded-lg divide-y divide-border">
            {blockers.map((b) => (
              <Link
                key={b.id}
                to={`/issues/${b.identifier ?? b.id}`}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent/20 transition-colors",
                  criticalPath.has(b.id) && "border-l-2 border-l-amber-500",
                )}
              >
                <StatusIcon status={b.status} />
                <span className="font-mono text-muted-foreground shrink-0">
                  {b.identifier ?? b.id.slice(0, 8)}
                </span>
                <span className="truncate">{b.title}</span>
                {criticalPath.has(b.id) && (
                  <span className="ml-auto text-[10px] font-medium text-amber-500">CRITICAL</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {blocked.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Blocks ({blocked.length})
          </h4>
          <div className="border border-border rounded-lg divide-y divide-border">
            {blocked.map((b) => (
              <Link
                key={b.id}
                to={`/issues/${b.identifier ?? b.id}`}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent/20 transition-colors",
                  criticalPath.has(b.id) && "border-l-2 border-l-amber-500",
                )}
              >
                <StatusIcon status={b.status} />
                <span className="font-mono text-muted-foreground shrink-0">
                  {b.identifier ?? b.id.slice(0, 8)}
                </span>
                <span className="truncate">{b.title}</span>
                {criticalPath.has(b.id) && (
                  <span className="ml-auto text-[10px] font-medium text-amber-500">CRITICAL</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Issue } from "@ironworksai/shared";
import { AlertTriangle, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { memo, useRef } from "react";
import { cn } from "../../lib/utils";
import { HelpBeacon } from "../HelpBeacon";
import { KanbanCard } from "../KanbanCard";
import { StatusIcon } from "../StatusIcon";
import { ColumnHealthIndicator } from "./KanbanHelpers";
import type { Agent } from "./types";
import { STATUS_COLUMN_TINTS, statusLabel } from "./types";

export const KanbanColumn = memo(function KanbanColumn({
  status,
  issues,
  agents,
  liveIssueIds,
  wipLimit,
  collapsed,
  onToggleCollapse,
  onQuickCreate,
}: {
  status: string;
  issues: Issue[];
  agents?: Agent[];
  liveIssueIds?: Set<string>;
  wipLimit?: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onQuickCreate: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const count = issues.length;
  const atLimit = wipLimit !== undefined && count >= wipLimit;
  const overLimit = wipLimit !== undefined && count > wipLimit;

  const columnRef = useRef<HTMLDivElement>(null);

  return (
    <div className={cn("flex flex-col min-w-[280px] w-[280px] shrink-0")}>
      {/* Column Header */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 mb-1 rounded-t-lg",
          overLimit && "bg-red-500/10",
          atLimit && !overLimit && "bg-amber-500/10",
        )}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <StatusIcon status={status} />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {statusLabel(status)}
          </span>
        </button>

        <span
          className={cn(
            "text-xs tabular-nums font-medium px-1.5 py-0.5 rounded-full",
            overLimit
              ? "bg-red-500/20 text-red-500"
              : atLimit
                ? "bg-amber-500/20 text-amber-500"
                : "text-muted-foreground/80",
          )}
        >
          {count}
          {wipLimit !== undefined && <span className="text-muted-foreground/40">/{wipLimit}</span>}
        </span>
        {wipLimit !== undefined && (
          <HelpBeacon text="WIP (Work In Progress) limits cap how many issues can be in this column at once. When the limit is reached, the count turns amber. Going over turns it red. This helps prevent overloading agents with too many concurrent tasks." />
        )}

        {overLimit && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}

        <ColumnHealthIndicator issues={issues} />

        <button
          type="button"
          onClick={onQuickCreate}
          className="ml-auto p-0.5 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
          title={`Create issue in ${statusLabel(status)}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Column Body */}
      {!collapsed && (
        <div
          ref={(node) => {
            setNodeRef(node);
            (columnRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }}
          className={cn(
            "flex-1 min-h-[120px] rounded-b-lg p-1.5 transition-colors overflow-y-auto",
            "scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent",
            isOver ? "bg-accent/40 ring-1 ring-primary/20" : (STATUS_COLUMN_TINTS[status] ?? "bg-muted/20"),
          )}
          style={{ maxHeight: "calc(100vh - 220px)" }}
        >
          <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {issues.map((issue) => (
                <KanbanCard
                  key={issue.id}
                  issue={issue}
                  agents={agents}
                  isLive={liveIssueIds?.has(issue.id)}
                  isBlocked={issue.status === "blocked"}
                />
              ))}
            </div>
          </SortableContext>

          {issues.length === 0 && (
            <div className="flex items-center justify-center h-20 border-2 border-dashed border-border/40 rounded-lg">
              <span className="text-xs text-muted-foreground/70">No items</span>
            </div>
          )}
        </div>
      )}

      {collapsed && (
        <div className="flex-1 min-h-[40px] rounded-b-lg bg-muted/10 flex items-center justify-center">
          <span className="text-xs text-muted-foreground/40">
            {count} item{count !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
});

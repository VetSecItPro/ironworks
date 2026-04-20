import React from "react";
import { Link } from "@/lib/router";
import { useDialog } from "../../context/DialogContext";
import { agentUrl, cn, formatCents } from "../../lib/utils";
import { Identity } from "../Identity";
import { type AgentPerfRow, RATING_COLORS } from "./ratingUtils";

/* ── Expanded Row Detail ── */

export function ExpandedRowDetail({ row }: { row: AgentPerfRow }) {
  return (
    <tr>
      <td colSpan={9} className="bg-muted/20 px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Throughput</p>
            <p className="text-lg font-bold tabular-nums">{row.throughput > 0 ? row.throughput.toFixed(2) : "0"}</p>
            <p className="text-[10px] text-muted-foreground">tasks/day</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Composite Score</p>
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold tabular-nums">{row.ratingScore}</p>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-[80px]">
                <div
                  className={cn(
                    "h-full rounded-full",
                    row.ratingScore >= 80 ? "bg-emerald-500" : row.ratingScore >= 50 ? "bg-amber-500" : "bg-red-500",
                  )}
                  style={{ width: `${row.ratingScore}%` }}
                />
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">In Progress</p>
            <p className="text-lg font-bold tabular-nums">{row.tasksInProgress}</p>
            <p className="text-[10px] text-muted-foreground">active tasks</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Spend</p>
            <p className="text-lg font-bold tabular-nums">{formatCents(row.totalSpendCents)}</p>
            <p className="text-[10px] text-muted-foreground">
              {row.tasksDone > 0 ? `${formatCents(Math.round(row.totalSpendCents / row.tasksDone))}/task` : "no tasks"}
            </p>
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ── PIP description builder ── */

function pipDescription(row: AgentPerfRow): string {
  return `## Performance Improvement Plan\n\n**Agent:** ${row.name}\n**Current Rating:** ${row.rating}\n**Cost/Task:** ${row.costPerTask !== null ? formatCents(Math.round(row.costPerTask)) : "N/A"}\n**Avg Close Time:** ${row.avgCloseH !== null ? `${row.avgCloseH.toFixed(1)}h` : "N/A"}\n**Completion Rate:** ${row.completionRate}%\n\n### Recommended Actions\n\n- [ ] Review SOUL.md and AGENTS.md for clarity\n- [ ] Check if assigned tasks match agent's role\n- [ ] Consider switching to a more cost-effective model\n- [ ] Simplify task instructions\n- [ ] Re-evaluate after 1 week`;
}

/* ── Mobile Card ── */

export function MobileCard({ row }: { row: AgentPerfRow; prevScoreMap: Map<string, number> }) {
  const { openNewIssue } = useDialog();
  return (
    <div key={row.agentId} className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "inline-flex items-center justify-center h-6 w-6 rounded border text-xs font-bold shrink-0",
              RATING_COLORS[row.rating],
            )}
          >
            {row.rating}
          </span>
          <Link
            to={agentUrl({ id: row.agentId, urlKey: null, name: null })}
            className="no-underline text-inherit font-medium truncate"
          >
            {row.name}
          </Link>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground shrink-0">
          {row.tasksDone} done{row.tasksInProgress > 0 && <span> +{row.tasksInProgress}</span>}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm tabular-nums">
        <div>
          <div className="text-xs text-muted-foreground/80">$/task</div>
          <div className="text-muted-foreground">
            {row.costPerTask !== null ? formatCents(Math.round(row.costPerTask)) : "-"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground/80">Avg time</div>
          <div className="text-muted-foreground">{row.avgCloseH !== null ? `${row.avgCloseH.toFixed(1)}h` : "-"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground/80">Completion</div>
          <div className="text-muted-foreground">{row.completionRate}%</div>
        </div>
      </div>
      {(row.rating === "D" || row.rating === "F") && row.tasksDone > 0 && (
        <button type="button"
          className="text-[10px] text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
          onClick={() =>
            openNewIssue({
              title: `Performance Review: ${row.name} - rating ${row.rating}`,
              description: pipDescription(row),
            })
          }
        >
          Create PIP
        </button>
      )}
    </div>
  );
}

/* ── Desktop Table Row ── */

export function DesktopRow({
  row,
  prevScoreMap,
  expandedRowId,
  onToggleExpand,
}: {
  row: AgentPerfRow;
  prevScoreMap: Map<string, number>;
  expandedRowId: string | null;
  onToggleExpand: (id: string) => void;
}) {
  const { openNewIssue } = useDialog();

  return (
    <React.Fragment key={row.agentId}>
      <tr className="hover:bg-accent/30 transition-colors cursor-pointer" onClick={() => onToggleExpand(row.agentId)}>
        <td className="px-4 py-3">
          <Link
            to={agentUrl({ id: row.agentId, urlKey: null, name: null })}
            className="no-underline text-inherit"
            onClick={(e) => e.stopPropagation()}
          >
            <Identity name={row.name} size="sm" />
          </Link>
        </td>
        <td className="px-4 py-3 text-center">
          <span
            className={cn(
              "inline-flex items-center justify-center h-7 w-7 rounded-lg border text-xs font-bold",
              RATING_COLORS[row.rating],
            )}
          >
            {row.rating}
          </span>
        </td>
        <td className="px-4 py-3 text-center tabular-nums">
          {row.tasksDone}
          {row.tasksInProgress > 0 && <span className="text-muted-foreground ml-1">+{row.tasksInProgress}</span>}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
          {row.throughput > 0 ? row.throughput.toFixed(1) : "-"}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
          {row.avgCloseH !== null ? `${row.avgCloseH.toFixed(1)}h` : "-"}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
          {row.costPerTask !== null ? formatCents(Math.round(row.costPerTask)) : "-"}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">{formatCents(row.totalSpendCents)}</td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  row.completionRate >= 80
                    ? "bg-emerald-500"
                    : row.completionRate >= 50
                      ? "bg-amber-500"
                      : "bg-red-500",
                )}
                style={{ width: `${row.completionRate}%` }}
              />
            </div>
            <span className="text-sm text-muted-foreground tabular-nums w-8 text-right">{row.completionRate}%</span>
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          {(row.rating === "D" || row.rating === "F") && row.tasksDone > 0 ? (
            <button type="button"
              className="text-[10px] text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                openNewIssue({
                  title: `Performance Review: ${row.name} - rating ${row.rating}`,
                  description: pipDescription(row),
                });
              }}
            >
              Create PIP
            </button>
          ) : null}
        </td>
      </tr>
      {expandedRowId === row.agentId && <ExpandedRowDetail row={row} />}
    </React.Fragment>
  );
}

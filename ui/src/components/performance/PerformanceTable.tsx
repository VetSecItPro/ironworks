import React from "react";
import { Link } from "@/lib/router";
import { cn, formatCents, agentUrl } from "../../lib/utils";
import { Identity } from "../Identity";
import { RATING_COLORS, type AgentPerfRow, type SortField } from "./ratingUtils";
import { useDialog } from "../../context/DialogContext";

/* ── Sort Header ── */

export function SortHeader({
  field,
  label,
  current,
  dir,
  onToggle,
  align = "right",
  className,
}: {
  field: SortField;
  label: string;
  current: SortField;
  dir: "asc" | "desc";
  onToggle: (field: SortField) => void;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-3",
        align === "center"
          ? "text-center"
          : align === "left"
            ? "text-left"
            : "text-right",
        className,
      )}
    >
      <button
        className={cn(
          "text-xs font-medium uppercase tracking-wider transition-colors",
          current === field
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => onToggle(field)}
      >
        {label}
        {current === field && (
          <span className="ml-0.5">{dir === "asc" ? "↑" : "↓"}</span>
        )}
      </button>
    </th>
  );
}

/* ── Expanded Row Detail ── */

function ExpandedRowDetail({ row }: { row: AgentPerfRow }) {
  return (
    <tr>
      <td colSpan={9} className="bg-muted/20 px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Throughput
            </p>
            <p className="text-lg font-bold tabular-nums">
              {row.throughput > 0 ? row.throughput.toFixed(2) : "0"}
            </p>
            <p className="text-[10px] text-muted-foreground">tasks/day</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Composite Score
            </p>
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold tabular-nums">{row.ratingScore}</p>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-[80px]">
                <div
                  className={cn(
                    "h-full rounded-full",
                    row.ratingScore >= 80
                      ? "bg-emerald-500"
                      : row.ratingScore >= 50
                        ? "bg-amber-500"
                        : "bg-red-500",
                  )}
                  style={{ width: `${row.ratingScore}%` }}
                />
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              In Progress
            </p>
            <p className="text-lg font-bold tabular-nums">
              {row.tasksInProgress}
            </p>
            <p className="text-[10px] text-muted-foreground">active tasks</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Total Spend
            </p>
            <p className="text-lg font-bold tabular-nums">
              {formatCents(row.totalSpendCents)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {row.tasksDone > 0
                ? `${formatCents(Math.round(row.totalSpendCents / row.tasksDone))}/task`
                : "no tasks"}
            </p>
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ── Mobile Card ── */

function MobileCard({
  row,
  prevScoreMap,
}: {
  row: AgentPerfRow;
  prevScoreMap: Map<string, number>;
}) {
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
          {row.tasksDone} done
          {row.tasksInProgress > 0 && <span> +{row.tasksInProgress}</span>}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm tabular-nums">
        <div>
          <div className="text-xs text-muted-foreground/80">$/task</div>
          <div className="text-muted-foreground">
            {row.costPerTask !== null
              ? formatCents(Math.round(row.costPerTask))
              : "-"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground/80">Avg time</div>
          <div className="text-muted-foreground">
            {row.avgCloseH !== null ? `${row.avgCloseH.toFixed(1)}h` : "-"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground/80">Completion</div>
          <div className="text-muted-foreground">{row.completionRate}%</div>
        </div>
      </div>
      {(row.rating === "D" || row.rating === "F") && row.tasksDone > 0 && (
        <button
          className="text-[10px] text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
          onClick={() =>
            openNewIssue({
              title: `Performance Review: ${row.name} - rating ${row.rating}`,
              description: `## Performance Improvement Plan\n\n**Agent:** ${row.name}\n**Current Rating:** ${row.rating}\n**Cost/Task:** ${row.costPerTask !== null ? formatCents(Math.round(row.costPerTask)) : "N/A"}\n**Avg Close Time:** ${row.avgCloseH !== null ? `${row.avgCloseH.toFixed(1)}h` : "N/A"}\n**Completion Rate:** ${row.completionRate}%\n\n### Recommended Actions\n\n- [ ] Review SOUL.md and AGENTS.md for clarity\n- [ ] Check if assigned tasks match agent's role\n- [ ] Consider switching to a more cost-effective model\n- [ ] Simplify task instructions\n- [ ] Re-evaluate after 1 week`,
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

function DesktopRow({
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
  const prev = prevScoreMap.get(row.agentId);
  const delta = prev !== undefined ? row.ratingScore - prev : null;

  return (
    <React.Fragment key={row.agentId}>
      <tr
        className="hover:bg-accent/30 transition-colors cursor-pointer"
        onClick={() => onToggleExpand(row.agentId)}
      >
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
          {row.tasksInProgress > 0 && (
            <span className="text-muted-foreground ml-1">
              +{row.tasksInProgress}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
          {row.throughput > 0 ? row.throughput.toFixed(1) : "-"}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
          {row.avgCloseH !== null ? `${row.avgCloseH.toFixed(1)}h` : "-"}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
          {row.costPerTask !== null
            ? formatCents(Math.round(row.costPerTask))
            : "-"}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {formatCents(row.totalSpendCents)}
        </td>
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
            <span className="text-sm text-muted-foreground tabular-nums w-8 text-right">
              {row.completionRate}%
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          {(row.rating === "D" || row.rating === "F") && row.tasksDone > 0 ? (
            <button
              className="text-[10px] text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                openNewIssue({
                  title: `Performance Review: ${row.name} - rating ${row.rating}`,
                  description: `## Performance Improvement Plan\n\n**Agent:** ${row.name}\n**Current Rating:** ${row.rating}\n**Cost/Task:** ${row.costPerTask !== null ? formatCents(Math.round(row.costPerTask)) : "N/A"}\n**Avg Close Time:** ${row.avgCloseH !== null ? `${row.avgCloseH.toFixed(1)}h` : "N/A"}\n**Completion Rate:** ${row.completionRate}%\n\n### Recommended Actions\n\n- [ ] Review SOUL.md and AGENTS.md for clarity\n- [ ] Check if assigned tasks match agent's role\n- [ ] Consider switching to a more cost-effective model\n- [ ] Simplify task instructions\n- [ ] Re-evaluate after 1 week`,
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

/* ── Performance Table ── */

export function PerformanceTable({
  sorted,
  sortField,
  sortDir,
  prevScoreMap,
  expandedRowId,
  onToggleExpand,
  onToggleSort,
}: {
  sorted: AgentPerfRow[];
  sortField: SortField;
  sortDir: "asc" | "desc";
  prevScoreMap: Map<string, number>;
  expandedRowId: string | null;
  onToggleExpand: (id: string) => void;
  onToggleSort: (field: SortField) => void;
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Mobile card view */}
      <div className="md:hidden divide-y divide-border">
        {sorted.map((row) => (
          <MobileCard key={row.agentId} row={row} prevScoreMap={prevScoreMap} />
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Agent
              </th>
              <SortHeader
                field="rating"
                label="Rating"
                current={sortField}
                dir={sortDir}
                onToggle={onToggleSort}
                align="center"
              />
              <SortHeader
                field="tasksDone"
                label="Done"
                current={sortField}
                dir={sortDir}
                onToggle={onToggleSort}
                align="center"
              />
              <SortHeader
                field="throughput"
                label="Tasks/Day"
                current={sortField}
                dir={sortDir}
                onToggle={onToggleSort}
              />
              <SortHeader
                field="avgCloseH"
                label="Avg Time"
                current={sortField}
                dir={sortDir}
                onToggle={onToggleSort}
              />
              <SortHeader
                field="costPerTask"
                label="$/Task"
                current={sortField}
                dir={sortDir}
                onToggle={onToggleSort}
              />
              <SortHeader
                field="totalSpendCents"
                label="Total Spend"
                current={sortField}
                dir={sortDir}
                onToggle={onToggleSort}
              />
              <SortHeader
                field="completionRate"
                label="Completion"
                current={sortField}
                dir={sortDir}
                onToggle={onToggleSort}
              />
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider w-20">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((row) => (
              <DesktopRow
                key={row.agentId}
                row={row}
                prevScoreMap={prevScoreMap}
                expandedRowId={expandedRowId}
                onToggleExpand={onToggleExpand}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

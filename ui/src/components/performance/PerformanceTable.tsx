import { cn } from "../../lib/utils";
import { DesktopRow, MobileCard } from "./PerformanceTableRows";
import type { AgentPerfRow, SortField } from "./ratingUtils";

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
        align === "center" ? "text-center" : align === "left" ? "text-left" : "text-right",
        className,
      )}
    >
      <button
        type="button"
        className={cn(
          "text-xs font-medium uppercase tracking-wider transition-colors",
          current === field ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => onToggle(field)}
      >
        {label}
        {current === field && <span className="ml-0.5">{dir === "asc" ? "\u2191" : "\u2193"}</span>}
      </button>
    </th>
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

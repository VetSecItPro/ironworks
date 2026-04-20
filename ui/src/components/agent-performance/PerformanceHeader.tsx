import { Building2, Download } from "lucide-react";
import { exportToCSV } from "../../lib/exportCSV";
import { cn } from "../../lib/utils";
import type { AgentPerfRow, TimeRange } from "../performance/ratingUtils";

interface PerformanceHeaderProps {
  range: TimeRange;
  setRange: (r: TimeRange) => void;
  showDeptAgg: boolean;
  setShowDeptAgg: (v: boolean) => void;
  rows: AgentPerfRow[];
}

export function PerformanceHeader({ range, setRange, showDeptAgg, setShowDeptAgg, rows }: PerformanceHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agent Performance</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Evaluate agent efficiency, throughput, and cost effectiveness.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors",
            showDeptAgg
              ? "bg-accent text-foreground border-foreground/20"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setShowDeptAgg(!showDeptAgg)}
        >
          <Building2 className="h-3.5 w-3.5" />
          Departments
        </button>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            exportToCSV(
              rows.map((r) => ({
                name: r.name,
                rating: r.rating,
                score: r.ratingScore,
                tasksDone: r.tasksDone,
                tasksInProgress: r.tasksInProgress,
                throughput: r.throughput.toFixed(2),
                avgCloseH: r.avgCloseH !== null ? r.avgCloseH.toFixed(1) : "",
                costPerTask: r.costPerTask !== null ? (r.costPerTask / 100).toFixed(2) : "",
                totalSpend: (r.totalSpendCents / 100).toFixed(2),
                completionRate: r.completionRate,
              })),
              `agent-performance-${range}`,
              [
                { key: "name", label: "Agent" },
                { key: "rating", label: "Rating" },
                { key: "score", label: "Score" },
                { key: "tasksDone", label: "Tasks Done" },
                { key: "tasksInProgress", label: "In Progress" },
                { key: "throughput", label: "Tasks/Day" },
                { key: "avgCloseH", label: "Avg Close (hrs)" },
                { key: "costPerTask", label: "Cost/Task ($)" },
                { key: "totalSpend", label: "Total Spend ($)" },
                { key: "completionRate", label: "Completion %" },
              ],
            );
          }}
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
        <div
          className="flex items-center gap-1 border border-border rounded-md overflow-hidden"
          role="group"
          aria-label="Time range"
        >
          {(["7d", "30d", "all"] as const).map((r) => (
            <button
              key={r}
              className={cn(
                "px-3 py-1.5 text-xs transition-colors",
                range === r ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={range === r}
              onClick={() => setRange(r)}
            >
              {r === "all" ? "All time" : r === "7d" ? "7 days" : "30 days"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

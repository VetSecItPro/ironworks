import { DEPARTMENT_LABELS } from "@ironworksai/shared";
import { Building2 } from "lucide-react";
import { cn, formatCents } from "../../lib/utils";
import { computeRating, RATING_COLORS } from "../performance/ratingUtils";

interface DeptAggRow {
  dept: string;
  agentCount: number;
  avgScore: number;
  totalDone: number;
  avgThroughput: number;
  avgCompletion: number;
  totalSpend: number;
}

interface DepartmentAggregationProps {
  deptAggRows: DeptAggRow[];
}

export function DepartmentAggregation({ deptAggRows }: DepartmentAggregationProps) {
  if (deptAggRows.length === 0) return null;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 bg-muted/30 border-b border-border">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5" />
          Department Averages
        </h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Department</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase">Agents</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase">Avg Score</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase">
                Tasks Done
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Tasks/Day</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Completion</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">
                Total Spend
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {deptAggRows.map((d) => {
              const deptLabel = (DEPARTMENT_LABELS as Record<string, string>)[d.dept] ?? d.dept;
              return (
                <tr key={d.dept} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium">{deptLabel}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums">{d.agentCount}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center justify-center h-6 w-6 rounded text-xs font-bold",
                        RATING_COLORS[computeRating(d.avgScore)],
                      )}
                    >
                      {computeRating(d.avgScore)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center tabular-nums">{d.totalDone}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{d.avgThroughput}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{d.avgCompletion}%</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCents(d.totalSpend)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type { DeptAggRow };

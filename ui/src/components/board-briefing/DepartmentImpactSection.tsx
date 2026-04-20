import { Building2 } from "lucide-react";
import type { DepartmentImpactRow } from "../../api/executive";
import { formatCents } from "../../lib/utils";

interface DepartmentImpactSectionProps {
  departmentImpactData: DepartmentImpactRow[];
}

export function DepartmentImpactSection({ departmentImpactData }: DepartmentImpactSectionProps) {
  return (
    <div className="rounded-xl border border-border p-5 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Building2 className="h-3.5 w-3.5" />
        Department Impact
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-2 pr-4 font-semibold text-muted-foreground">Department</th>
              <th className="pb-2 pr-4 font-semibold text-muted-foreground text-right">Missions Done</th>
              <th className="pb-2 pr-4 font-semibold text-muted-foreground text-right">Total Cost</th>
              <th className="pb-2 font-semibold text-muted-foreground text-right">Human-Hrs Equiv.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {departmentImpactData.map((row) => (
              <tr key={row.department} className="text-sm">
                <td className="py-1.5 pr-4 font-medium">{row.department}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{row.issuesCompleted}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums text-muted-foreground">
                  {formatCents(row.totalCost)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">{row.humanHoursEquivalent}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Human-hours equivalent assumes 2 hours per completed mission. Last 30 days.
      </p>
    </div>
  );
}

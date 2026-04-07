import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageSkeleton } from "../PageSkeleton";
import { formatCents } from "../../lib/utils";

interface DepartmentSpendingRow {
  department: string;
  agentCount: number;
  totalSpend: number;
  avgPerAgent: number;
}

export function DepartmentsTabContent({
  departmentSpendingData,
}: {
  departmentSpendingData?: DepartmentSpendingRow[] | null;
}) {
  if (!departmentSpendingData) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <Card>
      <CardHeader className="px-5 pt-5 pb-2">
        <CardTitle className="text-base">Department Spending</CardTitle>
        <CardDescription>Total LLM cost broken down by agent department.</CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-2 space-y-4">
        {departmentSpendingData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No department spending data available.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Department</th>
                    <th className="pb-2 pr-4 font-medium text-right">Agents</th>
                    <th className="pb-2 pr-4 font-medium text-right">Total Spend</th>
                    <th className="pb-2 font-medium text-right">Avg / Agent</th>
                  </tr>
                </thead>
                <tbody>
                  {departmentSpendingData.map((row) => (
                    <tr key={row.department} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-4 font-medium capitalize">{row.department}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{row.agentCount}</td>
                      <td className="py-2 pr-4 text-right font-mono text-xs tabular-nums">{formatCents(row.totalSpend)}</td>
                      <td className="py-2 text-right font-mono text-xs tabular-nums">{formatCents(row.avgPerAgent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(() => {
              const maxSpend = Math.max(...departmentSpendingData.map((r) => r.totalSpend), 1);
              return (
                <div className="space-y-2 pt-2">
                  {departmentSpendingData
                    .slice()
                    .sort((a, b) => b.totalSpend - a.totalSpend)
                    .map((row) => (
                      <div key={row.department} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="capitalize text-muted-foreground">{row.department}</span>
                          <span className="font-mono">{formatCents(row.totalSpend)}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/60 rounded-full transition-[width] duration-500"
                            style={{ width: `${(row.totalSpend / maxSpend) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              );
            })()}
          </>
        )}
      </CardContent>
    </Card>
  );
}

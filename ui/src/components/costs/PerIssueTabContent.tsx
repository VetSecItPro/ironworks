import { useQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { useState } from "react";
import { Link } from "@/lib/router";
import { costsApi } from "../../api/costs";

/**
 * Workspace cost-per-issue list. Surfaces the existing /cost-per-issue
 * endpoint so an operator can see which missions are eating budget without
 * needing to grep the executive unit-economics view (which embedded the
 * same data three layers deep).
 */
export function PerIssueTabContent({ companyId }: { companyId: string }) {
  const [days, setDays] = useState(30);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cost-per-issue", companyId, days],
    queryFn: () => costsApi.perIssue(companyId, days),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ListChecks className="h-4 w-4" />
          <span>Top missions by spend over the last</span>
          <select
            value={days}
            onChange={(e) => setDays(Number.parseInt(e.target.value, 10))}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load"}</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No missions have recorded cost events in the selected window.</p>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Mission</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Runs</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Total cost</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Avg / run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((row) => {
                const totalUsd = row.totalCost / 100;
                const avgUsd = row.runCount > 0 ? totalUsd / row.runCount : 0;
                return (
                  <tr key={row.issueId} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-xs">
                      <Link to={`/issues/${row.issueId}`} className="hover:underline truncate block max-w-[480px]">
                        {row.issueTitle}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-right tabular-nums">{row.runCount}</td>
                    <td className="px-4 py-2.5 text-xs text-right tabular-nums font-medium">${totalUsd.toFixed(4)}</td>
                    <td className="px-4 py-2.5 text-xs text-right tabular-nums text-muted-foreground">
                      ${avgUsd.toFixed(4)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, formatTokens } from "../../lib/utils";

interface ByProjectRow {
  projectId?: string | null;
  projectName?: string | null;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
}

export function ByProjectCard({ byProject }: { byProject: ByProjectRow[] }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="px-5 pt-5 pb-2">
        <CardTitle className="text-base">By Project</CardTitle>
        <CardDescription>Run costs attributed through project-linked missions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 px-5 pb-5 pt-2 flex-1">
        {(byProject.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No project-attributed run costs yet.</p>
        ) : (
          byProject.map((row, index) => (
            <div
              key={row.projectId ?? `unattributed-${index}`}
              className="flex items-center justify-between gap-3 border border-border rounded-lg px-4 py-3 text-sm"
            >
              <span className="truncate font-medium">{row.projectName ?? row.projectId ?? "Unattributed"}</span>
              <div className="text-right shrink-0">
                <div className="font-semibold tabular-nums">{formatCents(row.costCents)}</div>
                <div className="text-[10px] text-muted-foreground">
                  {formatTokens(row.inputTokens + row.outputTokens)} tokens
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

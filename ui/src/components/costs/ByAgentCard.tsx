import type { CostByAgentModel } from "@ironworksai/shared";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { billingTypeDisplayName, cn, formatCents, formatTokens, providerDisplayName } from "../../lib/utils";
import { Identity } from "../Identity";
import { StatusBadge } from "../StatusBadge";

interface ByAgentRow {
  agentId: string;
  agentName?: string | null;
  agentStatus?: string | null;
  costCents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  apiRunCount: number;
  subscriptionRunCount: number;
}

export function ByAgentCard({
  byAgent,
  agentModelRows,
  expandedAgents,
  toggleAgent,
}: {
  byAgent: ByAgentRow[];
  agentModelRows: Map<string, CostByAgentModel[]>;
  expandedAgents: Set<string>;
  toggleAgent: (agentId: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="px-5 pt-5 pb-2">
        <CardTitle className="text-base">By Agent</CardTitle>
        <CardDescription>What each agent consumed in the selected period.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 px-5 pb-5 pt-2">
        {(byAgent.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No cost events yet.</p>
        ) : (
          byAgent.map((row) => {
            const modelRows = agentModelRows.get(row.agentId) ?? [];
            const isExpanded = expandedAgents.has(row.agentId);
            const hasBreakdown = modelRows.length > 0;
            return (
              <div key={row.agentId} className="border border-border px-4 py-3">
                <div
                  className={cn(
                    "flex items-start justify-between gap-3",
                    hasBreakdown ? "cursor-pointer select-none" : "",
                  )}
                  onClick={() => hasBreakdown && toggleAgent(row.agentId)}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {hasBreakdown ? (
                      isExpanded ? (
                        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )
                    ) : (
                      <span className="h-3 w-3 shrink-0" />
                    )}
                    <Identity name={row.agentName ?? row.agentId} size="sm" />
                    {row.agentStatus === "terminated" ? <StatusBadge status="terminated" /> : null}
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    <div className="font-medium">{formatCents(row.costCents)}</div>
                    <div className="text-sm text-muted-foreground">
                      in {formatTokens(row.inputTokens + row.cachedInputTokens)} - out {formatTokens(row.outputTokens)}
                    </div>
                    {row.apiRunCount > 0 || row.subscriptionRunCount > 0 ? (
                      <div className="text-sm text-muted-foreground">
                        {row.apiRunCount > 0 ? `${row.apiRunCount} api` : "0 api"}
                        {" - "}
                        {row.subscriptionRunCount > 0 ? `${row.subscriptionRunCount} subscription` : "0 subscription"}
                      </div>
                    ) : null}
                  </div>
                </div>

                {isExpanded && modelRows.length > 0 ? (
                  <div className="mt-3 space-y-2 border-l border-border pl-4">
                    {modelRows.map((modelRow) => {
                      const sharePct = row.costCents > 0 ? Math.round((modelRow.costCents / row.costCents) * 100) : 0;
                      return (
                        <div
                          key={`${modelRow.provider}:${modelRow.model}:${modelRow.billingType}`}
                          className="flex items-start justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">
                              {providerDisplayName(modelRow.provider)}
                              <span className="mx-1 text-border">/</span>
                              <span className="font-mono">{modelRow.model}</span>
                            </div>
                            <div className="truncate text-muted-foreground">
                              {providerDisplayName(modelRow.biller)} - {billingTypeDisplayName(modelRow.billingType)}
                            </div>
                          </div>
                          <div className="text-right tabular-nums">
                            <div className="font-medium">
                              {formatCents(modelRow.costCents)}
                              <span className="ml-1 font-normal text-muted-foreground">({sharePct}%)</span>
                            </div>
                            <div className="text-muted-foreground">
                              {formatTokens(modelRow.inputTokens + modelRow.cachedInputTokens + modelRow.outputTokens)}{" "}
                              tok
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

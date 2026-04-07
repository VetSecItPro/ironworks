import { ArrowDownLeft, ArrowUpRight, Coins, DollarSign, TrendingDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "../EmptyState";
import { PageSkeleton } from "../PageSkeleton";
import { MetricTile } from "./MetricTile";
import { formatTokens } from "../../lib/utils";

interface TokenAnalyticsData {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheTokens: number;
  totalRuns: number;
  avgTokensPerRun: number;
  totalCost: number;
  agents: Array<{
    agentId: string;
    agentName?: string | null;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheTokens: number;
    runsCount: number;
    avgTokensPerRun: number;
    totalCost: number;
  }>;
}

export function TokensTabContent({
  tokenAnalyticsLoading,
  tokenAnalyticsData,
}: {
  tokenAnalyticsLoading: boolean;
  tokenAnalyticsData?: TokenAnalyticsData | null;
}) {
  if (tokenAnalyticsLoading) {
    return <PageSkeleton variant="costs" />;
  }
  if (!tokenAnalyticsData) {
    return <EmptyState icon={Coins} message="No token data yet. Token usage will appear once agents start running." />;
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricTile
          label="Total Input"
          value={formatTokens(tokenAnalyticsData.totalInputTokens)}
          subtitle={`${tokenAnalyticsData.totalRuns} runs`}
          icon={ArrowDownLeft}
        />
        <MetricTile
          label="Total Output"
          value={formatTokens(tokenAnalyticsData.totalOutputTokens)}
          subtitle={`Avg ${formatTokens(tokenAnalyticsData.avgTokensPerRun)}/run`}
          icon={ArrowUpRight}
        />
        <MetricTile
          label="Cache Tokens"
          value={formatTokens(tokenAnalyticsData.totalCacheTokens)}
          subtitle={
            tokenAnalyticsData.totalInputTokens + tokenAnalyticsData.totalCacheTokens > 0
              ? `${Math.round((tokenAnalyticsData.totalCacheTokens / (tokenAnalyticsData.totalInputTokens + tokenAnalyticsData.totalCacheTokens)) * 100)}% hit rate`
              : "No data"
          }
          icon={TrendingDown}
        />
        <MetricTile
          label="Total Cost"
          value={`$${tokenAnalyticsData.totalCost.toFixed(2)}`}
          subtitle={`${tokenAnalyticsData.agents.length} active agents`}
          icon={DollarSign}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-Agent Token Breakdown</CardTitle>
          <CardDescription>Token usage and cost by agent over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          {tokenAnalyticsData.agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents with token usage in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Agent</th>
                    <th className="pb-2 pr-4 font-medium text-right">Input Tokens</th>
                    <th className="pb-2 pr-4 font-medium text-right">Output Tokens</th>
                    <th className="pb-2 pr-4 font-medium text-right">Cache Hits</th>
                    <th className="pb-2 pr-4 font-medium text-right">Runs</th>
                    <th className="pb-2 pr-4 font-medium text-right">Avg/Run</th>
                    <th className="pb-2 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {tokenAnalyticsData.agents.map((agent) => (
                    <tr key={agent.agentId} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-4">
                        <span className="font-medium">{agent.agentName ?? agent.agentId}</span>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">{formatTokens(agent.totalInputTokens)}</td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">{formatTokens(agent.totalOutputTokens)}</td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">{formatTokens(agent.totalCacheTokens)}</td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">{agent.runsCount}</td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">{formatTokens(agent.avgTokensPerRun)}</td>
                      <td className="py-2 text-right font-mono text-xs">{agent.totalCost > 0 ? `$${agent.totalCost.toFixed(4)}` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

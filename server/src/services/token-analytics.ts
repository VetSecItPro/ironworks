import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@ironworksai/db";
import { agents, costEvents, heartbeatRuns } from "@ironworksai/db";
import { DEFAULT_OUTPUT_TOKEN_LIMITS } from "@ironworksai/shared";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentTokenSummary {
  agentId: string;
  agentName: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheTokens: number;
  totalCost: number;
  runsCount: number;
  avgTokensPerRun: number;
}

export interface TokenWasteRecommendation {
  agentId: string | null;
  agentName: string | null;
  type: "model_downgrade" | "context_compression" | "frequency_reduction" | "conciseness";
  summary: string;
  detail: string;
  estimatedMonthlySavingsCents: number;
}

export interface TokenWasteAnalysis {
  avgInputTokens: number;
  avgOutputTokens: number;
  cacheHitRate: number;
  estimatedWastePct: number;
  recommendations: string[];
  structuredRecommendations: TokenWasteRecommendation[];
}

export interface CompanyTokenSummary {
  companyId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheTokens: number;
  totalCost: number;
  totalRuns: number;
  avgTokensPerRun: number;
  agents: AgentTokenSummary[];
}

// ── Service ──────────────────────────────────────────────────────────────────

export function tokenAnalyticsService(db: Db) {
  /**
   * Get per-agent token usage summary for a period (default 30 days).
   */
  async function getAgentTokenSummary(
    agentId: string,
    periodDays = 30,
  ): Promise<AgentTokenSummary> {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const [row] = await db
      .select({
        agentName: agents.name,
        totalInputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::int`,
        totalOutputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::int`,
        totalCacheTokens: sql<number>`coalesce(sum(${costEvents.cachedInputTokens}), 0)::int`,
        totalCostCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
        runsCount: sql<number>`count(distinct ${costEvents.heartbeatRunId})::int`,
      })
      .from(costEvents)
      .leftJoin(agents, eq(costEvents.agentId, agents.id))
      .where(and(eq(costEvents.agentId, agentId), gte(costEvents.occurredAt, since)))
      .groupBy(agents.name);

    const totalInput = Number(row?.totalInputTokens ?? 0);
    const totalOutput = Number(row?.totalOutputTokens ?? 0);
    const totalCache = Number(row?.totalCacheTokens ?? 0);
    const runs = Number(row?.runsCount ?? 0);
    const totalCostCents = Number(row?.totalCostCents ?? 0);

    return {
      agentId,
      agentName: row?.agentName ?? null,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalCacheTokens: totalCache,
      totalCost: totalCostCents / 100,
      runsCount: runs,
      avgTokensPerRun: runs > 0 ? Math.round((totalInput + totalOutput) / runs) : 0,
    };
  }

  /**
   * Analyze an agent's recent runs for token waste patterns.
   */
  async function analyzeTokenWaste(
    agentId: string,
    companyId: string,
    periodDays = 30,
  ): Promise<TokenWasteAnalysis> {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    // Get per-run token data
    const runs = await db
      .select({
        runId: costEvents.heartbeatRunId,
        inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::int`,
        cachedInputTokens: sql<number>`coalesce(sum(${costEvents.cachedInputTokens}), 0)::int`,
      })
      .from(costEvents)
      .where(
        and(
          eq(costEvents.agentId, agentId),
          eq(costEvents.companyId, companyId),
          gte(costEvents.occurredAt, since),
        ),
      )
      .groupBy(costEvents.heartbeatRunId)
      .orderBy(desc(costEvents.heartbeatRunId))
      .limit(100);

    if (runs.length === 0) {
      return {
        avgInputTokens: 0,
        avgOutputTokens: 0,
        cacheHitRate: 0,
        estimatedWastePct: 0,
        recommendations: ["No runs found in the analysis period."],
        structuredRecommendations: [],
      };
    }

    // Fetch agent name for structured recommendations
    const [agentRow] = await db
      .select({ name: agents.name })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    const agentName = agentRow?.name ?? null;

    const totalInput = runs.reduce((sum, r) => sum + Number(r.inputTokens), 0);
    const totalOutput = runs.reduce((sum, r) => sum + Number(r.outputTokens), 0);
    const totalCached = runs.reduce((sum, r) => sum + Number(r.cachedInputTokens), 0);
    const avgInput = Math.round(totalInput / runs.length);
    const avgOutput = Math.round(totalOutput / runs.length);

    // Cache hit rate: cached tokens / (cached + non-cached input)
    const cacheHitRate = totalInput + totalCached > 0
      ? Number(((totalCached / (totalInput + totalCached)) * 100).toFixed(1))
      : 0;

    // Waste detection
    const recommendations: string[] = [];
    const structuredRecommendations: TokenWasteRecommendation[] = [];
    let wastePct = 0;

    // Estimate monthly cost (cents) from last 30 days data
    const [costRow] = await db
      .select({ totalCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int` })
      .from(costEvents)
      .where(and(eq(costEvents.agentId, agentId), eq(costEvents.companyId, companyId), gte(costEvents.occurredAt, since)));
    const monthlyCostCents = Number(costRow?.totalCents ?? 0);

    // Check: output tokens consistently near max (verbose agent) - model downgrade candidate
    const defaultCap = DEFAULT_OUTPUT_TOKEN_LIMITS.code_generation;
    const verboseRuns = runs.filter((r) => Number(r.outputTokens) > defaultCap * 0.8);
    const verboseRatio = verboseRuns.length / runs.length;
    if (verboseRatio > 0.5) {
      const label = agentName ?? agentId;
      const runCount = runs.length;
      // Haiku is roughly 5x cheaper than Sonnet on output tokens
      const estimatedSaving = Math.round(monthlyCostCents * 0.6);
      const summaryMsg = `Agent ${label} used claude-sonnet for ${runCount} routine heartbeats. Switching to haiku would save ~$${(estimatedSaving / 100).toFixed(2)}/month`;
      recommendations.push(
        `${Math.round(verboseRatio * 100)}% of runs produce output near the token cap. Consider breaking tasks into smaller units or adding conciseness instructions.`,
      );
      structuredRecommendations.push({
        agentId,
        agentName,
        type: "model_downgrade",
        summary: summaryMsg,
        detail: `${Math.round(verboseRatio * 100)}% of ${runCount} runs used >80% of the output token cap. Routine heartbeat tasks do not require a large model. Downgrading to claude-haiku for status/timer runs saves significant cost.`,
        estimatedMonthlySavingsCents: estimatedSaving,
      });
      wastePct += verboseRatio * 15;
    }

    // Check: input tokens growing run-over-run (context bloat) - context compression candidate
    if (runs.length >= 5) {
      const recentFive = runs.slice(0, 5).map((r) => Number(r.inputTokens));
      const olderFive = runs.slice(Math.max(0, runs.length - 5)).map((r) => Number(r.inputTokens));
      const recentAvg = recentFive.reduce((a, b) => a + b, 0) / recentFive.length;
      const olderAvg = olderFive.reduce((a, b) => a + b, 0) / olderFive.length;
      if (olderAvg > 0 && recentAvg > olderAvg * 1.5) {
        const growthPct = Math.round((recentAvg / olderAvg - 1) * 100);
        const savedTokensPerRun = Math.round(recentAvg * 0.4);
        // Rough cents estimate: $3/M input tokens (Sonnet pricing)
        const savedCentsPerRun = Math.round(savedTokensPerRun * 0.0003);
        const estimatedSaving = savedCentsPerRun * runs.length;
        const label = agentName ?? agentId;
        const weeklyGrowth = Math.round(growthPct / (periodDays / 7));
        recommendations.push(
          `Input tokens grew ${growthPct}% between older and recent runs. Consider enabling session compaction or clearing stale context.`,
        );
        structuredRecommendations.push({
          agentId,
          agentName,
          type: "context_compression",
          summary: `Agent ${label}'s context grew ${weeklyGrowth}% over the week. Enable context compression to save ~${Math.round(savedTokensPerRun / 1000)}k tokens/run`,
          detail: `Average input grew from ${Math.round(olderAvg / 1000)}k to ${Math.round(recentAvg / 1000)}k tokens over ${periodDays} days. Enabling session compaction (archiving old turns) will reduce per-run input by ~40%.`,
          estimatedMonthlySavingsCents: estimatedSaving,
        });
        wastePct += 20;
      }
    }

    // Check: low cache hit rate
    if (cacheHitRate < 50 && totalInput > 10000) {
      recommendations.push(
        `Cache hit rate is ${cacheHitRate}%. Consider structuring prompts with stable prefixes to improve cache utilization.`,
      );
      wastePct += 10;
    }

    // Check: runs with 0 meaningful output (wasted calls) - frequency reduction
    const emptyRuns = runs.filter((r) => Number(r.outputTokens) < 50);
    const emptyRatio = emptyRuns.length / runs.length;
    if (emptyRatio > 0.1) {
      const emptyPct = Math.round(emptyRatio * 100);
      const estimatedSaving = Math.round(monthlyCostCents * emptyRatio * 0.8);
      const label = agentName ?? agentId;
      recommendations.push(
        `${emptyPct}% of runs produced minimal output (< 50 tokens). Review heartbeat frequency or wake conditions.`,
      );
      structuredRecommendations.push({
        agentId,
        agentName,
        type: "frequency_reduction",
        summary: `Agent ${label} has ${emptyPct}% idle heartbeats. Reducing wake frequency would save ~$${(estimatedSaving / 100).toFixed(2)}/month`,
        detail: `${emptyRuns.length} of ${runs.length} runs produced fewer than 50 output tokens. These are wasted invocations. Increasing the heartbeat interval or tightening wake conditions will eliminate idle runs.`,
        estimatedMonthlySavingsCents: estimatedSaving,
      });
      wastePct += emptyRatio * 25;
    }

    if (recommendations.length === 0) {
      recommendations.push("Token usage patterns look healthy. No waste detected.");
    }

    return {
      avgInputTokens: avgInput,
      avgOutputTokens: avgOutput,
      cacheHitRate,
      estimatedWastePct: Math.min(100, Math.round(wastePct)),
      recommendations,
      structuredRecommendations,
    };
  }

  /**
   * Get company-wide token summary aggregating all agents.
   */
  async function getCompanyTokenSummary(
    companyId: string,
    periodDays = 30,
  ): Promise<CompanyTokenSummary> {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const agentRows = await db
      .select({
        agentId: costEvents.agentId,
        agentName: agents.name,
        totalInputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::int`,
        totalOutputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::int`,
        totalCacheTokens: sql<number>`coalesce(sum(${costEvents.cachedInputTokens}), 0)::int`,
        totalCostCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
        runsCount: sql<number>`count(distinct ${costEvents.heartbeatRunId})::int`,
      })
      .from(costEvents)
      .leftJoin(agents, eq(costEvents.agentId, agents.id))
      .where(and(eq(costEvents.companyId, companyId), gte(costEvents.occurredAt, since)))
      .groupBy(costEvents.agentId, agents.name)
      .orderBy(desc(sql`coalesce(sum(${costEvents.costCents}), 0)::int`));

    const agentSummaries: AgentTokenSummary[] = agentRows.map((row) => {
      const input = Number(row.totalInputTokens);
      const output = Number(row.totalOutputTokens);
      const cache = Number(row.totalCacheTokens);
      const runs = Number(row.runsCount);
      const costCents = Number(row.totalCostCents);
      return {
        agentId: row.agentId,
        agentName: row.agentName ?? null,
        totalInputTokens: input,
        totalOutputTokens: output,
        totalCacheTokens: cache,
        totalCost: costCents / 100,
        runsCount: runs,
        avgTokensPerRun: runs > 0 ? Math.round((input + output) / runs) : 0,
      };
    });

    const totalInput = agentSummaries.reduce((s, a) => s + a.totalInputTokens, 0);
    const totalOutput = agentSummaries.reduce((s, a) => s + a.totalOutputTokens, 0);
    const totalCache = agentSummaries.reduce((s, a) => s + a.totalCacheTokens, 0);
    const totalCost = agentSummaries.reduce((s, a) => s + a.totalCost, 0);
    const totalRuns = agentSummaries.reduce((s, a) => s + a.runsCount, 0);

    return {
      companyId,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalCacheTokens: totalCache,
      totalCost,
      totalRuns,
      avgTokensPerRun: totalRuns > 0 ? Math.round((totalInput + totalOutput) / totalRuns) : 0,
      agents: agentSummaries,
    };
  }

  return {
    getAgentTokenSummary,
    analyzeTokenWaste,
    getCompanyTokenSummary,
  };
}

// ---------------------------------------------------------------------------
// Task 9: Context Window Utilization
// ---------------------------------------------------------------------------

/** Known context window sizes by model name pattern (in tokens). */
const MODEL_CONTEXT_SIZES: Array<{ pattern: string; contextSize: number }> = [
  { pattern: "claude-3-5-haiku", contextSize: 200_000 },
  { pattern: "claude-haiku", contextSize: 200_000 },
  { pattern: "claude-3-5-sonnet", contextSize: 200_000 },
  { pattern: "claude-3-7-sonnet", contextSize: 200_000 },
  { pattern: "claude-sonnet", contextSize: 200_000 },
  { pattern: "claude-3-opus", contextSize: 200_000 },
  { pattern: "claude-opus", contextSize: 200_000 },
  { pattern: "gpt-4o-mini", contextSize: 128_000 },
  { pattern: "gpt-4o", contextSize: 128_000 },
  { pattern: "gpt-4-turbo", contextSize: 128_000 },
  { pattern: "gpt-4", contextSize: 128_000 },
  { pattern: "gpt-3.5", contextSize: 16_385 },
  { pattern: "gemini-1.5-pro", contextSize: 1_000_000 },
  { pattern: "gemini-1.5-flash", contextSize: 1_000_000 },
  { pattern: "gemini-pro", contextSize: 32_768 },
  { pattern: "gemini-flash", contextSize: 1_000_000 },
];

function resolveContextSize(model: string): number {
  const lower = model.toLowerCase();
  for (const entry of MODEL_CONTEXT_SIZES) {
    if (lower.includes(entry.pattern)) return entry.contextSize;
  }
  // Default fallback
  return 128_000;
}

export interface ContextWindowUtilization {
  modelContextSize: number;
  avgInputTokens: number;
  utilizationPct: number;
  isApproachingLimit: boolean;
}

/**
 * Compute how much of the context window an agent typically uses.
 * Uses the last 30 days of cost_events to derive an average input token count,
 * then maps the agent's most-used model to a known context size.
 */
export async function contextWindowUtilization(
  db: Db,
  agentId: string,
): Promise<ContextWindowUtilization> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [row] = await db
    .select({
      avgInputTokens: sql<number>`coalesce(avg(${costEvents.inputTokens}), 0)::float`,
      primaryModel: sql<string>`mode() within group (order by ${costEvents.model})`,
    })
    .from(costEvents)
    .where(and(eq(costEvents.agentId, agentId), gte(costEvents.occurredAt, since)));

  const avgInput = Math.round(Number(row?.avgInputTokens ?? 0));
  const primaryModel = (row?.primaryModel ?? "").toLowerCase();
  const modelContextSize = resolveContextSize(primaryModel);
  const utilizationPct = modelContextSize > 0
    ? Math.round((avgInput / modelContextSize) * 100 * 10) / 10
    : 0;

  return {
    modelContextSize,
    avgInputTokens: avgInput,
    utilizationPct,
    isApproachingLimit: utilizationPct >= 80,
  };
}

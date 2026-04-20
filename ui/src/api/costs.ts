import type {
  CostByAgent,
  CostByAgentModel,
  CostByBiller,
  CostByProject,
  CostByProviderModel,
  CostSummary,
  CostWindowSpendRow,
  FinanceByBiller,
  FinanceByKind,
  FinanceEvent,
  FinanceSummary,
  ProviderQuotaResult,
} from "@ironworksai/shared";
import { api } from "./client";

function dateParams(from?: string, to?: string): string {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const costsApi = {
  summary: (companyId: string, from?: string, to?: string) =>
    api.get<CostSummary>(`/companies/${companyId}/costs/summary${dateParams(from, to)}`),
  byAgent: (companyId: string, from?: string, to?: string) =>
    api.get<CostByAgent[]>(`/companies/${companyId}/costs/by-agent${dateParams(from, to)}`),
  byAgentModel: (companyId: string, from?: string, to?: string) =>
    api.get<CostByAgentModel[]>(`/companies/${companyId}/costs/by-agent-model${dateParams(from, to)}`),
  byProject: (companyId: string, from?: string, to?: string) =>
    api.get<CostByProject[]>(`/companies/${companyId}/costs/by-project${dateParams(from, to)}`),
  byProvider: (companyId: string, from?: string, to?: string) =>
    api.get<CostByProviderModel[]>(`/companies/${companyId}/costs/by-provider${dateParams(from, to)}`),
  byBiller: (companyId: string, from?: string, to?: string) =>
    api.get<CostByBiller[]>(`/companies/${companyId}/costs/by-biller${dateParams(from, to)}`),
  financeSummary: (companyId: string, from?: string, to?: string) =>
    api.get<FinanceSummary>(`/companies/${companyId}/costs/finance-summary${dateParams(from, to)}`),
  financeByBiller: (companyId: string, from?: string, to?: string) =>
    api.get<FinanceByBiller[]>(`/companies/${companyId}/costs/finance-by-biller${dateParams(from, to)}`),
  financeByKind: (companyId: string, from?: string, to?: string) =>
    api.get<FinanceByKind[]>(`/companies/${companyId}/costs/finance-by-kind${dateParams(from, to)}`),
  financeEvents: (companyId: string, from?: string, to?: string, limit: number = 100) =>
    api.get<FinanceEvent[]>(`/companies/${companyId}/costs/finance-events${dateParamsWithLimit(from, to, limit)}`),
  windowSpend: (companyId: string) => api.get<CostWindowSpendRow[]>(`/companies/${companyId}/costs/window-spend`),
  quotaWindows: (companyId: string) => api.get<ProviderQuotaResult[]>(`/companies/${companyId}/costs/quota-windows`),

  createFinanceEvent: (
    companyId: string,
    event: {
      eventKind: string;
      direction: "debit" | "credit";
      biller: string;
      provider?: string;
      amountCents: number;
      currency: string;
      description: string;
      occurredAt: string;
    },
  ) => api.post<unknown>(`/companies/${companyId}/finance-events`, event),

  equivalentSpend: (companyId: string, from?: string, to?: string) =>
    api.get<EquivalentSpendResult>(`/companies/${companyId}/costs/equivalent-spend${dateParams(from, to)}`),

  byProjectDetail: (companyId: string, from?: string, to?: string) =>
    api.get<CostByProjectDetail[]>(`/companies/${companyId}/costs/by-project-detail${dateParams(from, to)}`),

  projectExportUrl: (companyId: string, projectId: string, from?: string, to?: string) =>
    `/api/companies/${companyId}/costs/project-export?projectId=${encodeURIComponent(projectId)}${from ? `&from=${encodeURIComponent(from)}` : ""}${to ? `&to=${encodeURIComponent(to)}` : ""}`,

  // Phase O.2: rollup-based analytics (reads cost_rollup_daily, 1-day lag)
  rollupTimeSeries: (companyId: string, range: CostRange, groupBy: CostGroupBy = "day") =>
    api.get<RollupTimeSeriesResponse>(`/companies/${companyId}/costs/time-series?range=${range}&group_by=${groupBy}`),

  rollupLeaderboard: (companyId: string, range: CostRange, limit = 10) =>
    api.get<RollupLeaderboardResponse>(`/companies/${companyId}/costs/leaderboard?range=${range}&limit=${limit}`),

  rollupMom: (companyId: string) => api.get<RollupMomResponse>(`/companies/${companyId}/costs/mom`),
};

export interface EquivalentSpendResult {
  billingMode: "subscription" | "api" | "mixed" | "none";
  actualSpendCents: number;
  subscriptionEquivalentCents: number;
  totalEquivalentCents: number;
  subscriptionTokens: { input: number; cachedInput: number; output: number };
  apiTokens: { input: number; cachedInput: number; output: number };
  note: string;
}

export interface CostByProjectDetail extends CostByProject {
  equivalentSpendCents: number;
}

function dateParamsWithLimit(from?: string, to?: string, limit?: number): string {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// ── Phase O.2 rollup analytics types ──────────────────────────────────────────

export type CostRange = "7d" | "30d" | "90d" | "mtd" | "ytd";
export type CostGroupBy = "day" | "agent" | "adapter";

export interface RollupTimeSeriesPoint {
  day: string;
  agentId: string | null;
  agentName: string | null;
  provider: string | null;
  source: string | null;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface RollupTimeSeriesResponse {
  range: CostRange;
  groupBy: CostGroupBy;
  points: RollupTimeSeriesPoint[];
}

export interface RollupLeaderboardEntry {
  agentId: string;
  agentName: string | null;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface RollupLeaderboardResponse {
  range: CostRange;
  limit: number;
  entries: RollupLeaderboardEntry[];
}

export interface RollupMonthSummary {
  from: string;
  to: string;
  totalCostUsd: number;
  byProvider: Array<{ provider: string; costUsd: number }>;
}

export interface RollupMomResponse {
  currentMonth: RollupMonthSummary;
  previousMonth: RollupMonthSummary;
  deltaUsd: number;
  deltaPct: number | null;
}

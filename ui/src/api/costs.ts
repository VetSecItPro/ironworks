import type {
  CostSummary,
  CostByAgent,
  CostByProviderModel,
  CostByBiller,
  CostByAgentModel,
  CostByProject,
  CostWindowSpendRow,
  FinanceSummary,
  FinanceByBiller,
  FinanceByKind,
  FinanceEvent,
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
  windowSpend: (companyId: string) =>
    api.get<CostWindowSpendRow[]>(`/companies/${companyId}/costs/window-spend`),
  quotaWindows: (companyId: string) =>
    api.get<ProviderQuotaResult[]>(`/companies/${companyId}/costs/quota-windows`),

  createFinanceEvent: (companyId: string, event: {
    eventKind: string;
    direction: "debit" | "credit";
    biller: string;
    provider?: string;
    amountCents: number;
    currency: string;
    description: string;
    occurredAt: string;
  }) => api.post<unknown>(`/companies/${companyId}/finance-events`, event),

  equivalentSpend: (companyId: string, from?: string, to?: string) =>
    api.get<EquivalentSpendResult>(`/companies/${companyId}/costs/equivalent-spend${dateParams(from, to)}`),

  byProjectDetail: (companyId: string, from?: string, to?: string) =>
    api.get<CostByProjectDetail[]>(`/companies/${companyId}/costs/by-project-detail${dateParams(from, to)}`),

  projectExportUrl: (companyId: string, projectId: string, from?: string, to?: string) =>
    `/api/companies/${companyId}/costs/project-export?projectId=${encodeURIComponent(projectId)}${from ? `&from=${encodeURIComponent(from)}` : ""}${to ? `&to=${encodeURIComponent(to)}` : ""}`,
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

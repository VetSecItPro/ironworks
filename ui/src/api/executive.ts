import { api } from "./client";

export interface UnitEconomics {
  current: {
    totalCents: number;
    issuesDone: number;
    activeHours: number;
    costPerIssue: number;
    costPerActiveHour: number;
  };
  prior: {
    totalCents: number;
    issuesDone: number;
    activeHours: number;
    costPerIssue: number;
    costPerActiveHour: number;
  };
  costPerIssueTrend: number;
  costPerHourTrend: number;
}

export interface BurnRate {
  weekSpendCents: number;
  dailyRateCents: number;
  monthlyRateCents: number;
  budgetCents: number;
  spentCents: number;
  remainingCents: number;
  runwayDays: number | null;
  runwayMonths: number | null;
}

export interface CostAllocationRow {
  projectId: string;
  projectName: string;
  costCents: number;
  issueCount: number;
  costPerIssue: number;
}

export interface SlaCompliance {
  total: number;
  withinSla: number;
  compliancePercent: number;
  byPriority: Array<{
    priority: string;
    total: number;
    met: number;
    compliancePercent: number;
    avgResolutionMinutes: number;
    targetMinutes: number;
  }>;
}

export interface TechDebt {
  openCount: number;
  createdLast30d: number;
  createdPrior30d: number;
  trend: number;
}

export interface RiskItem {
  level: "low" | "medium" | "high" | "critical";
  category: string;
  title: string;
  entityType: string;
  entityId: string;
  detail: string;
}

export interface RiskRegister {
  totalRisks: number;
  countByLevel: Record<string, number>;
  risks: RiskItem[];
}

export const executiveApi = {
  unitEconomics: (companyId: string) =>
    api.get<UnitEconomics>(`/companies/${companyId}/executive/unit-economics`),

  burnRate: (companyId: string) =>
    api.get<BurnRate>(`/companies/${companyId}/executive/burn-rate`),

  costAllocation: (companyId: string) =>
    api.get<CostAllocationRow[]>(`/companies/${companyId}/executive/cost-allocation`),

  slaCompliance: (companyId: string) =>
    api.get<SlaCompliance>(`/companies/${companyId}/executive/sla-compliance`),

  techDebt: (companyId: string) =>
    api.get<TechDebt>(`/companies/${companyId}/executive/tech-debt`),

  riskRegister: (companyId: string) =>
    api.get<RiskRegister>(`/companies/${companyId}/executive/risk-register`),

  emergencyPauseAll: (companyId: string) =>
    api.post<{ paused: number; message: string }>(
      `/companies/${companyId}/agents/emergency-pause-all`,
      {},
    ),
};

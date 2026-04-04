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

export interface CompanyHealthScore {
  score: number;
  breakdown: {
    agentPerformance: number;
    goalCompletion: number;
    budgetHealth: number;
    slaCompliance: number;
    riskLevel: number;
  };
}

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

export interface TokenWasteAnalysis {
  avgInputTokens: number;
  avgOutputTokens: number;
  cacheHitRate: number;
  estimatedWastePct: number;
  recommendations: string[];
}

export interface AgentTokenAnalytics {
  summary: AgentTokenSummary;
  waste: TokenWasteAnalysis;
}

export interface AgentSecurityProfile {
  permissions: string[];
  dataScopes: string[];
  toolAuthorizations: string[];
  recentAccessLog: Array<{ action: string; timestamp: string; details: string }>;
}

export interface ComplianceExportData {
  exportedAt: string;
  companyId: string;
  periodFrom: string;
  periodTo: string;
  allActions: Array<{
    id: string;
    companyId: string;
    actorType: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    agentId: string | null;
    details: Record<string, unknown> | null;
    createdAt: string;
  }>;
  approvalDecisions: Array<Record<string, unknown>>;
  hiringTerminationEvents: Array<Record<string, unknown>>;
  costEvents: Array<Record<string, unknown>>;
  agentConfigurations: Array<Record<string, unknown>>;
  summary: {
    totalActions: number;
    totalApprovals: number;
    totalHiringTerminations: number;
    totalCostEvents: number;
    totalAgents: number;
  };
}

export interface PermissionMatrixData {
  permissions: string[];
  agents: Array<{
    agentId: string;
    name: string;
    role: string;
    status: string;
    department: string | null;
    permissions: Record<string, boolean>;
  }>;
}

export type AlertSeverity = "low" | "medium" | "high" | "critical";

export interface SmartAlert {
  id: string;
  severity: AlertSeverity;
  category: string;
  title: string;
  description: string;
  agentId: string | null;
  issueId: string | null;
  autoResolved: boolean;
  createdAt: string;
}

export interface DepartmentSpendingRow {
  department: string;
  agentCount: number;
  totalSpend: number;
  avgPerAgent: number;
}

export interface CompanyRiskSettings {
  spendingAlertThresholdCents: number;
  performanceAlertThreshold: number;
  autoResolveTimeoutHours: number;
}

export interface DORAMetrics {
  deploymentFrequency: number;
  leadTime: number;
  changeFailureRate: number;
  meanTimeToRecovery: number;
}

export interface BudgetForecast {
  currentMonthSpend: number;
  projectedMonthEnd: number;
  monthlyBudget: number | null;
  daysUntilBudgetExhausted: number | null;
  trend: "under" | "on_track" | "over";
  recommendation: string;
}

export interface MemoryHealth {
  totalEntries: number;
  activeEntries: number;
  archivedEntries: number;
  avgConfidence: number;
  staleCount: number;
  coverageGaps: string[];
}

export interface DepartmentImpactRow {
  department: string;
  issuesCompleted: number;
  totalCost: number;
  humanHoursEquivalent: number;
}

export interface DepartmentBudgetVsActualRow {
  department: string;
  budget: number | null;
  actual: number;
  variance: number;
}

export interface AgentEfficiencyRow {
  agentId: string;
  agentName: string;
  costPerIssue: number;
  issuesCompleted: number;
  performanceScore: number;
}

export interface HumanOverrideRate {
  totalRuns: number;
  overriddenRuns: number;
  overrideRate: number;
}

export interface ContextWindowUtilization {
  modelContextSize: number;
  avgInputTokens: number;
  utilizationPct: number;
  isApproachingLimit: boolean;
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

  healthScore: (companyId: string) =>
    api.get<CompanyHealthScore>(`/companies/${companyId}/executive/health-score`),

  emergencyPauseAll: (companyId: string) =>
    api.post<{ paused: number; message: string }>(
      `/companies/${companyId}/agents/emergency-pause-all`,
      {},
    ),

  tokenAnalytics: (companyId: string, periodDays = 30) =>
    api.get<CompanyTokenSummary>(
      `/companies/${companyId}/token-analytics?periodDays=${periodDays}`,
    ),

  agentTokenAnalytics: (companyId: string, agentId: string, periodDays = 30) =>
    api.get<AgentTokenAnalytics>(
      `/companies/${companyId}/token-analytics/${agentId}?periodDays=${periodDays}`,
    ),

  agentSecurityProfile: (companyId: string, agentId: string) =>
    api.get<AgentSecurityProfile>(
      `/companies/${companyId}/agents/${agentId}/security-profile`,
    ),

  complianceExport: (companyId: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return api.get<ComplianceExportData>(
      `/companies/${companyId}/compliance-export${qs ? `?${qs}` : ""}`,
    );
  },

  complianceExportCsv: (companyId: string, from?: string, to?: string) => {
    const params = new URLSearchParams({ format: "csv" });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    window.location.href = `/api/companies/${companyId}/compliance-export?${params.toString()}`;
  },

  permissionMatrix: (companyId: string) =>
    api.get<PermissionMatrixData>(
      `/companies/${companyId}/permission-matrix`,
    ),

  getAlerts: (companyId: string, severity: AlertSeverity = "medium") =>
    api.get<SmartAlert[]>(`/companies/${companyId}/alerts?severity=${severity}`),

  resolveAlert: (companyId: string, alertId: string) =>
    api.post<{ ok: boolean }>(`/companies/${companyId}/alerts/${alertId}/resolve`, {}),

  departmentSpending: (companyId: string) =>
    api.get<DepartmentSpendingRow[]>(`/companies/${companyId}/department-spending`),

  getRiskSettings: (companyId: string) =>
    api.get<CompanyRiskSettings>(`/companies/${companyId}/risk-settings`),

  updateRiskSettings: (companyId: string, settings: Partial<CompanyRiskSettings>) =>
    api.patch<CompanyRiskSettings>(`/companies/${companyId}/risk-settings`, settings),

  doraMetrics: (companyId: string, days = 30) =>
    api.get<DORAMetrics>(`/companies/${companyId}/dora-metrics?days=${days}`),

  budgetForecast: (companyId: string) =>
    api.get<BudgetForecast>(`/companies/${companyId}/budget-forecast`),

  memoryHealth: (companyId: string, agentId: string) =>
    api.get<MemoryHealth>(`/companies/${companyId}/agents/${agentId}/memory-health`),

  departmentImpact: (companyId: string, periodDays = 30) =>
    api.get<DepartmentImpactRow[]>(`/companies/${companyId}/department-impact?periodDays=${periodDays}`),

  departmentBudgetVsActual: (companyId: string) =>
    api.get<DepartmentBudgetVsActualRow[]>(`/companies/${companyId}/department-budget-vs-actual`),

  agentEfficiencyRankings: (companyId: string) =>
    api.get<AgentEfficiencyRow[]>(`/companies/${companyId}/agent-efficiency-rankings`),

  humanOverrideRate: (companyId: string, periodDays = 30) =>
    api.get<HumanOverrideRate>(`/companies/${companyId}/human-override-rate?periodDays=${periodDays}`),

  contextWindowUtilization: (companyId: string, agentId: string) =>
    api.get<ContextWindowUtilization>(`/companies/${companyId}/agents/${agentId}/context-window`),
};

import { api } from "./client";

/* ── Types ────────────────────────────────────────────────────── */

export interface AdminDashboardStats {
  totalCompanies: number;
  totalAgents: number;
  totalUsers: number;
  mrrCents: number;
  activeAgentsNow: number;
  runsToday: number;
  totalSpendTodayCents: number;
  errorRate24h: number;
  subscriptionsByTier: Record<string, number>;
  recentSignups: AdminRecentSignup[];
  alerts: AdminAlert[];
  topCompaniesBySpend: AdminCompanySpend[];
}

export interface AdminRecentSignup {
  id: string;
  name: string;
  issuePrefix: string;
  planTier: string;
  createdAt: string;
}

export interface AdminAlert {
  type: "budget_exceeded" | "agent_failures" | "open_budget_incidents" | "failed_payments" | "paused_companies";
  severity: "warning" | "error" | "info";
  message: string;
  count: number;
  targetPath?: string;
}

export interface AdminCompanySpend {
  companyId: string;
  companyName: string;
  spendCents: number;
  agentCount: number;
}

export interface AdminCompany {
  id: string;
  name: string;
  issuePrefix: string;
  status: string;
  planTier: string;
  agentCount: number;
  userCount: number;
  mtdSpendCents: number;
  budgetMonthlyCents: number;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  companyCount: number;
  isInstanceAdmin: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  status: "active" | "inactive";
}

export interface AdminMonitoringMetrics {
  cpuUsagePercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  uptimeSeconds: number;
  dbSizeMb: number;
  runsToday: number;
  successRate24h: number;
  avgDurationSeconds24h: number;
  currentlyRunning: number;
  queued: number;
  topCompaniesBySpend: AdminCompanySpend[];
  recentErrors: AdminErrorEntry[];
}

export interface AdminErrorEntry {
  id: string;
  companyName: string;
  agentName: string;
  errorCode: string | null;
  errorMessage: string;
  exitCode: number | null;
  runId: string;
  timestamp: string;
}

export interface AdminAuditEntry {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AnalyticsDataPoint {
  label: string;
  value: number;
}

export interface AdminAnalyticsData {
  mrr: AnalyticsDataPoint[];
  signups: AnalyticsDataPoint[];
  churn: AnalyticsDataPoint[];
  agentUtilization: AnalyticsDataPoint[];
}

export interface AdminCurrentMetrics {
  mrrCents: number;
  mrrGrowthPct: number;
  totalSignups: number;
  churnRatePct: number;
}

export interface SupportTicketComment {
  id: string;
  body: string;
  authorName: string | null;
  authorEmail: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  type: "bug" | "feature";
  status: "open" | "in-progress" | "resolved";
  subject: string;
  body: string;
  userEmail: string;
  userName: string | null;
  companyName: string | null;
  createdAt: string;
  comments?: SupportTicketComment[];
}

/* ── API Client ───────────────────────────────────────────────── */

export const adminApi = {
  getDashboard: () => api.get<AdminDashboardStats>("/admin/dashboard"),
  getCompanies: () => api.get<AdminCompany[]>("/admin/companies"),
  getCompany: (id: string) => api.get<AdminCompany>(`/admin/companies/${id}`),
  pauseCompany: (id: string, reason?: string) =>
    api.post<void>(`/admin/companies/${id}/pause`, { reason }),
  resumeCompany: (id: string) =>
    api.post<void>(`/admin/companies/${id}/resume`, {}),
  getUsers: () => api.get<AdminUser[]>("/admin/users"),
  getMonitoring: () => api.get<AdminMonitoringMetrics>("/admin/monitoring"),
  getAuditLog: (limit?: number) =>
    api.get<AdminAuditEntry[]>(`/admin/audit-log?limit=${limit ?? 100}`),
  // Analytics
  getAnalytics: (days?: number) =>
    api.get<AdminAnalyticsData>(`/admin/analytics?days=${days ?? 90}`),
  exportAnalytics: () => {
    window.location.href = "/api/admin/analytics/export";
  },
  getCurrentMetrics: () => api.get<AdminCurrentMetrics>("/admin/analytics/current"),
  // Support
  getSupportTickets: () => api.get<SupportTicket[]>("/admin/support/tickets"),
  getSupportTicket: (id: string) =>
    api.get<SupportTicket>(`/admin/support/tickets/${id}`),
  replyToTicket: (id: string, body: string) =>
    api.post<void>(`/admin/support/tickets/${id}/comments`, { body }),
  updateTicketStatus: (id: string, status: SupportTicket["status"]) =>
    api.patch<void>(`/admin/support/tickets/${id}`, { status }),
};

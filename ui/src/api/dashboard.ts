import type { DashboardSummary } from "@ironworksai/shared";
import { api } from "./client";

export interface WarRoomGoalProgress {
  goalId: string;
  title: string;
  status: string;
  level: string;
  totalIssues: number;
  completedIssues: number;
  inProgressIssues: number;
  progressPercent: number;
}

export interface WarRoomResponse {
  summary: DashboardSummary;
  goalsProgress: WarRoomGoalProgress[];
  windowSpend24hCents: number;
}

export const dashboardApi = {
  summary: (companyId: string) => api.get<DashboardSummary>(`/companies/${companyId}/dashboard`),
  /** Batch endpoint combining summary + goals progress + window spend. */
  warRoom: (companyId: string) => api.get<WarRoomResponse>(`/companies/${companyId}/war-room`),
};

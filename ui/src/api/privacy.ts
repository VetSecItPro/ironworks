import { api } from "./client";

export interface PrivacySummary {
  dataCategories: Array<{
    category: string;
    description: string;
    count: number;
  }>;
  retentionPolicies: Record<string, string>;
  rights: Record<string, string>;
}

export interface ErasureResponse {
  status: string;
  message: string;
  scheduledDeletionAt: string;
}

export const privacyApi = {
  summary: (companyId: string) =>
    api.get<PrivacySummary>(
      `/companies/${encodeURIComponent(companyId)}/privacy/summary`,
    ),

  exportData: (companyId: string) =>
    // Returns the download URL — browser handles the download
    `/api/companies/${encodeURIComponent(companyId)}/privacy/data-export`,

  requestErasure: (companyId: string) =>
    api.post<ErasureResponse>(
      `/companies/${encodeURIComponent(companyId)}/privacy/erasure-request`,
      { confirm: true },
    ),

  runCleanup: () =>
    api.post<Record<string, number>>("/privacy/retention/run-cleanup", {}),
};

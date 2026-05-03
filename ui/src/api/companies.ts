import type {
  Company,
  CompanyPortabilityExportPreviewResult,
  CompanyPortabilityExportRequest,
  CompanyPortabilityExportResult,
  CompanyPortabilityImportRequest,
  CompanyPortabilityImportResult,
  CompanyPortabilityPreviewRequest,
  CompanyPortabilityPreviewResult,
  OnboardCompany,
  UpdateCompanyBranding,
} from "@ironworksai/shared";
import { api } from "./client";

export type CompanyStats = Record<string, { agentCount: number; issueCount: number }>;

export interface OnboardCompanyResponse {
  companyId: string;
  companyPrefix: string;
  companyGoalId: string | null;
  primaryAgentId: string | null;
  agentIds: string[];
  projectId: string | null;
  primaryIssueRef: string | null;
}

export const companiesApi = {
  list: () => api.get<Company[]>("/companies"),
  get: (companyId: string) => api.get<Company>(`/companies/${companyId}`),
  stats: () => api.get<CompanyStats>("/companies/stats"),
  create: (data: { name: string; description?: string | null; budgetMonthlyCents?: number }) =>
    api.post<Company>("/companies", data),
  // Single-shot company creation for the onboarding wizard's Launch button.
  // Server runs every dependent insert atomically — on any failure the
  // partially built company is wiped before the error reaches the client.
  onboard: (data: OnboardCompany) => api.post<OnboardCompanyResponse>("/companies/onboard", data),
  update: (
    companyId: string,
    data: Partial<
      Pick<
        Company,
        | "name"
        | "description"
        | "status"
        | "budgetMonthlyCents"
        | "requireBoardApprovalForNewAgents"
        | "brandColor"
        | "logoAssetId"
      >
    >,
  ) => api.patch<Company>(`/companies/${companyId}`, data),
  updateBranding: (companyId: string, data: UpdateCompanyBranding) =>
    api.patch<Company>(`/companies/${companyId}/branding`, data),
  archive: (companyId: string) => api.post<Company>(`/companies/${companyId}/archive`, {}),
  remove: (companyId: string) => api.delete<{ ok: true }>(`/companies/${companyId}`),
  exportBundle: (companyId: string, data: CompanyPortabilityExportRequest) =>
    api.post<CompanyPortabilityExportResult>(`/companies/${companyId}/export`, data),
  exportPreview: (companyId: string, data: CompanyPortabilityExportRequest) =>
    api.post<CompanyPortabilityExportPreviewResult>(`/companies/${companyId}/exports/preview`, data),
  exportPackage: (companyId: string, data: CompanyPortabilityExportRequest) =>
    api.post<CompanyPortabilityExportResult>(`/companies/${companyId}/exports`, data),
  importPreview: (data: CompanyPortabilityPreviewRequest) =>
    api.post<CompanyPortabilityPreviewResult>("/companies/import/preview", data),
  importBundle: (data: CompanyPortabilityImportRequest) =>
    api.post<CompanyPortabilityImportResult>("/companies/import", data),
};

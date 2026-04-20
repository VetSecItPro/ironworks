import { api } from "./client";

export interface BugReport {
  id: string;
  companyId: string | null;
  reportedByUserId: string | null;
  type: "bug" | "feature_request";
  title: string;
  description: string | null;
  pageUrl: string | null;
  severity: "low" | "medium" | "high" | "critical" | null;
  status: "open" | "in_progress" | "resolved" | "closed";
  adminNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reporterEmail?: string | null;
  reporterName?: string | null;
}

export interface CreateBugReportInput {
  type: "bug" | "feature_request";
  title: string;
  description?: string;
  pageUrl?: string;
  severity?: "low" | "medium" | "high" | "critical";
}

export interface UpdateBugReportInput {
  status?: "open" | "in_progress" | "resolved" | "closed";
  adminNotes?: string;
}

export const bugReportsApi = {
  create: (input: CreateBugReportInput) => api.post<BugReport>("/bug-reports", input),

  list: (params?: { status?: string; type?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.type) searchParams.set("type", params.type);
    const qs = searchParams.toString();
    return api.get<BugReport[]>(`/bug-reports${qs ? `?${qs}` : ""}`);
  },

  update: (id: string, input: UpdateBugReportInput) => api.patch<BugReport>(`/bug-reports/${id}`, input),
};

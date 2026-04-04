import { api } from "./client";

export interface KnowledgePage {
  id: string;
  companyId: string;
  slug: string;
  title: string;
  body: string;
  visibility: "company" | "project" | "private";
  projectId: string | null;
  revisionNumber: number;
  isSeeded: string | null;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  updatedByAgentId: string | null;
  updatedByUserId: string | null;
  agentId: string | null;
  department: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgePageRevision {
  id: string;
  pageId: string;
  companyId: string;
  revisionNumber: number;
  title: string;
  body: string;
  changeSummary: string | null;
  editedByAgentId: string | null;
  editedByUserId: string | null;
  createdAt: string;
}

export const knowledgeApi = {
  list: (companyId: string, q?: string, department?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (department && department !== "all") params.set("department", department);
    const qs = params.toString();
    return api.get<KnowledgePage[]>(`/companies/${companyId}/knowledge${qs ? `?${qs}` : ""}`);
  },

  get: (pageId: string) =>
    api.get<KnowledgePage>(`/knowledge/${pageId}`),

  getBySlug: (companyId: string, slug: string) =>
    api.get<KnowledgePage>(`/companies/${companyId}/knowledge/slug/${encodeURIComponent(slug)}`),

  create: (companyId: string, data: { title: string; body?: string; visibility?: string; projectId?: string; department?: string }) =>
    api.post<KnowledgePage>(`/companies/${companyId}/knowledge`, data),

  update: (pageId: string, data: { title?: string; body?: string; visibility?: string; projectId?: string; changeSummary?: string }) =>
    api.patch<KnowledgePage>(`/knowledge/${pageId}`, data),

  remove: (pageId: string) =>
    api.delete<{ ok: boolean }>(`/knowledge/${pageId}`),

  listRevisions: (pageId: string) =>
    api.get<KnowledgePageRevision[]>(`/knowledge/${pageId}/revisions`),

  getRevision: (pageId: string, revisionNumber: number) =>
    api.get<KnowledgePageRevision>(`/knowledge/${pageId}/revisions/${revisionNumber}`),

  revert: (pageId: string, revisionNumber: number) =>
    api.post<KnowledgePage>(`/knowledge/${pageId}/revisions/${revisionNumber}/revert`, {}),

  seed: (companyId: string) =>
    api.post<{ seeded: boolean; count: number }>(`/companies/${companyId}/knowledge/seed`, {}),
};

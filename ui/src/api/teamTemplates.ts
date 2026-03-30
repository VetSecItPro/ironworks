import { api } from "./client";

export interface RoleSummary {
  key: string;
  title: string;
  tagline: string;
  icon: string;
  role: string;
  reportsTo: string | null;
  suggestedAdapter: string;
  skills: string[];
}

export interface TeamPack {
  key: string;
  name: string;
  description: string;
  icon: string;
  roles: RoleSummary[];
  roleCount: number;
}

export interface RoleTemplateDetail extends RoleSummary {
  soul: string;
  agents: string;
}

export const teamTemplatesApi = {
  listPacks: () => api.get<TeamPack[]>("/team-templates/packs"),

  listRoles: () => api.get<RoleSummary[]>("/team-templates/roles"),

  getRole: (key: string) =>
    api.get<RoleTemplateDetail>(`/team-templates/roles/${encodeURIComponent(key)}`),
};

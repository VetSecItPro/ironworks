import { getDefaultCapabilitiesForRole, type RoleCapabilities } from "./role-defaults.js";

export type NormalizedAgentPermissions = RoleCapabilities & {
  canCreateAgents: boolean;
  [key: string]: unknown;
};

export function defaultPermissionsForRole(role: string): NormalizedAgentPermissions {
  const caps = getDefaultCapabilitiesForRole(role);
  return {
    ...caps,
    // Legacy field: CEO and CTO can create agents
    canCreateAgents: caps.canManageAgents,
  };
}

export function normalizeAgentPermissions(
  permissions: unknown,
  role: string,
): NormalizedAgentPermissions {
  const defaults = defaultPermissionsForRole(role);
  if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions)) {
    return defaults;
  }

  const record = permissions as Record<string, unknown>;

  function boolOr(key: string, fallback: boolean): boolean {
    return typeof record[key] === "boolean" ? (record[key] as boolean) : fallback;
  }

  return {
    canCreateAgents: boolOr("canCreateAgents", defaults.canCreateAgents),
    canManageAgents: boolOr("canManageAgents", defaults.canManageAgents),
    canManageProjects: boolOr("canManageProjects", defaults.canManageProjects),
    canManageGoals: boolOr("canManageGoals", defaults.canManageGoals),
    canManagePlaybooks: boolOr("canManagePlaybooks", defaults.canManagePlaybooks),
    canManageSecrets: boolOr("canManageSecrets", defaults.canManageSecrets),
    canManagePermissions: boolOr("canManagePermissions", defaults.canManagePermissions),
    canCreateIssues: boolOr("canCreateIssues", defaults.canCreateIssues),
    canRunPlaybooks: boolOr("canRunPlaybooks", defaults.canRunPlaybooks),
    canAccessKB: boolOr("canAccessKB", defaults.canAccessKB),
    canDelegateWork: boolOr("canDelegateWork", defaults.canDelegateWork),
  };
}

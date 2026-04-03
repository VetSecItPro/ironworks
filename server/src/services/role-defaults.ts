export interface RoleCapabilities {
  canManageAgents: boolean;
  canManageProjects: boolean;
  canManageGoals: boolean;
  canManagePlaybooks: boolean;
  canManageSecrets: boolean;
  canManagePermissions: boolean;
  canCreateIssues: boolean;
  canRunPlaybooks: boolean;
  canAccessKB: boolean;
  canDelegateWork: boolean;
}

export const ROLE_DEFAULT_CAPABILITIES: Record<string, RoleCapabilities> = {
  ceo: {
    canManageAgents: true,
    canManageProjects: true,
    canManageGoals: true,
    canManagePlaybooks: true,
    canManageSecrets: true,
    canManagePermissions: true,
    canCreateIssues: true,
    canRunPlaybooks: true,
    canAccessKB: true,
    canDelegateWork: true,
  },
  cto: {
    canManageAgents: true,
    canManageProjects: true,
    canManageGoals: true,
    canManagePlaybooks: true,
    canManageSecrets: true,
    canManagePermissions: true,
    canCreateIssues: true,
    canRunPlaybooks: true,
    canAccessKB: true,
    canDelegateWork: true,
  },
  cfo: {
    canManageAgents: false,
    canManageProjects: false,
    canManageGoals: true,
    canManagePlaybooks: false,
    canManageSecrets: false,
    canManagePermissions: false,
    canCreateIssues: true,
    canRunPlaybooks: true,
    canAccessKB: true,
    canDelegateWork: false,
  },
  cmo: {
    canManageAgents: false,
    canManageProjects: true,
    canManageGoals: true,
    canManagePlaybooks: true,
    canManageSecrets: false,
    canManagePermissions: false,
    canCreateIssues: true,
    canRunPlaybooks: true,
    canAccessKB: true,
    canDelegateWork: true,
  },
  engineer: {
    canManageAgents: false,
    canManageProjects: false,
    canManageGoals: false,
    canManagePlaybooks: false,
    canManageSecrets: false,
    canManagePermissions: false,
    canCreateIssues: true,
    canRunPlaybooks: false,
    canAccessKB: true,
    canDelegateWork: false,
  },
  compliance_director: {
    canManageAgents: false,
    canManageProjects: false,
    canManageGoals: false,
    canManagePlaybooks: false,
    canManageSecrets: false,
    canManagePermissions: false,
    canCreateIssues: true,
    canRunPlaybooks: true,
    canAccessKB: true,
    canDelegateWork: false,
    // Compliance-specific: read access to everything, write to compliance issues
  },
  default: {
    canManageAgents: false,
    canManageProjects: false,
    canManageGoals: false,
    canManagePlaybooks: false,
    canManageSecrets: false,
    canManagePermissions: false,
    canCreateIssues: true,
    canRunPlaybooks: false,
    canAccessKB: true,
    canDelegateWork: false,
  },
};

export function getDefaultCapabilitiesForRole(role: string): RoleCapabilities {
  return ROLE_DEFAULT_CAPABILITIES[role] ?? ROLE_DEFAULT_CAPABILITIES["default"]!;
}

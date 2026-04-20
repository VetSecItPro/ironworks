export function defaultProjectWorkspaceIdForProject(
  project:
    | {
        workspaces?: Array<{ id: string; isPrimary: boolean }>;
        executionWorkspacePolicy?: { defaultProjectWorkspaceId?: string | null } | null;
      }
    | null
    | undefined,
) {
  if (!project) return null;
  return (
    project.executionWorkspacePolicy?.defaultProjectWorkspaceId ??
    project.workspaces?.find((workspace) => workspace.isPrimary)?.id ??
    project.workspaces?.[0]?.id ??
    null
  );
}

export function defaultExecutionWorkspaceModeForProject(
  project: { executionWorkspacePolicy?: { enabled?: boolean; defaultMode?: string | null } | null } | null | undefined,
) {
  const defaultMode = project?.executionWorkspacePolicy?.enabled ? project.executionWorkspacePolicy.defaultMode : null;
  if (defaultMode === "isolated_workspace" || defaultMode === "operator_branch") return defaultMode;
  if (defaultMode === "adapter_default") return "agent_default";
  return "shared_workspace";
}

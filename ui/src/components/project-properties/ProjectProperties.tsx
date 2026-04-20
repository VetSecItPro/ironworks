import type { Project } from "@ironworksai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/lib/router";
import { goalsApi } from "../../api/goals";
import { instanceSettingsApi } from "../../api/instanceSettings";
import { projectsApi } from "../../api/projects";
import { useCompany } from "../../context/CompanyContext";
import { queryKeys } from "../../lib/queryKeys";
import { cn, formatDate } from "../../lib/utils";
import { DraftInput } from "../agent-config-primitives";
import { InlineEditor } from "../InlineEditor";
import { StatusBadge } from "../StatusBadge";
import { CodebaseSection } from "./CodebaseSection";
import { ExecutionWorkspaceSection, type ExecutionWorkspaceSectionProps } from "./ExecutionWorkspaceSection";
import { ArchiveDangerZone, DeleteDangerZone, FieldLabel, ProjectStatusPicker, PropertyRow } from "./PropertyHelpers";
import type { ProjectConfigFieldKey, ProjectFieldSaveState } from "./types";

// Re-export types
export type { ProjectConfigFieldKey, ProjectFieldSaveState } from "./types";

interface ProjectPropertiesProps {
  project: Project;
  onUpdate?: (data: Record<string, unknown>) => void;
  onFieldUpdate?: (field: ProjectConfigFieldKey, data: Record<string, unknown>) => void;
  getFieldSaveState?: (field: ProjectConfigFieldKey) => ProjectFieldSaveState;
  onArchive?: (archived: boolean) => void;
  onDelete?: () => void;
  deletePending?: boolean;
  archivePending?: boolean;
}

export function ProjectProperties({
  project,
  onUpdate,
  onFieldUpdate,
  getFieldSaveState,
  onArchive,
  archivePending,
  onDelete,
  deletePending,
}: ProjectPropertiesProps) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [goalOpen, setGoalOpen] = useState(false);
  const [executionWorkspaceAdvancedOpen, setExecutionWorkspaceAdvancedOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"local" | "repo" | null>(null);
  const [workspaceCwd, setWorkspaceCwd] = useState("");
  const [workspaceRepoUrl, setWorkspaceRepoUrl] = useState("");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const commitField = (field: ProjectConfigFieldKey, data: Record<string, unknown>) => {
    if (onFieldUpdate) {
      onFieldUpdate(field, data);
      return;
    }
    onUpdate?.(data);
  };
  const fieldState = (field: ProjectConfigFieldKey): ProjectFieldSaveState => getFieldSaveState?.(field) ?? "idle";

  const { data: allGoals } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });

  const linkedGoalIds = project.goalIds.length > 0 ? project.goalIds : project.goalId ? [project.goalId] : [];
  const linkedGoals =
    project.goals.length > 0
      ? project.goals
      : linkedGoalIds.map((id) => ({ id, title: allGoals?.find((g) => g.id === id)?.title ?? id.slice(0, 8) }));
  const availableGoals = (allGoals ?? []).filter((g) => !linkedGoalIds.includes(g.id));
  const workspaces = project.workspaces ?? [];
  const codebase = project.codebase;
  const primaryCodebaseWorkspace = project.primaryWorkspace ?? null;
  const hasAdditionalLegacyWorkspaces = workspaces.some((workspace) => workspace.id !== primaryCodebaseWorkspace?.id);
  const executionWorkspacePolicy = project.executionWorkspacePolicy ?? null;
  const executionWorkspacesEnabled = executionWorkspacePolicy?.enabled === true;
  const isolatedWorkspacesEnabled = experimentalSettings?.enableIsolatedWorkspaces === true;
  const executionWorkspaceDefaultMode =
    executionWorkspacePolicy?.defaultMode === "isolated_workspace" ? "isolated_workspace" : "shared_workspace";
  const executionWorkspaceStrategy = executionWorkspacePolicy?.workspaceStrategy ?? {
    type: "git_worktree",
    baseRef: "",
    branchTemplate: "",
    worktreeParentDir: "",
  };

  const invalidateProject = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
    if (project.urlKey !== project.id)
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.urlKey) });
    if (selectedCompanyId) queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(selectedCompanyId) });
  };

  const createWorkspace = useMutation({
    mutationFn: (data: Record<string, unknown>) => projectsApi.createWorkspace(project.id, data),
    onSuccess: () => {
      setWorkspaceCwd("");
      setWorkspaceRepoUrl("");
      setWorkspaceMode(null);
      setWorkspaceError(null);
      invalidateProject();
    },
  });
  const removeWorkspace = useMutation({
    mutationFn: (workspaceId: string) => projectsApi.removeWorkspace(project.id, workspaceId),
    onSuccess: () => {
      setWorkspaceCwd("");
      setWorkspaceRepoUrl("");
      setWorkspaceMode(null);
      setWorkspaceError(null);
      invalidateProject();
    },
  });
  const updateWorkspace = useMutation({
    mutationFn: ({ workspaceId, data }: { workspaceId: string; data: Record<string, unknown> }) =>
      projectsApi.updateWorkspace(project.id, workspaceId, data),
    onSuccess: () => {
      setWorkspaceCwd("");
      setWorkspaceRepoUrl("");
      setWorkspaceMode(null);
      setWorkspaceError(null);
      invalidateProject();
    },
  });

  const removeGoal = (goalId: string) => {
    if (!onUpdate && !onFieldUpdate) return;
    commitField("goals", { goalIds: linkedGoalIds.filter((id) => id !== goalId) });
  };
  const addGoal = (goalId: string) => {
    if ((!onUpdate && !onFieldUpdate) || linkedGoalIds.includes(goalId)) return;
    commitField("goals", { goalIds: [...linkedGoalIds, goalId] });
    setGoalOpen(false);
  };

  const updateExecutionWorkspacePolicy = (patch: Record<string, unknown>) => {
    if (!onUpdate && !onFieldUpdate) return;
    return {
      executionWorkspacePolicy: {
        enabled: executionWorkspacesEnabled,
        defaultMode: executionWorkspaceDefaultMode,
        allowIssueOverride: executionWorkspacePolicy?.allowIssueOverride ?? true,
        ...executionWorkspacePolicy,
        ...patch,
      },
    };
  };

  const isAbsolutePath = (value: string) => value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
  const isGitHubRepoUrl = (value: string) => {
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      if (host !== "github.com" && host !== "www.github.com") return false;
      return parsed.pathname.split("/").filter(Boolean).length >= 2;
    } catch {
      return false;
    }
  };

  const deriveSourceType = (cwd: string | null, repoUrl: string | null) => {
    if (repoUrl) return "git_repo";
    if (cwd) return "local_path";
    return undefined;
  };

  const persistCodebase = (patch: { cwd?: string | null; repoUrl?: string | null }) => {
    const nextCwd = patch.cwd !== undefined ? patch.cwd : codebase.localFolder;
    const nextRepoUrl = patch.repoUrl !== undefined ? patch.repoUrl : codebase.repoUrl;
    if (!nextCwd && !nextRepoUrl) {
      if (primaryCodebaseWorkspace) removeWorkspace.mutate(primaryCodebaseWorkspace.id);
      return;
    }
    const data: Record<string, unknown> = {
      ...(patch.cwd !== undefined ? { cwd: patch.cwd } : {}),
      ...(patch.repoUrl !== undefined ? { repoUrl: patch.repoUrl } : {}),
      ...(deriveSourceType(nextCwd, nextRepoUrl) ? { sourceType: deriveSourceType(nextCwd, nextRepoUrl) } : {}),
      isPrimary: true,
    };
    if (primaryCodebaseWorkspace) {
      updateWorkspace.mutate({ workspaceId: primaryCodebaseWorkspace.id, data });
      return;
    }
    createWorkspace.mutate(data);
  };

  const submitLocalWorkspace = () => {
    const cwd = workspaceCwd.trim();
    if (!cwd) {
      setWorkspaceError(null);
      persistCodebase({ cwd: null });
      return;
    }
    if (!isAbsolutePath(cwd)) {
      setWorkspaceError("Local folder must be a full absolute path.");
      return;
    }
    setWorkspaceError(null);
    persistCodebase({ cwd });
  };

  const submitRepoWorkspace = () => {
    const repoUrl = workspaceRepoUrl.trim();
    if (!repoUrl) {
      setWorkspaceError(null);
      persistCodebase({ repoUrl: null });
      return;
    }
    if (!isGitHubRepoUrl(repoUrl)) {
      setWorkspaceError("Repo must use a valid GitHub repo URL.");
      return;
    }
    setWorkspaceError(null);
    persistCodebase({ repoUrl });
  };

  const clearLocalWorkspace = () => {
    const confirmed = window.confirm(
      codebase.repoUrl ? "Clear local folder from this workspace?" : "Delete this workspace local folder?",
    );
    if (!confirmed) return;
    persistCodebase({ cwd: null });
  };

  const clearRepoWorkspace = () => {
    const hasLocalFolder = Boolean(codebase.localFolder);
    const confirmed = window.confirm(
      hasLocalFolder ? "Clear repo from this workspace?" : "Delete this workspace repo?",
    );
    if (!confirmed) return;
    if (primaryCodebaseWorkspace && hasLocalFolder) {
      updateWorkspace.mutate({
        workspaceId: primaryCodebaseWorkspace.id,
        data: {
          repoUrl: null,
          repoRef: null,
          defaultRef: null,
          sourceType: deriveSourceType(codebase.localFolder, null),
        },
      });
      return;
    }
    persistCodebase({ repoUrl: null });
  };

  return (
    <div>
      <div className="space-y-1 pb-4">
        <PropertyRow label={<FieldLabel label="Name" state={fieldState("name")} />}>
          {onUpdate || onFieldUpdate ? (
            <DraftInput
              value={project.name}
              onCommit={(name) => commitField("name", { name })}
              immediate
              className="w-full rounded border border-border bg-transparent px-2 py-1 text-sm outline-none"
              placeholder="Project name"
            />
          ) : (
            <span className="text-sm">{project.name}</span>
          )}
        </PropertyRow>
        <PropertyRow
          label={<FieldLabel label="Description" state={fieldState("description")} />}
          alignStart
          valueClassName="space-y-0.5"
        >
          {onUpdate || onFieldUpdate ? (
            <InlineEditor
              value={project.description ?? ""}
              onSave={(description) => commitField("description", { description })}
              as="p"
              className="text-sm text-muted-foreground"
              placeholder="Add a description..."
              multiline
            />
          ) : (
            <p className="text-sm text-muted-foreground">{project.description?.trim() || "No description"}</p>
          )}
        </PropertyRow>
        <PropertyRow label={<FieldLabel label="Status" state={fieldState("status")} />}>
          {onUpdate || onFieldUpdate ? (
            <ProjectStatusPicker status={project.status} onChange={(status) => commitField("status", { status })} />
          ) : (
            <StatusBadge status={project.status} />
          )}
        </PropertyRow>
        {project.leadAgentId && (
          <PropertyRow label="Lead">
            <span className="text-sm font-mono">{project.leadAgentId.slice(0, 8)}</span>
          </PropertyRow>
        )}
        <PropertyRow
          label={<FieldLabel label="Goals" state={fieldState("goals")} />}
          alignStart
          valueClassName="space-y-2"
        >
          {linkedGoals.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {linkedGoals.map((goal) => (
                <span
                  key={goal.id}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"
                >
                  <Link to={`/goals/${goal.id}`} className="hover:underline max-w-[220px] truncate">
                    {goal.title}
                  </Link>
                  {(onUpdate || onFieldUpdate) && (
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      type="button"
                      onClick={() => removeGoal(goal.id)}
                      aria-label={`Remove goal ${goal.title}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          {(onUpdate || onFieldUpdate) && (
            <Popover open={goalOpen} onOpenChange={setGoalOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="xs"
                  className={cn("h-6 w-fit px-2", linkedGoals.length > 0 && "ml-1")}
                  disabled={availableGoals.length === 0}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Goal
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-1" align="start">
                {availableGoals.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">All goals linked.</div>
                ) : (
                  availableGoals.map((goal) => (
                    <button
                      key={goal.id}
                      className="flex items-center w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50"
                      onClick={() => addGoal(goal.id)}
                    >
                      {goal.title}
                    </button>
                  ))
                )}
              </PopoverContent>
            </Popover>
          )}
        </PropertyRow>
        <PropertyRow label={<FieldLabel label="Created" state="idle" />}>
          <span className="text-sm">{formatDate(project.createdAt)}</span>
        </PropertyRow>
        <PropertyRow label={<FieldLabel label="Updated" state="idle" />}>
          <span className="text-sm">{formatDate(project.updatedAt)}</span>
        </PropertyRow>
        {project.targetDate && (
          <PropertyRow label={<FieldLabel label="Target Date" state="idle" />}>
            <span className="text-sm">{formatDate(project.targetDate)}</span>
          </PropertyRow>
        )}
      </div>

      <Separator className="my-4" />

      <div className="space-y-1 py-4">
        <CodebaseSection
          project={project}
          codebase={codebase}
          primaryCodebaseWorkspace={primaryCodebaseWorkspace}
          hasAdditionalLegacyWorkspaces={hasAdditionalLegacyWorkspaces}
          workspaceMode={workspaceMode}
          workspaceCwd={workspaceCwd}
          workspaceRepoUrl={workspaceRepoUrl}
          workspaceError={workspaceError}
          createPending={createWorkspace.isPending}
          updatePending={updateWorkspace.isPending}
          removePending={removeWorkspace.isPending}
          createError={createWorkspace.isError}
          updateError={updateWorkspace.isError}
          removeError={removeWorkspace.isError}
          onSetWorkspaceMode={setWorkspaceMode}
          onSetWorkspaceCwd={setWorkspaceCwd}
          onSetWorkspaceRepoUrl={setWorkspaceRepoUrl}
          onSetWorkspaceError={setWorkspaceError}
          onSubmitLocal={submitLocalWorkspace}
          onSubmitRepo={submitRepoWorkspace}
          onClearLocal={clearLocalWorkspace}
          onClearRepo={clearRepoWorkspace}
        />

        {isolatedWorkspacesEnabled ? (
          <>
            <Separator className="my-4" />
            <ExecutionWorkspaceSection
              executionWorkspacesEnabled={executionWorkspacesEnabled}
              executionWorkspaceDefaultMode={executionWorkspaceDefaultMode}
              executionWorkspaceStrategy={
                executionWorkspaceStrategy as ExecutionWorkspaceSectionProps["executionWorkspaceStrategy"]
              }
              executionWorkspaceAdvancedOpen={executionWorkspaceAdvancedOpen}
              executionWorkspacePolicy={executionWorkspacePolicy as Record<string, unknown> | null}
              canEdit={!!(onUpdate || onFieldUpdate)}
              fieldState={fieldState}
              commitField={commitField}
              updateExecutionWorkspacePolicy={
                updateExecutionWorkspacePolicy as (
                  patch: Record<string, unknown>,
                ) => Record<string, unknown> | undefined
              }
              onToggleAdvanced={() => setExecutionWorkspaceAdvancedOpen((open) => !open)}
            />
          </>
        ) : null}
      </div>

      {onArchive && (
        <>
          <Separator className="my-4" />
          <div className="space-y-4 py-4">
            <div className="text-xs font-medium text-destructive uppercase tracking-wide">Danger Zone</div>
            <ArchiveDangerZone project={project} onArchive={onArchive} archivePending={archivePending} />
            {onDelete && <DeleteDangerZone project={project} onDelete={onDelete} deletePending={deletePending} />}
          </div>
        </>
      )}
    </div>
  );
}

import type { ExecutionWorkspace, Issue } from "@ironworksai/shared";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, GitBranch, Pencil, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router";
import { executionWorkspacesApi } from "../../api/execution-workspaces";
import { instanceSettingsApi } from "../../api/instanceSettings";
import { useCompany } from "../../context/CompanyContext";
import { queryKeys } from "../../lib/queryKeys";
import {
  BreakablePath,
  CopyableInline,
  configuredWorkspaceLabel,
  defaultExecutionWorkspaceModeForProject,
  EXECUTION_WORKSPACE_OPTIONS,
  issueModeForExistingWorkspace,
  shouldPresentExistingWorkspaceSelection,
  statusBadge,
  workspaceModeLabel,
} from "./workspace-helpers";

interface IssueWorkspaceCardProps {
  issue: Issue;
  project: {
    id: string;
    executionWorkspacePolicy?: {
      enabled?: boolean;
      defaultMode?: string | null;
      defaultProjectWorkspaceId?: string | null;
    } | null;
    workspaces?: Array<{ id: string; isPrimary: boolean }>;
  } | null;
  onUpdate: (data: Record<string, unknown>) => void;
}

export function IssueWorkspaceCard({ issue, project, onUpdate }: IssueWorkspaceCardProps) {
  const { selectedCompanyId } = useCompany();
  const companyId = issue.companyId ?? selectedCompanyId;
  const [editing, setEditing] = useState(false);

  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });

  const policyEnabled =
    experimentalSettings?.enableIsolatedWorkspaces === true && Boolean(project?.executionWorkspacePolicy?.enabled);

  const workspace = issue.currentExecutionWorkspace as ExecutionWorkspace | null | undefined;

  const { data: reusableExecutionWorkspaces } = useQuery({
    queryKey: queryKeys.executionWorkspaces.list(companyId!, {
      projectId: issue.projectId ?? undefined,
      projectWorkspaceId: issue.projectWorkspaceId ?? undefined,
      reuseEligible: true,
    }),
    queryFn: () =>
      executionWorkspacesApi.list(companyId!, {
        projectId: issue.projectId ?? undefined,
        projectWorkspaceId: issue.projectWorkspaceId ?? undefined,
        reuseEligible: true,
      }),
    enabled: Boolean(companyId) && Boolean(issue.projectId) && editing,
  });

  const deduplicatedReusableWorkspaces = useMemo(() => {
    const workspaces = reusableExecutionWorkspaces ?? [];
    const seen = new Map<string, (typeof workspaces)[number]>();
    for (const ws of workspaces) {
      const key = ws.cwd ?? ws.id;
      const existing = seen.get(key);
      if (!existing || new Date(ws.lastUsedAt) > new Date(existing.lastUsedAt)) seen.set(key, ws);
    }
    return Array.from(seen.values());
  }, [reusableExecutionWorkspaces]);

  const selectedReusableExecutionWorkspace =
    deduplicatedReusableWorkspaces.find((w) => w.id === issue.executionWorkspaceId) ?? workspace ?? null;

  const currentSelection = shouldPresentExistingWorkspaceSelection(issue)
    ? "reuse_existing"
    : (issue.executionWorkspacePreference ??
      issue.executionWorkspaceSettings?.mode ??
      defaultExecutionWorkspaceModeForProject(project));

  const [draftSelection, setDraftSelection] = useState(currentSelection);
  const [draftExecutionWorkspaceId, setDraftExecutionWorkspaceId] = useState(issue.executionWorkspaceId ?? "");

  useEffect(() => {
    if (editing) return;
    setDraftSelection(currentSelection);
    setDraftExecutionWorkspaceId(issue.executionWorkspaceId ?? "");
  }, [currentSelection, editing, issue.executionWorkspaceId]);

  const activeNonDefaultWorkspace = Boolean(workspace && workspace.mode !== "shared_workspace");
  const configuredReusableWorkspace =
    deduplicatedReusableWorkspaces.find((w) => w.id === draftExecutionWorkspaceId) ??
    (draftExecutionWorkspaceId === issue.executionWorkspaceId ? selectedReusableExecutionWorkspace : null);
  const canSaveWorkspaceConfig = draftSelection !== "reuse_existing" || draftExecutionWorkspaceId.length > 0;

  const handleSave = useCallback(() => {
    if (!canSaveWorkspaceConfig) return;
    onUpdate({
      executionWorkspacePreference: draftSelection,
      executionWorkspaceId: draftSelection === "reuse_existing" ? draftExecutionWorkspaceId || null : null,
      executionWorkspaceSettings: {
        mode:
          draftSelection === "reuse_existing"
            ? issueModeForExistingWorkspace(configuredReusableWorkspace?.mode)
            : draftSelection,
      },
    });
    setEditing(false);
  }, [canSaveWorkspaceConfig, configuredReusableWorkspace?.mode, draftExecutionWorkspaceId, draftSelection, onUpdate]);

  const handleCancel = useCallback(() => {
    setDraftSelection(currentSelection);
    setDraftExecutionWorkspaceId(issue.executionWorkspaceId ?? "");
    setEditing(false);
  }, [currentSelection, issue.executionWorkspaceId]);

  if (!policyEnabled || !project) return null;

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
          {activeNonDefaultWorkspace && workspace
            ? workspaceModeLabel(workspace.mode)
            : configuredWorkspaceLabel(currentSelection, selectedReusableExecutionWorkspace)}
          {workspace ? statusBadge(workspace.status) : statusBadge("idle")}
        </div>
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={handleCancel}
              >
                <X className="h-3 w-3 mr-1" />
                Cancel
              </Button>
              <Button size="sm" className="h-6 px-2 text-xs" onClick={handleSave} disabled={!canSaveWorkspaceConfig}>
                Save
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3 w-3 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {!editing && (
        <div className="space-y-1.5 text-xs">
          {workspace?.branchName && (
            <div className="flex items-center gap-1.5">
              <GitBranch className="h-3 w-3 text-muted-foreground shrink-0" />
              <CopyableInline value={workspace.branchName} mono />
            </div>
          )}
          {workspace?.cwd && (
            <div className="flex items-center gap-1.5">
              <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
              <CopyableInline value={workspace.cwd} mono />
            </div>
          )}
          {workspace?.repoUrl && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-[11px]">Repo:</span>
              <CopyableInline value={workspace.repoUrl} mono />
            </div>
          )}
          {!workspace && (
            <div className="text-muted-foreground">
              {currentSelection === "isolated_workspace"
                ? "A fresh isolated workspace will be created when this issue runs."
                : currentSelection === "reuse_existing"
                  ? "This issue will reuse an existing workspace when it runs."
                  : "This issue will use the project default workspace configuration when it runs."}
            </div>
          )}
          {currentSelection === "reuse_existing" && selectedReusableExecutionWorkspace && (
            <div className="text-muted-foreground" style={{ overflowWrap: "anywhere" }}>
              Reusing:{" "}
              <Link
                to={`/execution-workspaces/${selectedReusableExecutionWorkspace.id}`}
                className="hover:text-foreground hover:underline"
              >
                <BreakablePath text={selectedReusableExecutionWorkspace.name} />
              </Link>
            </div>
          )}
          {workspace && (
            <div className="pt-0.5">
              <Link
                to={`/execution-workspaces/${workspace.id}`}
                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
              >
                View workspace details →
              </Link>
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="space-y-2 pt-1">
          <select
            className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-xs outline-none"
            value={draftSelection}
            onChange={(e) => {
              const nextMode = e.target.value;
              setDraftSelection(nextMode);
              if (nextMode !== "reuse_existing") setDraftExecutionWorkspaceId("");
              else if (!draftExecutionWorkspaceId && issue.executionWorkspaceId)
                setDraftExecutionWorkspaceId(issue.executionWorkspaceId);
            }}
          >
            {EXECUTION_WORKSPACE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value === "reuse_existing" && configuredReusableWorkspace?.mode === "isolated_workspace"
                  ? "Existing isolated workspace"
                  : option.label}
              </option>
            ))}
          </select>

          {draftSelection === "reuse_existing" && (
            <select
              className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-xs outline-none"
              value={draftExecutionWorkspaceId}
              onChange={(e) => setDraftExecutionWorkspaceId(e.target.value)}
            >
              <option value="">Choose an existing workspace</option>
              {deduplicatedReusableWorkspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} · {w.status} · {w.branchName ?? w.cwd ?? w.id.slice(0, 8)}
                </option>
              ))}
            </select>
          )}

          {workspace && (
            <div className="text-[11px] text-muted-foreground space-y-0.5 pt-1 border-t border-border/50">
              <div style={{ overflowWrap: "anywhere" }}>
                Current:{" "}
                <Link to={`/execution-workspaces/${workspace.id}`} className="hover:text-foreground hover:underline">
                  <BreakablePath text={workspace.name} />
                </Link>
                {" · "}
                {workspace.status}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

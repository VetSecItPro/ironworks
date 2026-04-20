import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "../../lib/utils";
import { DraftInput } from "../agent-config-primitives";
import { SaveIndicator } from "./PropertyHelpers";
import type { ProjectConfigFieldKey, ProjectFieldSaveState } from "./types";

export interface ExecutionWorkspaceSectionProps {
  executionWorkspacesEnabled: boolean;
  executionWorkspaceDefaultMode: string;
  executionWorkspaceStrategy: {
    type: string;
    baseRef: string | null;
    branchTemplate: string | null;
    worktreeParentDir: string | null;
    provisionCommand?: string | null;
    teardownCommand?: string | null;
  };
  executionWorkspaceAdvancedOpen: boolean;
  executionWorkspacePolicy: Record<string, unknown> | null;
  canEdit: boolean;
  fieldState: (field: ProjectConfigFieldKey) => ProjectFieldSaveState;
  commitField: (field: ProjectConfigFieldKey, data: Record<string, unknown>) => void;
  updateExecutionWorkspacePolicy: (patch: Record<string, unknown>) => Record<string, unknown> | undefined;
  onToggleAdvanced: () => void;
}

export function ExecutionWorkspaceSection({
  executionWorkspacesEnabled,
  executionWorkspaceDefaultMode,
  executionWorkspaceStrategy,
  executionWorkspaceAdvancedOpen,
  canEdit,
  fieldState,
  commitField,
  updateExecutionWorkspacePolicy,
  onToggleAdvanced,
}: ExecutionWorkspaceSectionProps) {
  return (
    <div className="py-1.5 space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Execution Workspaces</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] text-muted-foreground hover:text-foreground"
              aria-label="Execution workspaces help"
            >
              ?
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            Project-owned defaults for isolated issue checkouts and execution workspace behavior.
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span>Enable isolated issue checkouts</span>
              <SaveIndicator state={fieldState("execution_workspace_enabled")} />
            </div>
            <div className="text-xs text-muted-foreground">
              Let issues choose between the project's primary checkout and an isolated execution workspace.
            </div>
          </div>
          {canEdit ? (
            <button
              data-slot="toggle"
              className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                executionWorkspacesEnabled ? "bg-green-600" : "bg-muted",
              )}
              type="button"
              onClick={() =>
                commitField(
                  "execution_workspace_enabled",
                  updateExecutionWorkspacePolicy({ enabled: !executionWorkspacesEnabled })!,
                )
              }
            >
              <span
                className={cn(
                  "inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform",
                  executionWorkspacesEnabled ? "translate-x-4.5" : "translate-x-0.5",
                )}
              />
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">{executionWorkspacesEnabled ? "Enabled" : "Disabled"}</span>
          )}
        </div>

        {executionWorkspacesEnabled ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-sm">
                  <span>New issues default to isolated checkout</span>
                  <SaveIndicator state={fieldState("execution_workspace_default_mode")} />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  If disabled, new issues stay on the project's primary checkout unless someone opts in.
                </div>
              </div>
              <button
                data-slot="toggle"
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                  executionWorkspaceDefaultMode === "isolated_workspace" ? "bg-green-600" : "bg-muted",
                )}
                type="button"
                onClick={() =>
                  commitField(
                    "execution_workspace_default_mode",
                    updateExecutionWorkspacePolicy({
                      defaultMode:
                        executionWorkspaceDefaultMode === "isolated_workspace"
                          ? "shared_workspace"
                          : "isolated_workspace",
                    })!,
                  )
                }
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform",
                    executionWorkspaceDefaultMode === "isolated_workspace" ? "translate-x-4.5" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>

            <div className="border-t border-border/60 pt-2">
              <button
                type="button"
                className="flex w-full items-center gap-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                onClick={onToggleAdvanced}
              >
                {executionWorkspaceAdvancedOpen ? "Hide advanced checkout settings" : "Show advanced checkout settings"}
              </button>
            </div>

            {executionWorkspaceAdvancedOpen ? (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  Host-managed implementation: <span className="text-foreground">Git worktree</span>
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Base ref</span>
                      <SaveIndicator state={fieldState("execution_workspace_base_ref")} />
                    </div>
                  </div>
                  <DraftInput
                    value={executionWorkspaceStrategy.baseRef ?? ""}
                    onCommit={(value) =>
                      commitField("execution_workspace_base_ref", {
                        ...updateExecutionWorkspacePolicy({
                          workspaceStrategy: {
                            ...executionWorkspaceStrategy,
                            type: "git_worktree",
                            baseRef: value || null,
                          },
                        })!,
                      })
                    }
                    immediate
                    className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs font-mono outline-none"
                    placeholder="origin/main"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Branch template</span>
                      <SaveIndicator state={fieldState("execution_workspace_branch_template")} />
                    </div>
                  </div>
                  <DraftInput
                    value={executionWorkspaceStrategy.branchTemplate ?? ""}
                    onCommit={(value) =>
                      commitField("execution_workspace_branch_template", {
                        ...updateExecutionWorkspacePolicy({
                          workspaceStrategy: {
                            ...executionWorkspaceStrategy,
                            type: "git_worktree",
                            branchTemplate: value || null,
                          },
                        })!,
                      })
                    }
                    immediate
                    className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs font-mono outline-none"
                    placeholder="{{issue.identifier}}-{{slug}}"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Worktree parent dir</span>
                      <SaveIndicator state={fieldState("execution_workspace_worktree_parent_dir")} />
                    </div>
                  </div>
                  <DraftInput
                    value={executionWorkspaceStrategy.worktreeParentDir ?? ""}
                    onCommit={(value) =>
                      commitField("execution_workspace_worktree_parent_dir", {
                        ...updateExecutionWorkspacePolicy({
                          workspaceStrategy: {
                            ...executionWorkspaceStrategy,
                            type: "git_worktree",
                            worktreeParentDir: value || null,
                          },
                        })!,
                      })
                    }
                    immediate
                    className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs font-mono outline-none"
                    placeholder=".ironworks/worktrees"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Provision command</span>
                      <SaveIndicator state={fieldState("execution_workspace_provision_command")} />
                    </div>
                  </div>
                  <DraftInput
                    value={executionWorkspaceStrategy.provisionCommand ?? ""}
                    onCommit={(value) =>
                      commitField("execution_workspace_provision_command", {
                        ...updateExecutionWorkspacePolicy({
                          workspaceStrategy: {
                            ...executionWorkspaceStrategy,
                            type: "git_worktree",
                            provisionCommand: value || null,
                          },
                        })!,
                      })
                    }
                    immediate
                    className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs font-mono outline-none"
                    placeholder="bash ./scripts/provision-worktree.sh"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Teardown command</span>
                      <SaveIndicator state={fieldState("execution_workspace_teardown_command")} />
                    </div>
                  </div>
                  <DraftInput
                    value={executionWorkspaceStrategy.teardownCommand ?? ""}
                    onCommit={(value) =>
                      commitField("execution_workspace_teardown_command", {
                        ...updateExecutionWorkspacePolicy({
                          workspaceStrategy: {
                            ...executionWorkspaceStrategy,
                            type: "git_worktree",
                            teardownCommand: value || null,
                          },
                        })!,
                      })
                    }
                    immediate
                    className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs font-mono outline-none"
                    placeholder="bash ./scripts/teardown-worktree.sh"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Provision runs inside the derived worktree before agent execution. Teardown is stored here for future
                  cleanup flows.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

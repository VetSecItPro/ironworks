import type { Project } from "@ironworksai/shared";
import { ExternalLink, Github, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "../../lib/utils";
import { ChoosePathButton } from "../PathInstructionsModal";

interface CodebaseSectionProps {
  project: Project;
  codebase: Project["codebase"];
  primaryCodebaseWorkspace: Project["primaryWorkspace"];
  hasAdditionalLegacyWorkspaces: boolean;
  workspaceMode: "local" | "repo" | null;
  workspaceCwd: string;
  workspaceRepoUrl: string;
  workspaceError: string | null;
  createPending: boolean;
  updatePending: boolean;
  removePending: boolean;
  createError: boolean;
  updateError: boolean;
  removeError: boolean;
  onSetWorkspaceMode: (mode: "local" | "repo" | null) => void;
  onSetWorkspaceCwd: (cwd: string) => void;
  onSetWorkspaceRepoUrl: (url: string) => void;
  onSetWorkspaceError: (error: string | null) => void;
  onSubmitLocal: () => void;
  onSubmitRepo: () => void;
  onClearLocal: () => void;
  onClearRepo: () => void;
}

function isSafeExternalUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function formatRepoUrl(value: string) {
  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return parsed.host;
    const owner = segments[0];
    const repo = segments[1]?.replace(/\.git$/i, "");
    if (!owner || !repo) return parsed.host;
    return `${parsed.host}/${owner}/${repo}`;
  } catch {
    return value;
  }
}

export function CodebaseSection({
  project: _project,
  codebase,
  primaryCodebaseWorkspace,
  hasAdditionalLegacyWorkspaces,
  workspaceMode,
  workspaceCwd,
  workspaceRepoUrl,
  workspaceError,
  createPending,
  updatePending,
  removePending: _removePending,
  createError,
  updateError,
  removeError,
  onSetWorkspaceMode,
  onSetWorkspaceCwd,
  onSetWorkspaceRepoUrl,
  onSetWorkspaceError,
  onSubmitLocal,
  onSubmitRepo,
  onClearLocal,
  onClearRepo,
}: CodebaseSectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Codebase</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] text-muted-foreground hover:text-foreground"
              aria-label="Codebase help"
            >
              ?
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            Repo identifies the source of truth. Local folder is the default place agents write code.
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="space-y-2 rounded-md border border-border/70 p-3">
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Repo</div>
          {codebase.repoUrl ? (
            <div className="flex items-center justify-between gap-2">
              {isSafeExternalUrl(codebase.repoUrl) ? (
                <a
                  href={codebase.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  <Github className="h-3 w-3 shrink-0" />
                  <span className="truncate">{formatRepoUrl(codebase.repoUrl)}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                <div className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Github className="h-3 w-3 shrink-0" />
                  <span className="truncate">{codebase.repoUrl}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="xs"
                  className="h-6 px-2"
                  onClick={() => {
                    onSetWorkspaceMode("repo");
                    onSetWorkspaceRepoUrl(codebase.repoUrl ?? "");
                    onSetWorkspaceError(null);
                  }}
                >
                  Change repo
                </Button>
                <Button variant="ghost" size="icon-xs" onClick={onClearRepo} aria-label="Clear repo">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">Not set.</div>
              <Button
                variant="outline"
                size="xs"
                className="h-6 px-2"
                onClick={() => {
                  onSetWorkspaceMode("repo");
                  onSetWorkspaceRepoUrl(codebase.repoUrl ?? "");
                  onSetWorkspaceError(null);
                }}
              >
                Set repo
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Local folder</div>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <div className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                {codebase.effectiveLocalFolder}
              </div>
              {codebase.origin === "managed_checkout" && (
                <div className="text-[11px] text-muted-foreground">Ironworks-managed folder.</div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="xs"
                className="h-6 px-2"
                onClick={() => {
                  onSetWorkspaceMode("local");
                  onSetWorkspaceCwd(codebase.localFolder ?? "");
                  onSetWorkspaceError(null);
                }}
              >
                {codebase.localFolder ? "Change local folder" : "Set local folder"}
              </Button>
              {codebase.localFolder ? (
                <Button variant="ghost" size="icon-xs" onClick={onClearLocal} aria-label="Clear local folder">
                  <Trash2 className="h-3 w-3" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {hasAdditionalLegacyWorkspaces && (
          <div className="text-[11px] text-muted-foreground">
            Additional legacy workspace records exist on this project. Ironworks is using the primary workspace as the
            codebase view.
          </div>
        )}

        {primaryCodebaseWorkspace?.runtimeServices && primaryCodebaseWorkspace.runtimeServices.length > 0 ? (
          <div className="space-y-1">
            {primaryCodebaseWorkspace.runtimeServices.map((service) => (
              <div
                key={service.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium">{service.serviceName}</span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                        service.status === "running"
                          ? "bg-green-500/15 text-green-700 dark:text-green-300"
                          : service.status === "failed"
                            ? "bg-red-500/15 text-red-700 dark:text-red-300"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {service.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {service.url ? (
                      <a
                        href={service.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-foreground hover:underline"
                      >
                        {service.url}
                      </a>
                    ) : (
                      (service.command ?? "No URL")
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground whitespace-nowrap">{service.lifecycle}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {workspaceMode === "local" && (
        <div className="space-y-1.5 rounded-md border border-border p-2">
          <div className="flex items-center gap-2">
            <input
              className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs font-mono outline-none"
              value={workspaceCwd}
              onChange={(e) => onSetWorkspaceCwd(e.target.value)}
              placeholder="/absolute/path/to/workspace"
            />
            <ChoosePathButton />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              className="h-6 px-2"
              disabled={(!workspaceCwd.trim() && !primaryCodebaseWorkspace) || createPending || updatePending}
              onClick={onSubmitLocal}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="h-6 px-2"
              onClick={() => {
                onSetWorkspaceMode(null);
                onSetWorkspaceCwd("");
                onSetWorkspaceError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {workspaceMode === "repo" && (
        <div className="space-y-1.5 rounded-md border border-border p-2">
          <input
            className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
            value={workspaceRepoUrl}
            onChange={(e) => onSetWorkspaceRepoUrl(e.target.value)}
            placeholder="https://github.com/org/repo"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              className="h-6 px-2"
              disabled={(!workspaceRepoUrl.trim() && !primaryCodebaseWorkspace) || createPending || updatePending}
              onClick={onSubmitRepo}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="h-6 px-2"
              onClick={() => {
                onSetWorkspaceMode(null);
                onSetWorkspaceRepoUrl("");
                onSetWorkspaceError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {workspaceError && <p className="text-xs text-destructive">{workspaceError}</p>}
      {createError && <p className="text-xs text-destructive">Failed to save workspace.</p>}
      {removeError && <p className="text-xs text-destructive">Failed to delete workspace.</p>}
      {updateError && <p className="text-xs text-destructive">Failed to update workspace.</p>}
    </div>
  );
}

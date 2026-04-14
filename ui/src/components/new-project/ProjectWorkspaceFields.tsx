import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChoosePathButton } from "../PathInstructionsModal";

interface ProjectWorkspaceFieldsProps {
  workspaceRepoUrl: string;
  setWorkspaceRepoUrl: (v: string) => void;
  workspaceLocalPath: string;
  setWorkspaceLocalPath: (v: string) => void;
  workspaceError: string | null;
  setWorkspaceError: (v: string | null) => void;
}

export function ProjectWorkspaceFields({
  workspaceRepoUrl,
  setWorkspaceRepoUrl,
  workspaceLocalPath,
  setWorkspaceLocalPath,
  workspaceError,
  setWorkspaceError,
}: ProjectWorkspaceFieldsProps) {
  return (
    <div className="px-4 pt-3 pb-3 space-y-3 border-t border-border">
      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <label className="block text-xs text-muted-foreground">Repo URL</label>
          <span className="text-xs text-muted-foreground/70">optional</span>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3 w-3 text-muted-foreground/70 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px] text-xs">
              Link a GitHub repository so agents can clone, read, and push code for this project.
            </TooltipContent>
          </Tooltip>
        </div>
        <input
          className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
          value={workspaceRepoUrl}
          onChange={(e) => { setWorkspaceRepoUrl(e.target.value); setWorkspaceError(null); }}
          placeholder="https://github.com/org/repo"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <label className="block text-xs text-muted-foreground">Local folder</label>
          <span className="text-xs text-muted-foreground/70">optional</span>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3 w-3 text-muted-foreground/70 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px] text-xs">
              Set an absolute path on this machine where local agents will read and write files for this project.
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs font-mono outline-none"
            value={workspaceLocalPath}
            onChange={(e) => { setWorkspaceLocalPath(e.target.value); setWorkspaceError(null); }}
            placeholder="/absolute/path/to/workspace"
          />
          <ChoosePathButton />
        </div>
      </div>

      {workspaceError && (
        <p className="text-xs text-destructive">{workspaceError}</p>
      )}
    </div>
  );
}

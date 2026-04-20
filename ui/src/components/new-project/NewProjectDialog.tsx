import { PROJECT_COLORS } from "@ironworksai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { agentsApi } from "../../api/agents";
import { assetsApi } from "../../api/assets";
import { goalsApi } from "../../api/goals";
import { projectsApi } from "../../api/projects";
import { useCompany } from "../../context/CompanyContext";
import { useDialog } from "../../context/DialogContext";
import { queryKeys } from "../../lib/queryKeys";
import { cn } from "../../lib/utils";
import { MarkdownEditor, type MarkdownEditorRef, type MentionOption } from "../MarkdownEditor";
import { ProjectDialogHeader } from "./ProjectDialogHeader";
import { ProjectPropertyChips } from "./ProjectPropertyChips";
import { ProjectWorkspaceFields } from "./ProjectWorkspaceFields";

export function NewProjectDialog() {
  const { newProjectOpen, closeNewProject } = useDialog();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("planned");
  const [goalIds, setGoalIds] = useState<string[]>([]);
  const [targetDate, setTargetDate] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [workspaceLocalPath, setWorkspaceLocalPath] = useState("");
  const [workspaceRepoUrl, setWorkspaceRepoUrl] = useState("");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const descriptionEditorRef = useRef<MarkdownEditorRef>(null);

  const { data: goals } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && newProjectOpen,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && newProjectOpen,
  });

  const mentionOptions = useMemo<MentionOption[]>(() => {
    const activeAgents = [...(agents ?? [])]
      .filter((agent) => agent.status !== "terminated")
      .sort((a, b) => a.name.localeCompare(b.name));
    return activeAgents.map((agent) => ({
      id: `agent:${agent.id}`,
      name: agent.name,
      kind: "agent" as const,
      agentId: agent.id,
      agentIcon: agent.icon,
    }));
  }, [agents]);

  const createProject = useMutation({
    mutationFn: (data: Record<string, unknown>) => projectsApi.create(selectedCompanyId!, data),
  });

  const uploadDescriptionImage = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      return assetsApi.uploadImage(selectedCompanyId, file, "projects/drafts");
    },
  });

  function reset() {
    setName("");
    setDescription("");
    setStatus("planned");
    setGoalIds([]);
    setTargetDate("");
    setExpanded(false);
    setWorkspaceLocalPath("");
    setWorkspaceRepoUrl("");
    setWorkspaceError(null);
  }

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
  const deriveWorkspaceNameFromPath = (value: string) => {
    const segments = value
      .trim()
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .filter(Boolean);
    return segments[segments.length - 1] ?? "Local folder";
  };
  const deriveWorkspaceNameFromRepo = (value: string) => {
    try {
      const segments = new URL(value).pathname.split("/").filter(Boolean);
      return segments[segments.length - 1]?.replace(/\.git$/i, "") || "GitHub repo";
    } catch {
      return "GitHub repo";
    }
  };

  async function handleSubmit() {
    if (!selectedCompanyId || !name.trim()) return;
    const localPath = workspaceLocalPath.trim();
    const repoUrl = workspaceRepoUrl.trim();
    if (localPath && !isAbsolutePath(localPath)) {
      setWorkspaceError("Local folder must be a full absolute path.");
      return;
    }
    if (repoUrl && !isGitHubRepoUrl(repoUrl)) {
      setWorkspaceError("Repo must use a valid GitHub repo URL.");
      return;
    }
    setWorkspaceError(null);
    try {
      const created = await createProject.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        status,
        color: PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
        ...(goalIds.length > 0 ? { goalIds } : {}),
        ...(targetDate ? { targetDate } : {}),
      });
      if (localPath || repoUrl) {
        await projectsApi.createWorkspace(created.id, {
          name: localPath ? deriveWorkspaceNameFromPath(localPath) : deriveWorkspaceNameFromRepo(repoUrl),
          ...(localPath ? { cwd: localPath } : {}),
          ...(repoUrl ? { repoUrl } : {}),
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(created.id) });
      reset();
      closeNewProject();
    } catch {
      /* surface through createProject.isError */
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <Dialog
      open={newProjectOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          closeNewProject();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn("p-0 gap-0", expanded ? "sm:max-w-2xl" : "sm:max-w-lg")}
        onKeyDown={handleKeyDown}
      >
        <ProjectDialogHeader
          companyName={selectedCompany?.name}
          expanded={expanded}
          setExpanded={setExpanded}
          onClose={() => {
            reset();
            closeNewProject();
          }}
        />

        <div className="px-4 pt-4 pb-2 shrink-0">
          <input
            className="w-full text-lg font-semibold bg-transparent outline-none placeholder:text-muted-foreground/70"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab" && !e.shiftKey) {
                e.preventDefault();
                descriptionEditorRef.current?.focus();
              }
            }}
            autoFocus
          />
        </div>

        <div className="px-4 pb-2">
          <MarkdownEditor
            ref={descriptionEditorRef}
            value={description}
            onChange={setDescription}
            placeholder="Add description..."
            bordered={false}
            mentions={mentionOptions}
            contentClassName={cn("text-sm text-muted-foreground", expanded ? "min-h-[220px]" : "min-h-[120px]")}
            imageUploadHandler={async (file) => {
              const asset = await uploadDescriptionImage.mutateAsync(file);
              return asset.contentPath;
            }}
          />
        </div>

        <ProjectWorkspaceFields
          workspaceRepoUrl={workspaceRepoUrl}
          setWorkspaceRepoUrl={setWorkspaceRepoUrl}
          workspaceLocalPath={workspaceLocalPath}
          setWorkspaceLocalPath={setWorkspaceLocalPath}
          workspaceError={workspaceError}
          setWorkspaceError={setWorkspaceError}
        />

        <ProjectPropertyChips
          status={status}
          setStatus={setStatus}
          goalIds={goalIds}
          setGoalIds={setGoalIds}
          goals={goals ?? []}
          targetDate={targetDate}
          setTargetDate={setTargetDate}
        />

        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
          {createProject.isError ? <p className="text-xs text-destructive">Failed to create project.</p> : <span />}
          <Button size="sm" disabled={!name.trim() || createProject.isPending} onClick={handleSubmit}>
            {createProject.isPending ? "Creating\u2026" : "Create project"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useRef, useCallback, useMemo, type ChangeEvent, type DragEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trackFeatureUsed } from "../../lib/analytics";
import { useDialog } from "../../context/DialogContext";
import { useCompany } from "../../context/CompanyContext";
import { executionWorkspacesApi } from "../../api/execution-workspaces";
import { issuesApi } from "../../api/issues";
import { instanceSettingsApi } from "../../api/instanceSettings";
import { projectsApi } from "../../api/projects";
import { goalsApi } from "../../api/goals";
import { agentsApi } from "../../api/agents";
import { authApi } from "../../api/auth";
import { assetsApi } from "../../api/assets";
import { queryKeys } from "../../lib/queryKeys";
import { useProjectOrder } from "../../hooks/useProjectOrder";
import { getRecentAssigneeIds, sortAgentsByRecency } from "../../lib/recent-assignees";
import { useToast } from "../../context/ToastContext";
import {
  assigneeValueFromSelection,
  currentUserAssigneeOption,
  parseAssigneeValue,
} from "../../lib/assignees";
import { extractProviderIdWithFallback } from "../../lib/model-utils";
import type { MentionOption } from "../MarkdownEditor";
import type { InlineEntityOption } from "../InlineEntitySelector";
import type { MarkdownEditorRef } from "../MarkdownEditor";
import {
  type StagedIssueFile,
  ISSUE_OVERRIDE_ADAPTER_TYPES,
  ISSUE_THINKING_EFFORT_OPTIONS,
  suggestPriority,
  findSimilarIssues,
  loadDraft,
  saveDraft,
  clearDraft,
  isTextDocumentFile,
  fileBaseName,
  slugifyDocumentKey,
  titleizeFilename,
  createUniqueDocumentKey,
  defaultProjectWorkspaceIdForProject,
  defaultExecutionWorkspaceModeForProject,
  issueExecutionWorkspaceModeForExistingWorkspace,
  buildAssigneeAdapterOverrides,
  DEBOUNCE_MS,
} from "./constants";

export function useNewIssueForm() {
  const { newIssueOpen, newIssueDefaults, closeNewIssue } = useDialog();
  const { companies, selectedCompanyId, selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("");
  const [assigneeValue, setAssigneeValue] = useState("");
  const [projectId, setProjectId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [projectWorkspaceId, setProjectWorkspaceId] = useState("");
  const [assigneeOptionsOpen, setAssigneeOptionsOpen] = useState(false);
  const [assigneeModelOverride, setAssigneeModelOverride] = useState("");
  const [assigneeThinkingEffort, setAssigneeThinkingEffort] = useState("");
  const [assigneeChrome, setAssigneeChrome] = useState(false);
  const [executionWorkspaceMode, setExecutionWorkspaceMode] = useState<string>("shared_workspace");
  const [selectedExecutionWorkspaceId, setSelectedExecutionWorkspaceId] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [dialogCompanyId, setDialogCompanyId] = useState<string | null>(null);
  const [stagedFiles, setStagedFiles] = useState<StagedIssueFile[]>([]);
  const [isFileDragOver, setIsFileDragOver] = useState(false);

  // Popover states
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);

  // Refs
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const executionWorkspaceDefaultProjectId = useRef<string | null>(null);
  const descriptionEditorRef = useRef<MarkdownEditorRef>(null);
  const stageFileInputRef = useRef<HTMLInputElement | null>(null);
  const assigneeSelectorRef = useRef<HTMLButtonElement | null>(null);
  const projectSelectorRef = useRef<HTMLButtonElement | null>(null);

  const effectiveCompanyId = dialogCompanyId ?? selectedCompanyId;
  const dialogCompany = companies.find((c) => c.id === effectiveCompanyId) ?? selectedCompany;

  // Data queries
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(effectiveCompanyId!),
    queryFn: () => agentsApi.list(effectiveCompanyId!),
    enabled: !!effectiveCompanyId && newIssueOpen,
  });
  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(effectiveCompanyId!),
    queryFn: () => projectsApi.list(effectiveCompanyId!),
    enabled: !!effectiveCompanyId && newIssueOpen,
  });
  const { data: goals } = useQuery({
    queryKey: queryKeys.goals.list(effectiveCompanyId!),
    queryFn: () => goalsApi.list(effectiveCompanyId!),
    enabled: !!effectiveCompanyId && newIssueOpen,
  });
  const { data: existingIssues } = useQuery({
    queryKey: queryKeys.issues.list(effectiveCompanyId!),
    queryFn: () => issuesApi.list(effectiveCompanyId!),
    enabled: !!effectiveCompanyId && newIssueOpen,
  });
  const { data: reusableExecutionWorkspaces } = useQuery({
    queryKey: queryKeys.executionWorkspaces.list(effectiveCompanyId!, {
      projectId,
      projectWorkspaceId: projectWorkspaceId || undefined,
      reuseEligible: true,
    }),
    queryFn: () =>
      executionWorkspacesApi.list(effectiveCompanyId!, {
        projectId,
        projectWorkspaceId: projectWorkspaceId || undefined,
        reuseEligible: true,
      }),
    enabled: Boolean(effectiveCompanyId) && newIssueOpen && Boolean(projectId),
  });
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
    enabled: newIssueOpen,
  });

  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
  const activeProjects = useMemo(
    () => (projects ?? []).filter((p) => !p.archivedAt),
    [projects],
  );
  const { orderedProjects } = useProjectOrder({
    projects: activeProjects,
    companyId: effectiveCompanyId,
    userId: currentUserId,
  });

  const selectedAssignee = useMemo(() => parseAssigneeValue(assigneeValue), [assigneeValue]);
  const selectedAssigneeAgentId = selectedAssignee.assigneeAgentId;
  const selectedAssigneeUserId = selectedAssignee.assigneeUserId;
  const assigneeAdapterType = (agents ?? []).find((agent) => agent.id === selectedAssigneeAgentId)?.adapterType ?? null;
  const supportsAssigneeOverrides = Boolean(
    assigneeAdapterType && ISSUE_OVERRIDE_ADAPTER_TYPES.has(assigneeAdapterType),
  );

  const mentionOptions = useMemo<MentionOption[]>(() => {
    const options: MentionOption[] = [];
    const activeAgents = [...(agents ?? [])]
      .filter((agent) => agent.status !== "terminated")
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const agent of activeAgents) {
      options.push({
        id: `agent:${agent.id}`, name: agent.name, kind: "agent",
        agentId: agent.id, agentIcon: agent.icon,
      });
    }
    for (const project of orderedProjects) {
      options.push({
        id: `project:${project.id}`, name: project.name, kind: "project",
        projectId: project.id, projectColor: project.color,
      });
    }
    return options;
  }, [agents, orderedProjects]);

  const { data: assigneeAdapterModels } = useQuery({
    queryKey:
      effectiveCompanyId && assigneeAdapterType
        ? queryKeys.agents.adapterModels(effectiveCompanyId, assigneeAdapterType)
        : ["agents", "none", "adapter-models", assigneeAdapterType ?? "none"],
    queryFn: () => agentsApi.adapterModels(effectiveCompanyId!, assigneeAdapterType!),
    enabled: Boolean(effectiveCompanyId) && newIssueOpen && supportsAssigneeOverrides,
  });

  // Mutation
  const createIssue = useMutation({
    mutationFn: async ({
      companyId,
      stagedFiles: pendingStagedFiles,
      ...data
    }: { companyId: string; stagedFiles: StagedIssueFile[] } & Record<string, unknown>) => {
      const issue = await issuesApi.create(companyId, data);
      trackFeatureUsed("create_issue");
      const failures: string[] = [];
      for (const stagedFile of pendingStagedFiles) {
        try {
          if (stagedFile.kind === "document") {
            const body = await stagedFile.file.text();
            await issuesApi.upsertDocument(issue.id, stagedFile.documentKey ?? "document", {
              title: stagedFile.documentKey === "plan" ? null : stagedFile.title ?? null,
              format: "markdown", body, baseRevisionId: null,
            });
          } else {
            await issuesApi.uploadAttachment(companyId, issue.id, stagedFile.file);
          }
        } catch {
          failures.push(stagedFile.file.name);
        }
      }
      return { issue, companyId, failures };
    },
    onSuccess: ({ issue, companyId, failures }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listMineByMe(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listTouchedByMe(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listUnreadTouchedByMe(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(companyId) });
      if (draftTimer.current) clearTimeout(draftTimer.current);
      if (failures.length > 0) {
        const prefix = (companies.find((company) => company.id === companyId)?.issuePrefix ?? "").trim();
        const issueRef = issue.identifier ?? issue.id;
        pushToast({
          title: `Created ${issueRef} with upload warnings`,
          body: `${failures.length} staged ${failures.length === 1 ? "file" : "files"} could not be added.`,
          tone: "warn",
          action: prefix
            ? { label: `Open ${issueRef}`, href: `/${prefix}/issues/${issueRef}` }
            : undefined,
        });
      }
      clearDraft();
      reset();
      closeNewIssue();
    },
  });

  const uploadDescriptionImage = useMutation({
    mutationFn: async (file: File) => {
      if (!effectiveCompanyId) throw new Error("No company selected");
      return assetsApi.uploadImage(effectiveCompanyId, file, "issues/drafts");
    },
  });

  // Debounced draft saving
  const scheduleSave = useCallback(
    (draft: Parameters<typeof saveDraft>[0]) => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        if (draft.title.trim()) saveDraft(draft);
      }, DEBOUNCE_MS);
    },
    [],
  );

  useEffect(() => {
    if (!newIssueOpen) return;
    scheduleSave({
      title, description, status, priority, assigneeValue, projectId, goalId,
      projectWorkspaceId, assigneeModelOverride, assigneeThinkingEffort, assigneeChrome,
      executionWorkspaceMode, selectedExecutionWorkspaceId,
    });
  }, [
    title, description, status, priority, assigneeValue, projectId, goalId,
    projectWorkspaceId, assigneeModelOverride, assigneeThinkingEffort,
    assigneeChrome, executionWorkspaceMode, selectedExecutionWorkspaceId,
    newIssueOpen, scheduleSave,
  ]);

  // Restore draft or apply defaults when dialog opens
  useEffect(() => {
    if (!newIssueOpen) return;
    setDialogCompanyId(selectedCompanyId);
    executionWorkspaceDefaultProjectId.current = null;

    const draft = loadDraft();
    if (newIssueDefaults.title) {
      setTitle(newIssueDefaults.title);
      setDescription(newIssueDefaults.description ?? "");
      setStatus(newIssueDefaults.status ?? "todo");
      setPriority(newIssueDefaults.priority ?? "");
      const defaultProjectId = newIssueDefaults.projectId ?? "";
      const defaultProject = orderedProjects.find((project) => project.id === defaultProjectId);
      setProjectId(defaultProjectId);
      setGoalId(newIssueDefaults.goalId ?? "");
      setProjectWorkspaceId(defaultProjectWorkspaceIdForProject(defaultProject));
      setAssigneeValue(assigneeValueFromSelection(newIssueDefaults));
      setAssigneeModelOverride(""); setAssigneeThinkingEffort(""); setAssigneeChrome(false);
      setExecutionWorkspaceMode(defaultExecutionWorkspaceModeForProject(defaultProject));
      setSelectedExecutionWorkspaceId("");
      executionWorkspaceDefaultProjectId.current = defaultProjectId || null;
    } else if (draft && draft.title.trim()) {
      const restoredProjectId = newIssueDefaults.projectId ?? draft.projectId;
      const restoredProject = orderedProjects.find((project) => project.id === restoredProjectId);
      setTitle(draft.title); setDescription(draft.description);
      setStatus(draft.status || "todo"); setPriority(draft.priority);
      setAssigneeValue(
        newIssueDefaults.assigneeAgentId || newIssueDefaults.assigneeUserId
          ? assigneeValueFromSelection(newIssueDefaults)
          : (draft.assigneeValue ?? draft.assigneeId ?? ""),
      );
      setProjectId(restoredProjectId);
      setGoalId(newIssueDefaults.goalId ?? draft.goalId ?? "");
      setProjectWorkspaceId(draft.projectWorkspaceId ?? defaultProjectWorkspaceIdForProject(restoredProject));
      setAssigneeModelOverride(draft.assigneeModelOverride ?? "");
      setAssigneeThinkingEffort(draft.assigneeThinkingEffort ?? "");
      setAssigneeChrome(draft.assigneeChrome ?? false);
      setExecutionWorkspaceMode(
        draft.executionWorkspaceMode
          ?? (draft.useIsolatedExecutionWorkspace ? "isolated_workspace" : defaultExecutionWorkspaceModeForProject(restoredProject)),
      );
      setSelectedExecutionWorkspaceId(draft.selectedExecutionWorkspaceId ?? "");
      executionWorkspaceDefaultProjectId.current = restoredProjectId || null;
    } else {
      const defaultProjectId = newIssueDefaults.projectId ?? "";
      const defaultProject = orderedProjects.find((project) => project.id === defaultProjectId);
      setStatus(newIssueDefaults.status ?? "todo"); setPriority(newIssueDefaults.priority ?? "");
      setProjectId(defaultProjectId); setGoalId(newIssueDefaults.goalId ?? "");
      setProjectWorkspaceId(defaultProjectWorkspaceIdForProject(defaultProject));
      setAssigneeValue(assigneeValueFromSelection(newIssueDefaults));
      setAssigneeModelOverride(""); setAssigneeThinkingEffort(""); setAssigneeChrome(false);
      setExecutionWorkspaceMode(defaultExecutionWorkspaceModeForProject(defaultProject));
      setSelectedExecutionWorkspaceId("");
      executionWorkspaceDefaultProjectId.current = defaultProjectId || null;
    }
  }, [newIssueOpen, newIssueDefaults, orderedProjects]);

  useEffect(() => {
    if (!supportsAssigneeOverrides) {
      setAssigneeOptionsOpen(false); setAssigneeModelOverride("");
      setAssigneeThinkingEffort(""); setAssigneeChrome(false);
      return;
    }
    const validThinkingValues =
      assigneeAdapterType === "codex_local"
        ? ISSUE_THINKING_EFFORT_OPTIONS.codex_local
        : assigneeAdapterType === "opencode_local"
          ? ISSUE_THINKING_EFFORT_OPTIONS.opencode_local
          : ISSUE_THINKING_EFFORT_OPTIONS.claude_local;
    if (!validThinkingValues.some((option) => option.value === assigneeThinkingEffort)) {
      setAssigneeThinkingEffort("");
    }
  }, [supportsAssigneeOverrides, assigneeAdapterType, assigneeThinkingEffort]);

  useEffect(() => {
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, []);

  function reset() {
    setTitle(""); setDescription(""); setStatus("todo"); setPriority("");
    setAssigneeValue(""); setProjectId(""); setGoalId(""); setProjectWorkspaceId("");
    setAssigneeOptionsOpen(false); setAssigneeModelOverride(""); setAssigneeThinkingEffort("");
    setAssigneeChrome(false); setExecutionWorkspaceMode("shared_workspace");
    setSelectedExecutionWorkspaceId(""); setExpanded(false); setDialogCompanyId(null);
    setStagedFiles([]); setIsFileDragOver(false); setCompanyOpen(false);
    executionWorkspaceDefaultProjectId.current = null;
  }

  function handleCompanyChange(companyId: string) {
    if (companyId === effectiveCompanyId) return;
    setDialogCompanyId(companyId); setAssigneeValue(""); setProjectId("");
    setGoalId(""); setProjectWorkspaceId(""); setAssigneeModelOverride("");
    setAssigneeThinkingEffort(""); setAssigneeChrome(false);
    setExecutionWorkspaceMode("shared_workspace"); setSelectedExecutionWorkspaceId("");
  }

  function discardDraft() { clearDraft(); reset(); closeNewIssue(); }

  // Derived values
  const currentAssignee = selectedAssigneeAgentId
    ? (agents ?? []).find((a) => a.id === selectedAssigneeAgentId)
    : null;
  const currentProject = orderedProjects.find((project) => project.id === projectId);
  const currentProjectExecutionWorkspacePolicy =
    experimentalSettings?.enableIsolatedWorkspaces === true
      ? currentProject?.executionWorkspacePolicy ?? null
      : null;
  const currentProjectSupportsExecutionWorkspace = Boolean(currentProjectExecutionWorkspacePolicy?.enabled);

  const deduplicatedReusableWorkspaces = useMemo(() => {
    const workspaces = reusableExecutionWorkspaces ?? [];
    const seen = new Map<string, typeof workspaces[number]>();
    for (const ws of workspaces) {
      const key = ws.cwd ?? ws.id;
      const existing = seen.get(key);
      if (!existing || new Date(ws.lastUsedAt) > new Date(existing.lastUsedAt)) {
        seen.set(key, ws);
      }
    }
    return Array.from(seen.values());
  }, [reusableExecutionWorkspaces]);

  const selectedReusableExecutionWorkspace = deduplicatedReusableWorkspaces.find(
    (workspace) => workspace.id === selectedExecutionWorkspaceId,
  );

  const assigneeOptionsTitle =
    assigneeAdapterType === "claude_local" ? "Claude options"
    : assigneeAdapterType === "codex_local" ? "Codex options"
    : assigneeAdapterType === "opencode_local" ? "OpenCode options"
    : "Agent options";

  const recentAssigneeIds = useMemo(() => getRecentAssigneeIds(), [newIssueOpen]);
  const assigneeOptions = useMemo<InlineEntityOption[]>(
    () => [
      ...currentUserAssigneeOption(currentUserId),
      ...sortAgentsByRecency(
        (agents ?? []).filter((agent) => agent.status !== "terminated"),
        recentAssigneeIds,
      ).map((agent) => ({
        id: assigneeValueFromSelection({ assigneeAgentId: agent.id }),
        label: agent.name,
        searchText: `${agent.name} ${agent.role} ${agent.title ?? ""}`,
      })),
    ],
    [agents, currentUserId, recentAssigneeIds],
  );
  const projectOptions = useMemo<InlineEntityOption[]>(
    () => orderedProjects.map((project) => ({
      id: project.id, label: project.name, searchText: project.description ?? "",
    })),
    [orderedProjects],
  );
  const activeGoals = useMemo(
    () => (goals ?? []).filter((g) => g.status !== "achieved" && g.status !== "cancelled"),
    [goals],
  );
  const goalOptions = useMemo<InlineEntityOption[]>(
    () => activeGoals.map((g) => ({
      id: g.id, label: g.title, searchText: `${g.level} ${g.description ?? ""}`,
    })),
    [activeGoals],
  );

  const suggestedPriority = useMemo(() => suggestPriority(title), [title]);
  const similarIssues = useMemo(() => findSimilarIssues(title, existingIssues), [title, existingIssues]);

  const savedDraft = loadDraft();
  const hasDraft = title.trim().length > 0 || description.trim().length > 0 || stagedFiles.length > 0;
  const hasSavedDraft = Boolean(savedDraft?.title.trim() || savedDraft?.description.trim());
  const canDiscardDraft = hasDraft || hasSavedDraft;
  const createIssueErrorMessage =
    createIssue.error instanceof Error ? createIssue.error.message : "Failed to create issue. Try again.";

  const handleProjectChange = useCallback((nextProjectId: string) => {
    setProjectId(nextProjectId);
    const nextProject = orderedProjects.find((project) => project.id === nextProjectId);
    executionWorkspaceDefaultProjectId.current = nextProjectId || null;
    setProjectWorkspaceId(defaultProjectWorkspaceIdForProject(nextProject));
    setExecutionWorkspaceMode(defaultExecutionWorkspaceModeForProject(nextProject));
    setSelectedExecutionWorkspaceId("");
  }, [orderedProjects]);

  useEffect(() => {
    if (!newIssueOpen || !projectId || executionWorkspaceDefaultProjectId.current === projectId) return;
    const project = orderedProjects.find((entry) => entry.id === projectId);
    if (!project) return;
    executionWorkspaceDefaultProjectId.current = projectId;
    setProjectWorkspaceId(defaultProjectWorkspaceIdForProject(project));
    setExecutionWorkspaceMode(defaultExecutionWorkspaceModeForProject(project));
    setSelectedExecutionWorkspaceId("");
  }, [newIssueOpen, orderedProjects, projectId]);

  const modelOverrideOptions = useMemo<InlineEntityOption[]>(
    () => [...(assigneeAdapterModels ?? [])]
      .sort((a, b) => {
        const providerA = extractProviderIdWithFallback(a.id);
        const providerB = extractProviderIdWithFallback(b.id);
        const byProvider = providerA.localeCompare(providerB);
        if (byProvider !== 0) return byProvider;
        return a.id.localeCompare(b.id);
      })
      .map((model) => ({
        id: model.id, label: model.label,
        searchText: `${model.id} ${extractProviderIdWithFallback(model.id)}`,
      })),
    [assigneeAdapterModels],
  );

  // File staging handlers
  function stageFiles(files: File[]) {
    if (files.length === 0) return;
    setStagedFiles((current) => {
      const next = [...current];
      for (const file of files) {
        if (isTextDocumentFile(file)) {
          const baseName = fileBaseName(file.name);
          const documentKey = createUniqueDocumentKey(slugifyDocumentKey(baseName), next);
          next.push({ id: `${file.name}:${file.size}:${file.lastModified}:${documentKey}`, file, kind: "document", documentKey, title: titleizeFilename(baseName) });
          continue;
        }
        next.push({ id: `${file.name}:${file.size}:${file.lastModified}`, file, kind: "attachment" });
      }
      return next;
    });
  }

  function handleStageFilesPicked(evt: ChangeEvent<HTMLInputElement>) {
    stageFiles(Array.from(evt.target.files ?? []));
    if (stageFileInputRef.current) stageFileInputRef.current.value = "";
  }

  function handleFileDragEnter(evt: DragEvent<HTMLDivElement>) {
    if (!evt.dataTransfer.types.includes("Files")) return;
    evt.preventDefault(); setIsFileDragOver(true);
  }
  function handleFileDragOver(evt: DragEvent<HTMLDivElement>) {
    if (!evt.dataTransfer.types.includes("Files")) return;
    evt.preventDefault(); evt.dataTransfer.dropEffect = "copy"; setIsFileDragOver(true);
  }
  function handleFileDragLeave(evt: DragEvent<HTMLDivElement>) {
    if (evt.currentTarget.contains(evt.relatedTarget as Node | null)) return;
    setIsFileDragOver(false);
  }
  function handleFileDrop(evt: DragEvent<HTMLDivElement>) {
    if (!evt.dataTransfer.files.length) return;
    evt.preventDefault(); setIsFileDragOver(false);
    stageFiles(Array.from(evt.dataTransfer.files));
  }

  function removeStagedFile(id: string) {
    setStagedFiles((current) => current.filter((file) => file.id !== id));
  }

  function handleSubmit() {
    if (!effectiveCompanyId || !title.trim() || createIssue.isPending) return;
    const assigneeAdapterOverrides = buildAssigneeAdapterOverrides({
      adapterType: assigneeAdapterType, modelOverride: assigneeModelOverride,
      thinkingEffortOverride: assigneeThinkingEffort, chrome: assigneeChrome,
    });
    const selectedProject = orderedProjects.find((project) => project.id === projectId);
    const executionWorkspacePolicy =
      experimentalSettings?.enableIsolatedWorkspaces === true
        ? selectedProject?.executionWorkspacePolicy ?? null
        : null;
    const selReusableWs = deduplicatedReusableWorkspaces.find(
      (workspace) => workspace.id === selectedExecutionWorkspaceId,
    );
    const requestedExecutionWorkspaceMode =
      executionWorkspaceMode === "reuse_existing"
        ? issueExecutionWorkspaceModeForExistingWorkspace(selReusableWs?.mode)
        : executionWorkspaceMode;
    const executionWorkspaceSettings = executionWorkspacePolicy?.enabled
      ? { mode: requestedExecutionWorkspaceMode }
      : null;
    createIssue.mutate({
      companyId: effectiveCompanyId, stagedFiles,
      title: title.trim(), description: description.trim() || undefined, status,
      priority: priority || "medium",
      ...(selectedAssigneeAgentId ? { assigneeAgentId: selectedAssigneeAgentId } : {}),
      ...(selectedAssigneeUserId ? { assigneeUserId: selectedAssigneeUserId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(goalId ? { goalId } : {}),
      ...(projectWorkspaceId ? { projectWorkspaceId } : {}),
      ...(assigneeAdapterOverrides ? { assigneeAdapterOverrides } : {}),
      ...(executionWorkspacePolicy?.enabled ? { executionWorkspacePreference: executionWorkspaceMode } : {}),
      ...(executionWorkspaceMode === "reuse_existing" && selectedExecutionWorkspaceId
        ? { executionWorkspaceId: selectedExecutionWorkspaceId } : {}),
      ...(executionWorkspaceSettings ? { executionWorkspaceSettings } : {}),
    });
  }

  return {
    // Dialog state
    newIssueOpen,
    closeNewIssue,
    companies,
    effectiveCompanyId,
    dialogCompany,
    expanded, setExpanded,
    companyOpen, setCompanyOpen,
    handleCompanyChange,

    // Form fields
    title, setTitle,
    description, setDescription,
    status, setStatus,
    priority, setPriority,
    assigneeValue, setAssigneeValue,
    projectId,
    goalId, setGoalId,
    handleProjectChange,

    // Assignee options
    assigneeOptionsOpen, setAssigneeOptionsOpen,
    assigneeModelOverride, setAssigneeModelOverride,
    assigneeThinkingEffort, setAssigneeThinkingEffort,
    assigneeChrome, setAssigneeChrome,
    supportsAssigneeOverrides,
    assigneeOptionsTitle,
    assigneeAdapterType,
    modelOverrideOptions,

    // Execution workspace
    executionWorkspaceMode, setExecutionWorkspaceMode,
    selectedExecutionWorkspaceId, setSelectedExecutionWorkspaceId,
    currentProject,
    currentProjectSupportsExecutionWorkspace,
    deduplicatedReusableWorkspaces,
    selectedReusableExecutionWorkspace,

    // Options for selectors
    assigneeOptions,
    projectOptions,
    goalOptions,
    mentionOptions,

    // Computed
    currentAssignee,
    orderedProjects,
    agents,
    suggestedPriority,
    similarIssues,
    canDiscardDraft,
    createIssueErrorMessage,

    // File staging
    stagedFiles,
    isFileDragOver,
    handleFileDragEnter,
    handleFileDragOver,
    handleFileDragLeave,
    handleFileDrop,
    removeStagedFile,
    handleStageFilesPicked,

    // Popover states
    statusOpen, setStatusOpen,
    priorityOpen, setPriorityOpen,
    moreOpen, setMoreOpen,

    // Refs
    descriptionEditorRef,
    stageFileInputRef,
    assigneeSelectorRef,
    projectSelectorRef,

    // Actions
    discardDraft,
    handleSubmit,
    createIssue,
    uploadDescriptionImage,
  };
}

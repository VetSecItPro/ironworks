import { useState, useEffect, useRef, useCallback, useMemo, type ChangeEvent, type DragEvent } from "react";
import { useDialog } from "../../context/DialogContext";
import { useCompany } from "../../context/CompanyContext";
import {
  assigneeValueFromSelection,
  parseAssigneeValue,
} from "../../lib/assignees";
import { trackRecentAssignee } from "../../lib/recent-assignees";
import type { MarkdownEditorRef } from "../MarkdownEditor";
import {
  type StagedIssueFile,
  ISSUE_THINKING_EFFORT_OPTIONS,
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
import { useNewIssueQueries } from "./useNewIssueQueries";

export function useNewIssueForm() {
  const { newIssueOpen, newIssueDefaults, closeNewIssue } = useDialog();
  const { companies, selectedCompanyId, selectedCompany } = useCompany();

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

  function reset() {
    setTitle(""); setDescription(""); setStatus("todo"); setPriority("");
    setAssigneeValue(""); setProjectId(""); setGoalId(""); setProjectWorkspaceId("");
    setAssigneeOptionsOpen(false); setAssigneeModelOverride(""); setAssigneeThinkingEffort("");
    setAssigneeChrome(false); setExecutionWorkspaceMode("shared_workspace");
    setSelectedExecutionWorkspaceId(""); setExpanded(false); setDialogCompanyId(null);
    setStagedFiles([]); setIsFileDragOver(false); setCompanyOpen(false);
    executionWorkspaceDefaultProjectId.current = null;
  }

  // Data queries and mutations
  const queries = useNewIssueQueries({
    effectiveCompanyId,
    newIssueOpen,
    projectId,
    projectWorkspaceId,
    assigneeValue,
    title,
    companies,
    reset,
    closeNewIssue,
    draftTimerRef: draftTimer,
  });

  const {
    agents, orderedProjects, experimentalSettings,
    selectedAssigneeAgentId, selectedAssigneeUserId,
    assigneeAdapterType, supportsAssigneeOverrides,
    deduplicatedReusableWorkspaces,
    createIssue, uploadDescriptionImage,
  } = queries;

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

  function handleCompanyChange(companyId: string) {
    if (companyId === effectiveCompanyId) return;
    setDialogCompanyId(companyId); setAssigneeValue(""); setProjectId("");
    setGoalId(""); setProjectWorkspaceId(""); setAssigneeModelOverride("");
    setAssigneeThinkingEffort(""); setAssigneeChrome(false);
    setExecutionWorkspaceMode("shared_workspace"); setSelectedExecutionWorkspaceId("");
  }

  function discardDraft() { clearDraft(); reset(); closeNewIssue(); }

  // Derived values
  const currentProject = orderedProjects.find((project) => project.id === projectId);
  const currentProjectExecutionWorkspacePolicy =
    experimentalSettings?.enableIsolatedWorkspaces === true
      ? currentProject?.executionWorkspacePolicy ?? null
      : null;
  const currentProjectSupportsExecutionWorkspace = Boolean(currentProjectExecutionWorkspacePolicy?.enabled);
  const selectedReusableExecutionWorkspace = deduplicatedReusableWorkspaces.find(
    (workspace) => workspace.id === selectedExecutionWorkspaceId,
  );

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
    newIssueOpen, closeNewIssue, companies, effectiveCompanyId, dialogCompany,
    expanded, setExpanded, companyOpen, setCompanyOpen, handleCompanyChange,

    // Form fields
    title, setTitle, description, setDescription,
    status, setStatus, priority, setPriority,
    assigneeValue, setAssigneeValue, projectId, goalId, setGoalId, handleProjectChange,

    // Assignee options
    assigneeOptionsOpen, setAssigneeOptionsOpen,
    assigneeModelOverride, setAssigneeModelOverride,
    assigneeThinkingEffort, setAssigneeThinkingEffort,
    assigneeChrome, setAssigneeChrome,
    supportsAssigneeOverrides,
    assigneeOptionsTitle: queries.assigneeOptionsTitle,
    assigneeAdapterType,
    modelOverrideOptions: queries.modelOverrideOptions,

    // Execution workspace
    executionWorkspaceMode, setExecutionWorkspaceMode,
    selectedExecutionWorkspaceId, setSelectedExecutionWorkspaceId,
    currentProject, currentProjectSupportsExecutionWorkspace,
    deduplicatedReusableWorkspaces, selectedReusableExecutionWorkspace,

    // Options
    assigneeOptions: queries.assigneeOptions,
    projectOptions: queries.projectOptions,
    goalOptions: queries.goalOptions,
    mentionOptions: queries.mentionOptions,

    // Computed
    currentAssignee: queries.currentAssignee,
    orderedProjects, agents,
    suggestedPriority: queries.suggestedPriority,
    similarIssues: queries.similarIssues,
    canDiscardDraft, createIssueErrorMessage,

    // File staging
    stagedFiles, isFileDragOver,
    handleFileDragEnter, handleFileDragOver, handleFileDragLeave, handleFileDrop,
    removeStagedFile, handleStageFilesPicked,

    // Popover states
    statusOpen, setStatusOpen, priorityOpen, setPriorityOpen, moreOpen, setMoreOpen,

    // Refs
    descriptionEditorRef, stageFileInputRef, assigneeSelectorRef, projectSelectorRef,

    // Actions
    discardDraft, handleSubmit, createIssue, uploadDescriptionImage,
  };
}

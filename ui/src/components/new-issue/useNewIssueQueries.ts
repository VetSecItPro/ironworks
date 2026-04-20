import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { agentsApi } from "../../api/agents";
import { assetsApi } from "../../api/assets";
import { authApi } from "../../api/auth";
import { executionWorkspacesApi } from "../../api/execution-workspaces";
import { goalsApi } from "../../api/goals";
import { instanceSettingsApi } from "../../api/instanceSettings";
import { issuesApi } from "../../api/issues";
import { projectsApi } from "../../api/projects";
import { useToast } from "../../context/ToastContext";
import { useProjectOrder } from "../../hooks/useProjectOrder";
import { trackFeatureUsed } from "../../lib/analytics";
import { assigneeValueFromSelection, currentUserAssigneeOption, parseAssigneeValue } from "../../lib/assignees";
import { extractProviderIdWithFallback } from "../../lib/model-utils";
import { queryKeys } from "../../lib/queryKeys";
import { getRecentAssigneeIds, sortAgentsByRecency } from "../../lib/recent-assignees";
import type { InlineEntityOption } from "../InlineEntitySelector";
import type { MentionOption } from "../MarkdownEditor";
import {
  clearDraft,
  findSimilarIssues,
  ISSUE_OVERRIDE_ADAPTER_TYPES,
  type StagedIssueFile,
  suggestPriority,
} from "./constants";

interface UseNewIssueQueriesArgs {
  effectiveCompanyId: string | null;
  newIssueOpen: boolean;
  projectId: string;
  projectWorkspaceId: string;
  assigneeValue: string;
  title: string;
  companies: Array<{ id: string; issuePrefix?: string; name: string }>;
  reset: () => void;
  closeNewIssue: () => void;
  draftTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
}

export function useNewIssueQueries({
  effectiveCompanyId,
  newIssueOpen,
  projectId,
  projectWorkspaceId,
  assigneeValue,
  title,
  companies,
  reset,
  closeNewIssue,
  draftTimerRef,
}: UseNewIssueQueriesArgs) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

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
  const activeProjects = useMemo(() => (projects ?? []).filter((p) => !p.archivedAt), [projects]);
  const { orderedProjects } = useProjectOrder({
    projects: activeProjects,
    companyId: effectiveCompanyId,
    userId: currentUserId,
  });

  // Assignee derivations
  const selectedAssignee = useMemo(() => parseAssigneeValue(assigneeValue), [assigneeValue]);
  const selectedAssigneeAgentId = selectedAssignee.assigneeAgentId;
  const selectedAssigneeUserId = selectedAssignee.assigneeUserId;
  const assigneeAdapterType = (agents ?? []).find((agent) => agent.id === selectedAssigneeAgentId)?.adapterType ?? null;
  const supportsAssigneeOverrides = Boolean(
    assigneeAdapterType && ISSUE_OVERRIDE_ADAPTER_TYPES.has(assigneeAdapterType),
  );

  const { data: assigneeAdapterModels } = useQuery({
    queryKey:
      effectiveCompanyId && assigneeAdapterType
        ? queryKeys.agents.adapterModels(effectiveCompanyId, assigneeAdapterType)
        : ["agents", "none", "adapter-models", assigneeAdapterType ?? "none"],
    queryFn: () => agentsApi.adapterModels(effectiveCompanyId!, assigneeAdapterType!),
    enabled: Boolean(effectiveCompanyId) && newIssueOpen && supportsAssigneeOverrides,
  });

  // Mention options for markdown editor
  const mentionOptions = useMemo<MentionOption[]>(() => {
    const options: MentionOption[] = [];
    const activeAgents = [...(agents ?? [])]
      .filter((agent) => agent.status !== "terminated")
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const agent of activeAgents) {
      options.push({
        id: `agent:${agent.id}`,
        name: agent.name,
        kind: "agent",
        agentId: agent.id,
        agentIcon: agent.icon,
      });
    }
    for (const project of orderedProjects) {
      options.push({
        id: `project:${project.id}`,
        name: project.name,
        kind: "project",
        projectId: project.id,
        projectColor: project.color,
      });
    }
    return options;
  }, [agents, orderedProjects]);

  // Selector options
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
    () =>
      orderedProjects.map((project) => ({
        id: project.id,
        label: project.name,
        searchText: project.description ?? "",
      })),
    [orderedProjects],
  );
  const activeGoals = useMemo(
    () => (goals ?? []).filter((g) => g.status !== "achieved" && g.status !== "cancelled"),
    [goals],
  );
  const goalOptions = useMemo<InlineEntityOption[]>(
    () =>
      activeGoals.map((g) => ({
        id: g.id,
        label: g.title,
        searchText: `${g.level} ${g.description ?? ""}`,
      })),
    [activeGoals],
  );
  const modelOverrideOptions = useMemo<InlineEntityOption[]>(
    () =>
      [...(assigneeAdapterModels ?? [])]
        .sort((a, b) => {
          const providerA = extractProviderIdWithFallback(a.id);
          const providerB = extractProviderIdWithFallback(b.id);
          const byProvider = providerA.localeCompare(providerB);
          if (byProvider !== 0) return byProvider;
          return a.id.localeCompare(b.id);
        })
        .map((model) => ({
          id: model.id,
          label: model.label,
          searchText: `${model.id} ${extractProviderIdWithFallback(model.id)}`,
        })),
    [assigneeAdapterModels],
  );

  // Workspace deduplication
  const deduplicatedReusableWorkspaces = useMemo(() => {
    const workspaces = reusableExecutionWorkspaces ?? [];
    const seen = new Map<string, (typeof workspaces)[number]>();
    for (const ws of workspaces) {
      const key = ws.cwd ?? ws.id;
      const existing = seen.get(key);
      if (!existing || new Date(ws.lastUsedAt) > new Date(existing.lastUsedAt)) {
        seen.set(key, ws);
      }
    }
    return Array.from(seen.values());
  }, [reusableExecutionWorkspaces]);

  // Smart suggestions
  const suggestedPriority = useMemo(() => suggestPriority(title), [title]);
  const similarIssues = useMemo(() => findSimilarIssues(title, existingIssues), [title, existingIssues]);

  // Mutations
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
              title: stagedFile.documentKey === "plan" ? null : (stagedFile.title ?? null),
              format: "markdown",
              body,
              baseRevisionId: null,
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
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      if (failures.length > 0) {
        const prefix = (companies.find((company) => company.id === companyId)?.issuePrefix ?? "").trim();
        const issueRef = issue.identifier ?? issue.id;
        pushToast({
          title: `Created ${issueRef} with upload warnings`,
          body: `${failures.length} staged ${failures.length === 1 ? "file" : "files"} could not be added.`,
          tone: "warn",
          action: prefix ? { label: `Open ${issueRef}`, href: `/${prefix}/issues/${issueRef}` } : undefined,
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

  const currentAssignee = selectedAssigneeAgentId ? (agents ?? []).find((a) => a.id === selectedAssigneeAgentId) : null;

  const assigneeOptionsTitle =
    assigneeAdapterType === "claude_local"
      ? "Claude options"
      : assigneeAdapterType === "codex_local"
        ? "Codex options"
        : assigneeAdapterType === "opencode_local"
          ? "OpenCode options"
          : "Agent options";

  return {
    agents,
    orderedProjects,
    experimentalSettings,
    currentUserId,
    selectedAssigneeAgentId,
    selectedAssigneeUserId,
    assigneeAdapterType,
    supportsAssigneeOverrides,
    mentionOptions,
    assigneeOptions,
    projectOptions,
    goalOptions,
    modelOverrideOptions,
    deduplicatedReusableWorkspaces,
    suggestedPriority,
    similarIssues,
    createIssue,
    uploadDescriptionImage,
    currentAssignee,
    assigneeOptionsTitle,
  };
}

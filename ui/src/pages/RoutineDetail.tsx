import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity as ActivityIcon, Clock3, Play, Repeat, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation, useNavigate, useParams } from "@/lib/router";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { projectsApi } from "../api/projects";
import { type RotateRoutineTriggerResponse, type RoutineTriggerResponse, routinesApi } from "../api/routines";
import { EmptyState } from "../components/EmptyState";
import type { InlineEntityOption } from "../components/InlineEntitySelector";
import { MarkdownEditor, type MarkdownEditorRef } from "../components/MarkdownEditor";
import { PageSkeleton } from "../components/PageSkeleton";
import {
  ActivityTab,
  AdvancedDeliverySettings,
  AssignmentRow,
  RoutineHeader,
  RunsTab,
  type SecretMessage,
  SecretMessageBanner,
  TriggersTab,
} from "../components/routine-detail";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { getRecentAssigneeIds, sortAgentsByRecency, trackRecentAssignee } from "../lib/recent-assignees";

const routineTabs = ["triggers", "runs", "activity"] as const;
type RoutineTab = (typeof routineTabs)[number];

function isRoutineTab(value: string | null): value is RoutineTab {
  return value !== null && routineTabs.includes(value as RoutineTab);
}

function getRoutineTabFromSearch(search: string): RoutineTab {
  const tab = new URLSearchParams(search).get("tab");
  return isRoutineTab(tab) ? tab : "triggers";
}

function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export function RoutineDetail() {
  const { routineId } = useParams<{ routineId: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { pushToast } = useToast();
  const hydratedRoutineIdRef = useRef<string | null>(null);
  const titleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const descriptionEditorRef = useRef<MarkdownEditorRef>(null);
  const assigneeSelectorRef = useRef<HTMLButtonElement | null>(null);
  const projectSelectorRef = useRef<HTMLButtonElement | null>(null);
  const [secretMessage, setSecretMessage] = useState<SecretMessage | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [newTrigger, setNewTrigger] = useState({
    kind: "schedule",
    cronExpression: "0 10 * * *",
    signingMode: "bearer",
    replayWindowSec: "300",
  });
  const [editDraft, setEditDraft] = useState({
    title: "",
    description: "",
    projectId: "",
    assigneeAgentId: "",
    priority: "medium",
    concurrencyPolicy: "coalesce_if_active",
    catchUpPolicy: "skip_missed",
    runAfterId: undefined as string | undefined,
    retryPolicy: "none" as string,
  });
  const activeTab = useMemo(() => getRoutineTabFromSearch(location.search), [location.search]);

  // ── Queries ──────────────────────────────────────────────────────────
  const {
    data: routine,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.routines.detail(routineId!),
    queryFn: () => routinesApi.get(routineId!),
    enabled: !!routineId,
  });
  const activeIssueId = routine?.activeIssue?.id;
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.issues.liveRuns(activeIssueId!),
    queryFn: () => heartbeatsApi.liveRunsForIssue(activeIssueId!),
    enabled: !!activeIssueId,
    refetchInterval: 3000,
  });
  const hasLiveRun = (liveRuns ?? []).length > 0;
  const { data: routineRuns } = useQuery({
    queryKey: queryKeys.routines.runs(routineId!),
    queryFn: () => routinesApi.listRuns(routineId!),
    enabled: !!routineId,
    refetchInterval: hasLiveRun ? 3000 : false,
  });
  const relatedActivityIds = useMemo(
    () => ({
      triggerIds: routine?.triggers.map((trigger) => trigger.id) ?? [],
      runIds: routineRuns?.map((run) => run.id) ?? [],
    }),
    [routine?.triggers, routineRuns],
  );
  const { data: activity } = useQuery({
    queryKey: [
      ...queryKeys.routines.activity(selectedCompanyId!, routineId!),
      relatedActivityIds.triggerIds.join(","),
      relatedActivityIds.runIds.join(","),
    ],
    queryFn: () => routinesApi.activity(selectedCompanyId!, routineId!, relatedActivityIds),
    enabled: !!selectedCompanyId && !!routineId && !!routine,
  });
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: allRoutines } = useQuery({
    queryKey: queryKeys.routines.list(selectedCompanyId!),
    queryFn: () => routinesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // ── Derived state ────────────────────────────────────────────────────
  const routineDefaults = useMemo(
    () =>
      routine
        ? {
            title: routine.title,
            description: routine.description ?? "",
            projectId: routine.projectId ?? "",
            assigneeAgentId: routine.assigneeAgentId ?? "",
            priority: routine.priority,
            concurrencyPolicy: routine.concurrencyPolicy,
            catchUpPolicy: routine.catchUpPolicy,
            runAfterId: (routine as unknown as Record<string, unknown>).runAfterId as string | undefined,
            retryPolicy: ((routine as unknown as Record<string, unknown>).retryPolicy as string) ?? "none",
          }
        : null,
    [routine],
  );
  const isEditDirty = useMemo(() => {
    if (!routineDefaults) return false;
    return (
      editDraft.title !== routineDefaults.title ||
      editDraft.description !== routineDefaults.description ||
      editDraft.projectId !== routineDefaults.projectId ||
      editDraft.assigneeAgentId !== routineDefaults.assigneeAgentId ||
      editDraft.priority !== routineDefaults.priority ||
      editDraft.concurrencyPolicy !== routineDefaults.concurrencyPolicy ||
      editDraft.catchUpPolicy !== routineDefaults.catchUpPolicy ||
      editDraft.runAfterId !== routineDefaults.runAfterId ||
      editDraft.retryPolicy !== routineDefaults.retryPolicy
    );
  }, [editDraft, routineDefaults]);

  const agentById = useMemo(() => new Map((agents ?? []).map((agent) => [agent.id, agent])), [agents]);
  const projectById = useMemo(() => new Map((projects ?? []).map((project) => [project.id, project])), [projects]);
  const recentAssigneeIds = useMemo(() => getRecentAssigneeIds(), [routine?.id]);
  const assigneeOptions = useMemo<InlineEntityOption[]>(
    () =>
      sortAgentsByRecency(
        (agents ?? []).filter((agent) => agent.status !== "terminated"),
        recentAssigneeIds,
      ).map((agent) => ({
        id: agent.id,
        label: agent.name,
        searchText: `${agent.name} ${agent.role} ${agent.title ?? ""}`,
      })),
    [agents, recentAssigneeIds],
  );
  const projectOptions = useMemo<InlineEntityOption[]>(
    () =>
      (projects ?? []).map((project) => ({
        id: project.id,
        label: project.name,
        searchText: project.description ?? "",
      })),
    [projects],
  );
  const currentAssignee = editDraft.assigneeAgentId ? (agentById.get(editDraft.assigneeAgentId) ?? null) : null;
  const currentProject = editDraft.projectId ? (projectById.get(editDraft.projectId) ?? null) : null;

  // ── Effects ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!routine) return;
    setBreadcrumbs([{ label: "Routines", href: "/routines" }, { label: routine.title }]);
    if (!routineDefaults) return;
    const changedRoutine = hydratedRoutineIdRef.current !== routine.id;
    if (changedRoutine || !isEditDirty) {
      setEditDraft(routineDefaults);
      hydratedRoutineIdRef.current = routine.id;
    }
  }, [routine, routineDefaults, isEditDirty, setBreadcrumbs]);

  // ── Helpers ──────────────────────────────────────────────────────────
  const copySecretValue = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      pushToast({ title: `${label} copied`, tone: "success" });
    } catch (error) {
      pushToast({
        title: `Failed to copy ${label.toLowerCase()}`,
        body: error instanceof Error ? error.message : "Clipboard access was denied.",
        tone: "error",
      });
    }
  };
  const setActiveTab = (value: string) => {
    if (!routineId || !isRoutineTab(value)) return;
    const params = new URLSearchParams(location.search);
    if (value === "triggers") params.delete("tab");
    else params.set("tab", value);
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "" }, { replace: true });
  };
  const toastErr = (title: string, fallback: string) => (error: Error) =>
    pushToast({ title, body: error instanceof Error ? error.message : fallback, tone: "error" });
  const inv = (...keys: ReadonlyArray<readonly unknown[]>) =>
    Promise.all(keys.map((k) => queryClient.invalidateQueries({ queryKey: k as unknown[] })));
  const invCore = () =>
    inv(
      queryKeys.routines.detail(routineId!),
      queryKeys.routines.list(selectedCompanyId!),
      queryKeys.routines.activity(selectedCompanyId!, routineId!),
    );

  // ── Mutations ────────────────────────────────────────────────────────
  const saveRoutine = useMutation({
    mutationFn: () =>
      routinesApi.update(routineId!, { ...editDraft, description: editDraft.description.trim() || null }),
    onSuccess: () => invCore(),
    onError: toastErr("Failed to save routine", "Ironworks could not save the routine."),
  });
  const runRoutine = useMutation({
    mutationFn: () => routinesApi.run(routineId!),
    onSuccess: async () => {
      pushToast({ title: "Routine run started", tone: "success" });
      setActiveTab("runs");
      await inv(
        queryKeys.routines.detail(routineId!),
        queryKeys.routines.runs(routineId!),
        queryKeys.routines.list(selectedCompanyId!),
        queryKeys.routines.activity(selectedCompanyId!, routineId!),
      );
    },
    onError: toastErr("Routine run failed", "Ironworks could not start the routine run."),
  });
  const updateRoutineStatus = useMutation({
    mutationFn: (status: string) => routinesApi.update(routineId!, { status }),
    onSuccess: async (_data, status) => {
      pushToast({
        title: "Routine saved",
        body: status === "paused" ? "Automation paused." : "Automation enabled.",
        tone: "success",
      });
      await inv(queryKeys.routines.detail(routineId!), queryKeys.routines.list(selectedCompanyId!));
    },
    onError: toastErr("Failed to update routine", "Ironworks could not update the routine."),
  });
  const createTrigger = useMutation({
    mutationFn: async (): Promise<RoutineTriggerResponse> => {
      const existingOfKind = (routine?.triggers ?? []).filter((t) => t.kind === newTrigger.kind).length;
      const autoLabel = existingOfKind > 0 ? `${newTrigger.kind}-${existingOfKind + 1}` : newTrigger.kind;
      return routinesApi.createTrigger(routineId!, {
        kind: newTrigger.kind,
        label: autoLabel,
        ...(newTrigger.kind === "schedule"
          ? { cronExpression: newTrigger.cronExpression.trim(), timezone: getLocalTimezone() }
          : {}),
        ...(newTrigger.kind === "webhook"
          ? { signingMode: newTrigger.signingMode, replayWindowSec: Number(newTrigger.replayWindowSec || "300") }
          : {}),
      });
    },
    onSuccess: async (result) => {
      if (result.secretMaterial)
        setSecretMessage({
          title: "Webhook trigger created",
          webhookUrl: result.secretMaterial.webhookUrl,
          webhookSecret: result.secretMaterial.webhookSecret,
        });
      await invCore();
    },
    onError: toastErr("Failed to add trigger", "Ironworks could not create the trigger."),
  });
  const updateTrigger = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => routinesApi.updateTrigger(id, patch),
    onSuccess: () => invCore(),
    onError: toastErr("Failed to update trigger", "Ironworks could not update the trigger."),
  });
  const deleteTrigger = useMutation({
    mutationFn: (id: string) => routinesApi.deleteTrigger(id),
    onSuccess: () => invCore(),
    onError: toastErr("Failed to delete trigger", "Ironworks could not delete the trigger."),
  });
  const rotateTrigger = useMutation({
    mutationFn: (id: string): Promise<RotateRoutineTriggerResponse> => routinesApi.rotateTriggerSecret(id),
    onSuccess: async (result) => {
      setSecretMessage({
        title: "Webhook secret rotated",
        webhookUrl: result.secretMaterial.webhookUrl,
        webhookSecret: result.secretMaterial.webhookSecret,
      });
      await inv(queryKeys.routines.detail(routineId!), queryKeys.routines.activity(selectedCompanyId!, routineId!));
    },
    onError: toastErr("Failed to rotate webhook secret", "Ironworks could not rotate the webhook secret."),
  });

  // ── Guard renders ────────────────────────────────────────────────────
  if (!selectedCompanyId) return <EmptyState icon={Repeat} message="Select a company to view routines." />;
  if (isLoading) return <PageSkeleton variant="issues-list" />;
  if (error || !routine)
    return (
      <p className="pt-6 text-sm text-destructive">{error instanceof Error ? error.message : "Routine not found"}</p>
    );

  const automationEnabled = routine.status === "active";
  const automationToggleDisabled = updateRoutineStatus.isPending || routine.status === "archived";
  const automationLabel = routine.status === "archived" ? "Archived" : automationEnabled ? "Active" : "Paused";
  const automationLabelClassName =
    routine.status === "archived"
      ? "text-muted-foreground"
      : automationEnabled
        ? "text-emerald-400"
        : "text-muted-foreground";

  return (
    <div className="max-w-2xl space-y-6">
      <RoutineHeader
        title={editDraft.title}
        onTitleChange={(title) => setEditDraft((c) => ({ ...c, title }))}
        titleInputRef={titleInputRef}
        onTitleEnter={() => descriptionEditorRef.current?.focus()}
        onTitleTab={() => {
          if (editDraft.assigneeAgentId) {
            editDraft.projectId ? descriptionEditorRef.current?.focus() : projectSelectorRef.current?.focus();
          } else {
            assigneeSelectorRef.current?.focus();
          }
        }}
        automationEnabled={automationEnabled}
        automationToggleDisabled={automationToggleDisabled}
        automationLabel={automationLabel}
        automationLabelClassName={automationLabelClassName}
        onRunClick={() => runRoutine.mutate()}
        runDisabled={runRoutine.isPending}
        onToggleStatus={() => updateRoutineStatus.mutate(automationEnabled ? "paused" : "active")}
      />

      {secretMessage && <SecretMessageBanner secretMessage={secretMessage} onCopy={copySecretValue} />}

      <AssignmentRow
        assigneeAgentId={editDraft.assigneeAgentId}
        projectId={editDraft.projectId}
        assigneeOptions={assigneeOptions}
        projectOptions={projectOptions}
        currentAssignee={currentAssignee}
        currentProject={currentProject}
        agentById={agentById}
        projectById={projectById}
        assigneeSelectorRef={assigneeSelectorRef}
        projectSelectorRef={projectSelectorRef}
        onAssigneeChange={(assigneeAgentId) => {
          if (assigneeAgentId) trackRecentAssignee(assigneeAgentId);
          setEditDraft((c) => ({ ...c, assigneeAgentId }));
        }}
        onProjectChange={(projectId) => setEditDraft((c) => ({ ...c, projectId }))}
        onAssigneeConfirm={() =>
          editDraft.projectId ? descriptionEditorRef.current?.focus() : projectSelectorRef.current?.focus()
        }
        onProjectConfirm={() => descriptionEditorRef.current?.focus()}
      />

      <MarkdownEditor
        ref={descriptionEditorRef}
        value={editDraft.description}
        onChange={(description) => setEditDraft((c) => ({ ...c, description }))}
        placeholder="Add instructions..."
        bordered={false}
        contentClassName="min-h-[120px] text-[15px] leading-7"
        onSubmit={() => {
          if (!saveRoutine.isPending && editDraft.title.trim() && editDraft.projectId && editDraft.assigneeAgentId)
            saveRoutine.mutate();
        }}
      />

      <AdvancedDeliverySettings
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        concurrencyPolicy={editDraft.concurrencyPolicy}
        onConcurrencyPolicyChange={(v) => setEditDraft((c) => ({ ...c, concurrencyPolicy: v }))}
        catchUpPolicy={editDraft.catchUpPolicy}
        onCatchUpPolicyChange={(v) => setEditDraft((c) => ({ ...c, catchUpPolicy: v }))}
        runAfterId={editDraft.runAfterId}
        onRunAfterIdChange={(v) => setEditDraft((c) => ({ ...c, runAfterId: v }))}
        retryPolicy={editDraft.retryPolicy}
        onRetryPolicyChange={(v) => setEditDraft((c) => ({ ...c, retryPolicy: v }))}
        allRoutines={allRoutines ?? []}
        currentRoutineId={routineId!}
      />

      <div className="flex items-center justify-between">
        {isEditDirty ? <span className="text-xs text-amber-600">Unsaved changes</span> : <span />}
        <Button
          onClick={() => saveRoutine.mutate()}
          disabled={
            saveRoutine.isPending || !editDraft.title.trim() || !editDraft.projectId || !editDraft.assigneeAgentId
          }
        >
          <Save className="mr-2 h-4 w-4" />
          Save routine
        </Button>
      </div>

      <Separator />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
        <TabsList variant="line" className="w-full justify-start gap-1">
          <TabsTrigger value="triggers" className="gap-1.5">
            <Clock3 className="h-3.5 w-3.5" />
            Triggers
          </TabsTrigger>
          <TabsTrigger value="runs" className="gap-1.5">
            <Play className="h-3.5 w-3.5" />
            Runs{hasLiveRun && <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />}
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5">
            <ActivityIcon className="h-3.5 w-3.5" />
            Activity
          </TabsTrigger>
        </TabsList>
        <TabsContent value="triggers">
          <TriggersTab
            triggers={routine.triggers}
            newTrigger={newTrigger}
            onNewTriggerChange={(patch) => setNewTrigger((c) => ({ ...c, ...patch }))}
            onCreateTrigger={() => createTrigger.mutate()}
            createPending={createTrigger.isPending}
            onSaveTrigger={(id, patch) => updateTrigger.mutate({ id, patch })}
            onRotateTrigger={(id) => rotateTrigger.mutate(id)}
            onDeleteTrigger={(id) => deleteTrigger.mutate(id)}
          />
        </TabsContent>
        <TabsContent value="runs">
          <RunsTab
            hasLiveRun={hasLiveRun}
            activeIssueId={activeIssueId}
            companyId={routine.companyId}
            runs={routineRuns ?? []}
          />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab activity={activity ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

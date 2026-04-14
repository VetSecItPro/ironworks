import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import { Plus, Repeat } from "lucide-react";
import { usePageTitle } from "../hooks/usePageTitle";
import { routinesApi } from "../api/routines";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { getRecentAssigneeIds, sortAgentsByRecency, trackRecentAssignee } from "../lib/recent-assignees";
import { cn } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import type { InlineEntityOption } from "../components/InlineEntitySelector";
import type { MarkdownEditorRef } from "../components/MarkdownEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ScheduleCalendarView,
  CreateRoutineDialog,
  RoutineFilterBar,
  RoutineListTable,
  type RoutineDraft,
  type RoutineViewMode,
} from "../components/routines";

export function Routines() {
  usePageTitle("Routines");
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [routineSearch, setRoutineSearch] = useState("");
  const [routineViewMode, setRoutineViewMode] = useState<RoutineViewMode>("list");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "draft" | "archived">("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const descriptionEditorRef = useRef<MarkdownEditorRef>(null);
  const [runningRoutineId, setRunningRoutineId] = useState<string | null>(null);
  const [statusMutationRoutineId, setStatusMutationRoutineId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [draft, setDraft] = useState<RoutineDraft>({
    title: "",
    description: "",
    projectId: "",
    assigneeAgentId: "",
    priority: "medium",
    concurrencyPolicy: "coalesce_if_active",
    catchUpPolicy: "skip_missed",
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Routines" }]);
  }, [setBreadcrumbs]);

  const { data: routines, isLoading, error } = useQuery({
    queryKey: queryKeys.routines.list(selectedCompanyId!),
    queryFn: () => routinesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
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

  const createRoutine = useMutation({
    mutationFn: () =>
      routinesApi.create(selectedCompanyId!, {
        ...draft,
        description: draft.description.trim() || null,
      }),
    onSuccess: async (routine) => {
      setDraft({
        title: "",
        description: "",
        projectId: "",
        assigneeAgentId: "",
        priority: "medium",
        concurrencyPolicy: "coalesce_if_active",
        catchUpPolicy: "skip_missed",
      });
      setComposerOpen(false);
      setAdvancedOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) });
      pushToast({
        title: "Routine created",
        body: "Add the first trigger to turn it into a live workflow.",
        tone: "success",
      });
      navigate(`/routines/${routine.id}?tab=triggers`);
    },
  });

  const updateRoutineStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => routinesApi.update(id, { status }),
    onMutate: ({ id }) => {
      setStatusMutationRoutineId(id);
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(variables.id) }),
      ]);
    },
    onSettled: () => {
      setStatusMutationRoutineId(null);
    },
    onError: (mutationError) => {
      pushToast({
        title: "Failed to update routine",
        body: mutationError instanceof Error ? mutationError.message : "Ironworks could not update the routine.",
        tone: "error",
      });
    },
  });

  const runRoutine = useMutation({
    mutationFn: (id: string) => routinesApi.run(id),
    onMutate: (id) => {
      setRunningRoutineId(id);
    },
    onSuccess: async (_, id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(id) }),
      ]);
    },
    onSettled: () => {
      setRunningRoutineId(null);
    },
    onError: (mutationError) => {
      pushToast({
        title: "Routine run failed",
        body: mutationError instanceof Error ? mutationError.message : "Ironworks could not start the routine run.",
        tone: "error",
      });
    },
  });

  const recentAssigneeIds = useMemo(() => getRecentAssigneeIds(), [composerOpen]);
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
  const agentById = useMemo(
    () => new Map((agents ?? []).map((agent) => [agent.id, agent])),
    [agents],
  );
  const projectById = useMemo(
    () => new Map((projects ?? []).map((project) => [project.id, project])),
    [projects],
  );

  if (!selectedCompanyId) {
    return <EmptyState icon={Repeat} message="Select a company to view routines." />;
  }

  if (isLoading && !routines) {
    return <PageSkeleton variant="issues-list" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Routines</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Scheduled recurring tasks that run automatically on a cadence.
          </p>
        </div>
        <Button size="sm" onClick={() => setComposerOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Create Routine
        </Button>
      </div>

      <CreateRoutineDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        draft={draft}
        setDraft={setDraft}
        advancedOpen={advancedOpen}
        setAdvancedOpen={setAdvancedOpen}
        isPending={createRoutine.isPending}
        isError={createRoutine.isError}
        error={createRoutine.error instanceof Error ? createRoutine.error : null}
        onSubmit={() => createRoutine.mutate()}
        assigneeOptions={assigneeOptions}
        projectOptions={projectOptions}
        agentById={agentById as any}
        projectById={projectById as any}
        onTrackAssignee={trackRecentAssignee}
        descriptionEditorRef={descriptionEditorRef}
      />

      {error ? (
        <Card>
          <CardContent role="alert" className="pt-6 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load routines"}
          </CardContent>
        </Card>
      ) : null}

      {(routines ?? []).length > 0 && (
        <RoutineFilterBar
          routineSearch={routineSearch}
          onSearchChange={setRoutineSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          agentFilter={agentFilter}
          onAgentFilterChange={setAgentFilter}
          agents={agents ?? []}
          viewMode={routineViewMode}
          onViewModeChange={setRoutineViewMode}
        />
      )}

      {routineViewMode === "calendar" && (routines ?? []).length > 0 && (
        <ScheduleCalendarView
          routines={(routines ?? []) as any}
          agentById={agentById as any}
          onRoutineClick={(id) => navigate(`/routines/${id}`)}
        />
      )}

      <div>
        {(routines ?? []).length === 0 ? (
          <div className="py-12">
            <EmptyState
              icon={Repeat}
              message="No routines yet. Use Create routine to define the first recurring workflow."
            />
          </div>
        ) : (
          <div className={cn("", routineViewMode === "calendar" && "hidden")}>
            <RoutineListTable
              routines={(routines ?? []) as any}
              routineSearch={routineSearch}
              statusFilter={statusFilter}
              agentFilter={agentFilter}
              agentById={agentById as any}
              projectById={projectById as any}
              runningRoutineId={runningRoutineId}
              statusMutationRoutineId={statusMutationRoutineId}
              onNavigate={navigate}
              onRunRoutine={(id) => runRoutine.mutate(id)}
              onUpdateStatus={(id, status) => updateRoutineStatus.mutate({ id, status })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

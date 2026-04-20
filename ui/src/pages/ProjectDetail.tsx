import { type BudgetPolicySummary, isUuidLike } from "@ironworksai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyPlus } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Tabs } from "@/components/ui/tabs";
import { Navigate, useLocation, useNavigate, useParams } from "@/lib/router";
import { PluginLauncherOutlet } from "@/plugins/launchers";
import { PluginSlotMount, PluginSlotOutlet, usePluginSlots } from "@/plugins/slots";
import { assetsApi } from "../api/assets";
import { budgetsApi } from "../api/budgets";
import { projectsApi } from "../api/projects";
import { BudgetPolicyCard } from "../components/BudgetPolicyCard";
import { InlineEditor } from "../components/InlineEditor";
import { PageSkeleton } from "../components/PageSkeleton";
import { PageTabBar } from "../components/PageTabBar";
import { ProjectProperties } from "../components/ProjectProperties";
import {
  ColorPicker,
  OverviewContent,
  ProjectActivityTab,
  ProjectIssuesList,
  useProjectFieldSave,
} from "../components/project-detail";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { usePanel } from "../context/PanelContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { projectRouteRef } from "../lib/utils";

type ProjectBaseTab = "overview" | "list" | "configuration" | "budget" | "activity";
type ProjectPluginTab = `plugin:${string}`;
type ProjectTab = ProjectBaseTab | ProjectPluginTab;

function isProjectPluginTab(value: string | null): value is ProjectPluginTab {
  return typeof value === "string" && value.startsWith("plugin:");
}

function resolveProjectTab(pathname: string, projectId: string): ProjectTab | null {
  const segments = pathname.split("/").filter(Boolean);
  const projectsIdx = segments.indexOf("projects");
  if (projectsIdx === -1 || segments[projectsIdx + 1] !== projectId) return null;
  const tab = segments[projectsIdx + 2];
  if (tab === "overview") return "overview";
  if (tab === "configuration") return "configuration";
  if (tab === "budget") return "budget";
  if (tab === "activity") return "activity";
  if (tab === "issues") return "list";
  return null;
}

const TAB_TO_PATH: Record<string, string> = {
  overview: "overview",
  configuration: "configuration",
  budget: "budget",
  activity: "activity",
  list: "issues",
};

export function ProjectDetail() {
  const { companyPrefix, projectId, filter } = useParams<{
    companyPrefix?: string;
    projectId: string;
    filter?: string;
  }>();
  const { companies, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { closePanel } = usePanel();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const routeProjectRef = projectId ?? "";

  const routeCompanyId = useMemo(() => {
    if (!companyPrefix) return null;
    return companies.find((c) => c.issuePrefix.toUpperCase() === companyPrefix.toUpperCase())?.id ?? null;
  }, [companies, companyPrefix]);
  const lookupCompanyId = routeCompanyId ?? selectedCompanyId ?? undefined;
  const canFetchProject = routeProjectRef.length > 0 && (isUuidLike(routeProjectRef) || Boolean(lookupCompanyId));
  const activeRouteTab = routeProjectRef ? resolveProjectTab(location.pathname, routeProjectRef) : null;
  const pluginTabFromSearch = useMemo(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    return isProjectPluginTab(tab) ? tab : null;
  }, [location.search]);
  const activeTab = activeRouteTab ?? pluginTabFromSearch;

  const {
    data: project,
    isLoading,
    error,
  } = useQuery({
    queryKey: [...queryKeys.projects.detail(routeProjectRef), lookupCompanyId ?? null],
    queryFn: () => projectsApi.get(routeProjectRef, lookupCompanyId),
    enabled: canFetchProject,
  });
  const canonicalProjectRef = project ? projectRouteRef(project) : routeProjectRef;
  const projectLookupRef = project?.id ?? routeProjectRef;
  const resolvedCompanyId = project?.companyId ?? selectedCompanyId;

  const { slots: pluginDetailSlots, isLoading: pluginDetailSlotsLoading } = usePluginSlots({
    slotTypes: ["detailTab"],
    entityType: "project",
    companyId: resolvedCompanyId,
    enabled: !!resolvedCompanyId,
  });
  const pluginTabItems = useMemo(
    () =>
      pluginDetailSlots.map((slot) => ({
        value: `plugin:${slot.pluginKey}:${slot.id}` as ProjectPluginTab,
        label: slot.displayName,
        slot,
      })),
    [pluginDetailSlots],
  );
  const activePluginTab = pluginTabItems.find((item) => item.value === activeTab) ?? null;

  useEffect(() => {
    if (!project?.companyId || project.companyId === selectedCompanyId) return;
    setSelectedCompanyId(project.companyId, { source: "route_sync" });
  }, [project?.companyId, selectedCompanyId, setSelectedCompanyId]);

  const invalidateProject = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(routeProjectRef) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectLookupRef) });
    if (resolvedCompanyId) queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(resolvedCompanyId) });
  };

  const updateProject = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      projectsApi.update(projectLookupRef, data, resolvedCompanyId ?? lookupCompanyId),
    onSuccess: invalidateProject,
  });

  const archiveProject = useMutation({
    mutationFn: (archived: boolean) =>
      projectsApi.update(
        projectLookupRef,
        { archivedAt: archived ? new Date().toISOString() : null },
        resolvedCompanyId ?? lookupCompanyId,
      ),
    onSuccess: (updatedProject, archived) => {
      invalidateProject();
      const name = updatedProject?.name ?? project?.name ?? "Project";
      pushToast({ title: `"${name}" has been ${archived ? "archived" : "unarchived"}`, tone: "success" });
      if (archived) navigate("/dashboard");
    },
    onError: (_, archived) => {
      pushToast({ title: archived ? "Failed to archive project" : "Failed to unarchive project", tone: "error" });
    },
  });

  const deleteProject = useMutation({
    mutationFn: () => projectsApi.remove(projectLookupRef, resolvedCompanyId ?? lookupCompanyId),
    onSuccess: () => {
      pushToast({ title: `"${project?.name ?? "Project"}" has been deleted`, tone: "success" });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(resolvedCompanyId ?? lookupCompanyId ?? "") });
      navigate("/dashboard");
    },
    onError: () => {
      pushToast({ title: "Failed to delete project", tone: "error" });
    },
  });

  const cloneProject = useMutation({
    mutationFn: async () => {
      if (!project || !resolvedCompanyId) throw new Error("No project to clone");
      return projectsApi.create(resolvedCompanyId, {
        name: `${project.name} (Copy)`,
        description: project.description,
        color: project.color,
        targetDate: project.targetDate,
        status: "planned",
      });
    },
    onSuccess: (cloned) => {
      pushToast({ title: `Project cloned as "${cloned.name}"`, tone: "success" });
      if (resolvedCompanyId) queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(resolvedCompanyId) });
      navigate(`/projects/${cloned.urlKey ?? cloned.id}`);
    },
    onError: () => {
      pushToast({ title: "Failed to clone project", tone: "error" });
    },
  });

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      if (!resolvedCompanyId) throw new Error("No company selected");
      return assetsApi.uploadImage(resolvedCompanyId, file, `projects/${projectLookupRef || "draft"}`);
    },
  });

  const { data: budgetOverview } = useQuery({
    queryKey: queryKeys.budgets.overview(resolvedCompanyId ?? "__none__"),
    queryFn: () => budgetsApi.overview(resolvedCompanyId!),
    enabled: !!resolvedCompanyId,
    refetchInterval: 30_000,
    staleTime: 5_000,
  });

  const { updateProjectField, getFieldSaveState } = useProjectFieldSave(
    projectLookupRef,
    resolvedCompanyId,
    lookupCompanyId,
    invalidateProject,
  );

  useEffect(() => {
    setBreadcrumbs([
      { label: "Projects", href: "/projects" },
      { label: project?.name ?? routeProjectRef ?? "Project" },
    ]);
  }, [setBreadcrumbs, project, routeProjectRef]);

  useEffect(() => {
    if (!project || routeProjectRef === canonicalProjectRef) return;
    if (isProjectPluginTab(activeTab)) {
      navigate(`/projects/${canonicalProjectRef}?tab=${encodeURIComponent(activeTab)}`, { replace: true });
      return;
    }
    const pathSeg = activeTab && TAB_TO_PATH[activeTab];
    if (pathSeg) {
      navigate(`/projects/${canonicalProjectRef}/${pathSeg}${activeTab === "list" && filter ? `/${filter}` : ""}`, {
        replace: true,
      });
      return;
    }
    navigate(`/projects/${canonicalProjectRef}`, { replace: true });
  }, [project, routeProjectRef, canonicalProjectRef, activeTab, filter, navigate]);

  useEffect(() => {
    closePanel();
    return () => closePanel();
  }, [closePanel]);

  const projectBudgetSummary = useMemo(() => {
    const matched = budgetOverview?.policies.find(
      (p) => p.scopeType === "project" && p.scopeId === (project?.id ?? routeProjectRef),
    );
    if (matched) return matched;
    return {
      policyId: "",
      companyId: resolvedCompanyId ?? "",
      scopeType: "project",
      scopeId: project?.id ?? routeProjectRef,
      scopeName: project?.name ?? "Project",
      metric: "billed_cents",
      windowKind: "lifetime",
      amount: 0,
      observedAmount: 0,
      remainingAmount: 0,
      utilizationPercent: 0,
      warnPercent: 80,
      hardStopEnabled: true,
      notifyEnabled: true,
      isActive: false,
      status: "ok",
      paused: Boolean(project?.pausedAt),
      pauseReason: project?.pauseReason ?? null,
      windowStart: new Date(),
      windowEnd: new Date(),
    } satisfies BudgetPolicySummary;
  }, [budgetOverview?.policies, project, resolvedCompanyId, routeProjectRef]);

  const budgetMutation = useMutation({
    mutationFn: (amount: number) =>
      budgetsApi.upsertPolicy(resolvedCompanyId!, {
        scopeType: "project",
        scopeId: project?.id ?? routeProjectRef,
        amount,
        windowKind: "lifetime",
      }),
    onSuccess: () => {
      if (!resolvedCompanyId) return;
      for (const key of [
        queryKeys.budgets.overview(resolvedCompanyId),
        queryKeys.projects.detail(routeProjectRef),
        queryKeys.projects.detail(projectLookupRef),
        queryKeys.projects.list(resolvedCompanyId),
        queryKeys.dashboard(resolvedCompanyId),
      ])
        queryClient.invalidateQueries({ queryKey: key });
    },
  });

  if (pluginTabFromSearch && !pluginDetailSlotsLoading && !activePluginTab)
    return <Navigate to={`/projects/${canonicalProjectRef}/issues`} replace />;

  if (routeProjectRef && activeTab === null) {
    let cachedTab: string | null = null;
    if (project?.id) {
      try {
        cachedTab = localStorage.getItem(`ironworks:project-tab:${project.id}`);
      } catch {}
    }
    if (cachedTab === "overview") return <Navigate to={`/projects/${canonicalProjectRef}/overview`} replace />;
    if (cachedTab === "configuration")
      return <Navigate to={`/projects/${canonicalProjectRef}/configuration`} replace />;
    if (cachedTab === "budget") return <Navigate to={`/projects/${canonicalProjectRef}/budget`} replace />;
    if (cachedTab === "activity") return <Navigate to={`/projects/${canonicalProjectRef}/activity`} replace />;
    if (isProjectPluginTab(cachedTab))
      return <Navigate to={`/projects/${canonicalProjectRef}?tab=${encodeURIComponent(cachedTab)}`} replace />;
    return <Navigate to={`/projects/${canonicalProjectRef}/issues`} replace />;
  }

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!project) return null;

  const pluginCtx = {
    companyId: resolvedCompanyId ?? null,
    companyPrefix: companyPrefix ?? null,
    projectId: project.id,
    projectRef: canonicalProjectRef,
    entityId: project.id,
    entityType: "project" as const,
  };

  const handleTabChange = (tab: ProjectTab) => {
    if (project?.id) {
      try {
        localStorage.setItem(`ironworks:project-tab:${project.id}`, tab);
      } catch {}
    }
    if (isProjectPluginTab(tab)) {
      navigate(`/projects/${canonicalProjectRef}?tab=${encodeURIComponent(tab)}`);
      return;
    }
    navigate(`/projects/${canonicalProjectRef}/${TAB_TO_PATH[tab] ?? "issues"}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="h-7 flex items-center">
          <ColorPicker
            currentColor={project.color ?? "#6366f1"}
            onSelect={(color) => updateProject.mutate({ color })}
          />
        </div>
        <div className="min-w-0 space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <InlineEditor
              value={project.name}
              onSave={(name) => updateProject.mutate({ name })}
              as="h2"
              className="text-xl font-bold"
            />
            <button
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              onClick={() => cloneProject.mutate()}
              disabled={cloneProject.isPending}
            >
              <CopyPlus className="h-3 w-3" />
              {cloneProject.isPending ? "Cloning..." : "Clone"}
            </button>
          </div>
          {project.pauseReason === "budget" && (
            <div className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-red-200">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              Paused by budget hard stop
            </div>
          )}
        </div>
      </div>

      <PluginSlotOutlet
        slotTypes={["toolbarButton", "contextMenuItem"]}
        entityType="project"
        context={pluginCtx}
        className="flex flex-wrap gap-2"
        itemClassName="inline-flex"
        missingBehavior="placeholder"
      />
      <PluginLauncherOutlet
        placementZones={["toolbarButton"]}
        entityType="project"
        context={pluginCtx}
        className="flex flex-wrap gap-2"
        itemClassName="inline-flex"
      />

      <Tabs value={activeTab ?? "list"} onValueChange={(v) => handleTabChange(v as ProjectTab)}>
        <PageTabBar
          items={[
            { value: "list", label: "Missions" },
            { value: "overview", label: "Overview" },
            { value: "activity", label: "Activity" },
            { value: "configuration", label: "Configuration" },
            { value: "budget", label: "Budget" },
            ...pluginTabItems.map((i) => ({ value: i.value, label: i.label })),
          ]}
          align="start"
          value={activeTab ?? "list"}
          onValueChange={(v) => handleTabChange(v as ProjectTab)}
        />
      </Tabs>

      {activeTab === "overview" && (
        <OverviewContent
          project={project}
          onUpdate={(data) => updateProject.mutate(data)}
          budgetSummary={projectBudgetSummary}
          imageUploadHandler={async (file) => {
            const a = await uploadImage.mutateAsync(file);
            return a.contentPath;
          }}
        />
      )}
      {activeTab === "list" && project?.id && resolvedCompanyId && (
        <ProjectIssuesList projectId={project.id} companyId={resolvedCompanyId} goalIds={project.goalIds} />
      )}
      {activeTab === "activity" && project?.id && resolvedCompanyId && (
        <ProjectActivityTab projectId={project.id} companyId={resolvedCompanyId} />
      )}
      {activeTab === "configuration" && (
        <div className="max-w-4xl">
          <ProjectProperties
            project={project}
            onUpdate={(data) => updateProject.mutate(data)}
            onFieldUpdate={updateProjectField}
            getFieldSaveState={getFieldSaveState}
            onArchive={(archived) => archiveProject.mutate(archived)}
            archivePending={archiveProject.isPending}
            onDelete={() => deleteProject.mutate()}
            deletePending={deleteProject.isPending}
          />
        </div>
      )}
      {activeTab === "budget" && resolvedCompanyId ? (
        <div className="max-w-3xl">
          <BudgetPolicyCard
            summary={projectBudgetSummary}
            variant="plain"
            isSaving={budgetMutation.isPending}
            onSave={(amount) => budgetMutation.mutate(amount)}
          />
        </div>
      ) : null}
      {activePluginTab && (
        <PluginSlotMount
          slot={activePluginTab.slot}
          context={{ ...pluginCtx, companyId: resolvedCompanyId }}
          missingBehavior="placeholder"
        />
      )}
    </div>
  );
}

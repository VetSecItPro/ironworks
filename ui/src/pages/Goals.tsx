import type { Goal } from "@ironworksai/shared";
import { useQuery } from "@tanstack/react-query";
import { Plus, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { type GoalProgressItem, goalProgressApi } from "../api/goalProgress";
import { goalsApi } from "../api/goals";
import { issuesApi } from "../api/issues";
import { EmptyState } from "../components/EmptyState";
import {
  CascadeSummaryBanner,
  GoalCard,
  GoalFilterBar,
  GoalGanttView,
  type GoalSortField,
  type GoalStatusFilter,
  GoalTreeNode,
  QuarterEndBanner,
  type ViewMode,
} from "../components/goals";
import { PageSkeleton } from "../components/PageSkeleton";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { usePageTitle } from "../hooks/usePageTitle";
import { queryKeys } from "../lib/queryKeys";

export function Goals() {
  usePageTitle("Goals");
  const { selectedCompanyId } = useCompany();
  const { openNewGoal } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GoalStatusFilter>("all");
  const [sortField, setSortField] = useState<GoalSortField>("updated");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  useEffect(() => {
    setBreadcrumbs([{ label: "Goals" }]);
  }, [setBreadcrumbs]);

  const {
    data: goals,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Fetch progress for all goals
  const { data: progressData } = useQuery({
    queryKey: ["goals", "progress", selectedCompanyId],
    queryFn: () => goalProgressApi.batch(selectedCompanyId!),
    enabled: !!selectedCompanyId && goals !== undefined,
  });

  const progressMap = useMemo(() => {
    const map = new Map<string, GoalProgressItem>();
    for (const p of progressData ?? []) {
      map.set(p.goalId, p);
    }
    return map;
  }, [progressData]);

  // Filter, search, sort root goals
  const rootGoals = useMemo(() => {
    let filtered = (goals ?? []).filter((g) => !g.parentId);
    if (statusFilter !== "all") filtered = filtered.filter((g) => g.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((g) => g.title.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q));
    }
    filtered.sort((a, b) => {
      if (sortField === "title") return a.title.localeCompare(b.title);
      if (sortField === "progress") {
        const pa = progressMap.get(a.id)?.progressPercent ?? 0;
        const pb = progressMap.get(b.id)?.progressPercent ?? 0;
        return pb - pa;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    return filtered;
  }, [goals, statusFilter, search, sortField, progressMap]);

  const childrenMap = useMemo(() => {
    const map = new Map<string, Goal[]>();
    for (const g of goals ?? []) {
      if (g.parentId) {
        const children = map.get(g.parentId) ?? [];
        children.push(g);
        map.set(g.parentId, children);
      }
    }
    return map;
  }, [goals]);

  // For tree view: fetch issues linked to goals
  const { data: allIssues } = useQuery({
    queryKey: ["goals", "issues-for-tree", selectedCompanyId],
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && viewMode === "tree",
    staleTime: 30_000,
  });

  const issuesByGoal = useMemo(() => {
    const map = new Map<string, Array<{ id: string; title: string; status: string; identifier: string | null }>>();
    for (const issue of allIssues ?? []) {
      if (issue.goalId) {
        const arr = map.get(issue.goalId) ?? [];
        arr.push({ id: issue.id, title: issue.title, status: issue.status, identifier: issue.identifier ?? null });
        map.set(issue.goalId, arr);
      }
    }
    return map;
  }, [allIssues]);

  // Summary stats
  const totalGoals = goals?.length ?? 0;
  const activeGoals = (goals ?? []).filter((g) => g.status === "active").length;
  const achievedGoals = (goals ?? []).filter((g) => g.status === "achieved").length;

  if (!selectedCompanyId) {
    return <EmptyState icon={Target} message="Select a company to view goals." />;
  }

  if (isLoading && !goals) {
    return <PageSkeleton variant="list" />;
  }

  if (error) {
    return (
      <EmptyState
        icon={Target}
        message={`Failed to load goals: ${error instanceof Error ? error.message : "Unknown error"}`}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Goals</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Set objectives and track progress as your agents deliver results.
          </p>
          {totalGoals > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeGoals} active · {achievedGoals} achieved · {totalGoals} total
            </p>
          )}
        </div>
        <Button size="sm" onClick={() => openNewGoal()}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Create Goal
        </Button>
      </div>

      {/* Quarterly OKR cycle hint */}
      {totalGoals > 0 && <QuarterEndBanner inProgressCount={activeGoals} />}

      {/* Cascade summary banner */}
      {totalGoals > 0 && progressData && <CascadeSummaryBanner goals={goals ?? []} progressMap={progressMap} />}

      {/* Toolbar */}
      {totalGoals > 0 && (
        <GoalFilterBar
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          sortField={sortField}
          onSortFieldChange={setSortField}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      )}

      {/* Empty state */}
      {totalGoals === 0 && (
        <EmptyState
          icon={Target}
          message="Goals track what your agents are working toward. Create a goal, then add missions or run a playbook to break it into tasks."
          action="Create Goal"
          onAction={() => openNewGoal()}
        />
      )}

      {/* Goal cards / tree */}
      {rootGoals.length > 0 && viewMode === "list" && (
        <div className="space-y-3">
          {rootGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              progress={progressMap.get(goal.id)}
              subGoals={childrenMap.get(goal.id)}
            />
          ))}
        </div>
      )}

      {rootGoals.length > 0 && viewMode === "tree" && (
        <div className="space-y-3">
          {rootGoals.map((goal) => (
            <GoalTreeNode
              key={goal.id}
              goal={goal}
              progress={progressMap.get(goal.id)}
              childGoals={childrenMap.get(goal.id) ?? []}
              allGoals={goals ?? []}
              progressMap={progressMap}
              issuesByGoal={issuesByGoal}
              depth={0}
            />
          ))}
        </div>
      )}

      {rootGoals.length > 0 && viewMode === "timeline" && (
        <div className="rounded-lg border border-border p-4 overflow-x-auto">
          <GoalGanttView goals={rootGoals} progressMap={progressMap} childrenMap={childrenMap} />
        </div>
      )}
    </div>
  );
}

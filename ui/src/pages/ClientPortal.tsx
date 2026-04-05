import { useEffect, useMemo, useState } from "react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useQuery } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { goalProgressApi } from "../api/goalProgress";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import {
  Building2,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Flag,
  Milestone,
  Target,
} from "lucide-react";

/**
 * Client Portal - read-only project dashboard mockup for external stakeholders.
 * Shows: project name, milestones hit, deliverables, next steps.
 * No internal details (no costs, no agent names).
 */

interface PortalMilestone {
  id: string;
  label: string;
  status: "completed" | "in_progress" | "upcoming";
  date: string | null;
}

interface PortalDeliverable {
  id: string;
  title: string;
  status: string;
  completedAt: string | null;
}

export function ClientPortal() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Client Portal" }]);
  }, [setBreadcrumbs]);

  const { data: issues, isLoading: issuesLoading } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: goalsProgress, isLoading: goalsLoading } = useQuery({
    queryKey: ["goals", "progress", selectedCompanyId!],
    queryFn: () => goalProgressApi.batch(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Derive milestones from goals progress
  const milestones = useMemo<PortalMilestone[]>(() => {
    if (!goalsProgress || !Array.isArray(goalsProgress)) return [];

    return goalsProgress.slice(0, 8).map((g) => ({
      id: g.goalId,
      label: g.title,
      status:
        g.status === "completed" || g.status === "done"
          ? "completed" as const
          : g.status === "in_progress" || g.status === "active"
            ? "in_progress" as const
            : "upcoming" as const,
      date: null,
    }));
  }, [goalsProgress]);

  // Derive deliverables from completed issues
  const deliverables = useMemo<PortalDeliverable[]>(() => {
    if (!issues) return [];
    return issues
      .filter((i) => i.status === "done")
      .sort((a, b) => {
        const da = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const db = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return db - da;
      })
      .slice(0, 10)
      .map((i) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        completedAt: i.completedAt ? new Date(i.completedAt).toLocaleDateString() : null,
      }));
  }, [issues]);

  // Next steps = active issues (no agent names shown)
  const nextSteps = useMemo(() => {
    if (!issues) return [];
    return issues
      .filter(
        (i) =>
          i.status === "in_progress" ||
          i.status === "todo" ||
          i.status === "backlog",
      )
      .slice(0, 6)
      .map((i) => ({
        id: i.id,
        title: i.title,
        priority: i.priority,
        status: i.status,
      }));
  }, [issues]);

  const totalIssues = issues?.length ?? 0;
  const completedIssues = issues?.filter((i) => i.status === "done").length ?? 0;
  const completionPct = totalIssues > 0 ? Math.round((completedIssues / totalIssues) * 100) : 0;

  if (!selectedCompanyId) {
    return <EmptyState icon={Building2} message="Select a company to view the Client Portal." />;
  }

  if (issuesLoading || goalsLoading) return <PageSkeleton variant="dashboard" />;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header - branded */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div
          className="h-2"
          style={{ backgroundColor: selectedCompany?.brandColor ?? "hsl(var(--primary))" }}
        />
        <div className="p-6">
          <div className="flex items-center gap-3">
            {selectedCompany?.brandColor && (
              <div
                className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center"
                style={{ backgroundColor: selectedCompany.brandColor }}
              >
                <Building2 className="h-5 w-5 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold">{selectedCompany?.name ?? "Project"}</h1>
              <p className="text-sm text-muted-foreground">
                Client project overview
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">Overall progress</span>
              <span className="font-semibold tabular-nums">{completionPct}%</span>
            </div>
            <div className="h-2.5 bg-muted/40 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${completionPct}%`,
                  backgroundColor: selectedCompany?.brandColor ?? "hsl(var(--primary))",
                }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
              <span>{completedIssues} completed</span>
              <span>{totalIssues} total tasks</span>
            </div>
          </div>
        </div>
      </div>

      {/* Milestones */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Milestone className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Milestones</h2>
        </div>
        {milestones.length === 0 ? (
          <p className="text-xs text-muted-foreground">No milestones defined yet.</p>
        ) : (
          <div className="space-y-3">
            {milestones.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                {m.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : m.status === "in_progress" ? (
                  <Clock className="h-4 w-4 text-blue-500 shrink-0 animate-pulse" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "text-sm",
                      m.status === "completed" && "line-through text-muted-foreground",
                    )}
                  >
                    {m.label}
                  </div>
                </div>
                {m.date && (
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {new Date(m.date).toLocaleDateString()}
                  </span>
                )}
                <span
                  className={cn(
                    "text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0",
                    m.status === "completed"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : m.status === "in_progress"
                        ? "bg-blue-500/10 text-blue-500"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {m.status === "completed"
                    ? "Done"
                    : m.status === "in_progress"
                      ? "In Progress"
                      : "Upcoming"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deliverables */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Recent Deliverables</h2>
        </div>
        {deliverables.length === 0 ? (
          <p className="text-xs text-muted-foreground">No deliverables completed yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {deliverables.map((d) => (
              <div key={d.id} className="flex items-center gap-3 py-2.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span className="text-sm flex-1 min-w-0 truncate">{d.title}</span>
                {d.completedAt && (
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {d.completedAt}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Next Steps */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Next Steps</h2>
        </div>
        {nextSteps.length === 0 ? (
          <p className="text-xs text-muted-foreground">All tasks completed.</p>
        ) : (
          <div className="space-y-2">
            {nextSteps.map((step) => (
              <div
                key={step.id}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                <Flag
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    step.priority === "critical"
                      ? "text-red-500"
                      : step.priority === "high"
                        ? "text-orange-500"
                        : "text-muted-foreground",
                  )}
                />
                <span className="text-sm flex-1 min-w-0 truncate">{step.title}</span>
                <span
                  className={cn(
                    "text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0",
                    step.status === "in_progress"
                      ? "bg-blue-500/10 text-blue-500"
                      : step.status === "todo"
                        ? "bg-amber-500/10 text-amber-500"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {step.status === "in_progress"
                    ? "Active"
                    : step.status === "todo"
                      ? "Queued"
                      : "Backlog"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground pb-8">
        Powered by IronWorks - AI Workforce Management
      </div>
    </div>
  );
}

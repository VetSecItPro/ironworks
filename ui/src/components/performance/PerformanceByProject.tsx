import { cn, formatCents } from "../../lib/utils";
import { Identity } from "../Identity";
import type { AgentPerfRow } from "./ratingUtils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Issue, Project } from "@ironworksai/shared";

interface ProjectRow extends Omit<AgentPerfRow, "completionRate"> {
  done: number;
  active: number;
  inReview: number;
  todo: number;
  backlog: number;
  blocked: number;
  total: number;
  avgCloseH: number | null;
  completionRate: number | null;
}

export function PerformanceByProject({
  rows,
  issues,
  projects,
  selectedProjectId,
  onSelectProject,
}: {
  rows: AgentPerfRow[];
  issues: Issue[];
  projects: Project[];
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
}) {
  const activeProjects = projects.filter((p) => !p.archivedAt);
  const effectiveProjectId = selectedProjectId || activeProjects[0]?.id || "";
  const selectedProject = activeProjects.find(
    (p) => p.id === effectiveProjectId,
  );
  const projectIssues = issues.filter((i) => i.projectId === effectiveProjectId);

  const projectRows: ProjectRow[] = rows.map((r) => {
    const agentIssues = projectIssues.filter(
      (i) => i.assigneeAgentId === r.agentId,
    );
    const done = agentIssues.filter((i) => i.status === "done").length;
    const active = agentIssues.filter(
      (i) => i.status === "in_progress",
    ).length;
    const inReview = agentIssues.filter(
      (i) => i.status === "in_review",
    ).length;
    const todo = agentIssues.filter((i) => i.status === "todo").length;
    const backlog = agentIssues.filter((i) => i.status === "backlog").length;
    const blocked = agentIssues.filter((i) => i.status === "blocked").length;
    const total = agentIssues.length;

    let closeMs = 0;
    let closeCount = 0;
    for (const i of agentIssues.filter((i) => i.status === "done")) {
      if (i.startedAt && i.completedAt) {
        closeMs +=
          new Date(i.completedAt).getTime() -
          new Date(i.startedAt).getTime();
        closeCount++;
      }
    }
    const avgCloseH =
      closeCount > 0 ? closeMs / closeCount / (1000 * 60 * 60) : null;
    const cancelled = agentIssues.filter(
      (i) => i.status === "cancelled",
    ).length;
    const completionRate =
      done + cancelled > 0
        ? Math.round((done / (done + cancelled)) * 100)
        : total > 0
          ? 0
          : null;

    return {
      ...r,
      done,
      active,
      inReview,
      todo,
      backlog,
      blocked,
      total,
      avgCloseH,
      completionRate,
    };
  });

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Performance by Project
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">
            Project:
          </span>
          <Select
            value={effectiveProjectId}
            onValueChange={onSelectProject}
          >
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {activeProjects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: p.color ?? "#6366f1" }}
                    />
                    {p.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedProject && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: selectedProject.color ?? "#6366f1" }}
          />
          <span>{projectIssues.length} total issues</span>
          <span>·</span>
          <span>
            {projectIssues.filter((i) => i.status === "done").length} done
          </span>
          <span>·</span>
          <span>
            {
              projectIssues.filter((i) => i.status === "in_progress").length
            }{" "}
            active
          </span>
          {projectIssues.filter((i) => i.status === "blocked").length > 0 && (
            <>
              <span>·</span>
              <span className="text-red-400">
                {
                  projectIssues.filter((i) => i.status === "blocked").length
                }{" "}
                blocked
              </span>
            </>
          )}
        </div>
      )}

      {/* Mobile card view */}
      <div className="md:hidden divide-y divide-border border-t border-border">
        {projectRows.map((r) => (
          <div key={r.agentId} className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium truncate">{r.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {r.total} total
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm tabular-nums">
              <div>
                <div className="text-xs text-muted-foreground/80">Done</div>
                <div
                  className={
                    r.done > 0
                      ? "text-emerald-400"
                      : "text-muted-foreground/40"
                  }
                >
                  {r.done}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground/80">Active</div>
                <div
                  className={
                    r.active > 0 ? "text-blue-400" : "text-muted-foreground/40"
                  }
                >
                  {r.active}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground/80">Blocked</div>
                <div
                  className={
                    r.blocked > 0
                      ? "text-red-400"
                      : "text-muted-foreground/40"
                  }
                >
                  {r.blocked}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Agent
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Done
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Active
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Review
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Todo
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Blocked
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Avg Time
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Completion
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {projectRows.map((r) => (
              <tr
                key={r.agentId}
                className="hover:bg-accent/30 transition-colors"
              >
                <td className="px-4 py-2.5">
                  <Identity name={r.name} size="sm" />
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums">
                  {r.done > 0 ? (
                    <span className="text-emerald-400">{r.done}</span>
                  ) : (
                    <span className="text-muted-foreground/40">0</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums">
                  {r.active > 0 ? (
                    <span className="text-blue-400">{r.active}</span>
                  ) : (
                    <span className="text-muted-foreground/40">0</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums">
                  {r.inReview > 0 ? (
                    <span className="text-violet-400">{r.inReview}</span>
                  ) : (
                    <span className="text-muted-foreground/40">0</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums">
                  {r.todo > 0 ? (
                    <span className="text-amber-400">{r.todo}</span>
                  ) : (
                    <span className="text-muted-foreground/40">0</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums">
                  {r.blocked > 0 ? (
                    <span className="text-red-400">{r.blocked}</span>
                  ) : (
                    <span className="text-muted-foreground/40">0</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums font-medium">
                  {r.total > 0 ? (
                    r.total
                  ) : (
                    <span className="text-muted-foreground/40">0</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {r.avgCloseH !== null ? `${r.avgCloseH.toFixed(1)}h` : "-"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {r.completionRate !== null ? (
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            r.completionRate >= 80
                              ? "bg-emerald-500"
                              : r.completionRate >= 50
                                ? "bg-amber-500"
                                : "bg-red-500",
                          )}
                          style={{ width: `${r.completionRate}%` }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground tabular-nums w-7 text-right">
                        {r.completionRate}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground/40">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

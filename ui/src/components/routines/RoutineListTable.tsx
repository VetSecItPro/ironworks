import { MoreHorizontal } from "lucide-react";
import { AgentIcon } from "../AgentIconPicker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RoutineHealthBadge } from "./RoutineHealthBadge";
import { formatLastRunTimestamp, nextRoutineStatus } from "./routine-constants";

interface RoutineItem {
  id: string;
  title: string;
  status: string;
  projectId: string | null;
  assigneeAgentId: string | null;
  lastRun?: {
    triggeredAt?: string | Date | null;
    status: string;
    failureReason?: string | null;
    linkedIssue?: { title?: string } | null;
  } | null;
  triggers?: Array<{ enabled: boolean; nextRunAt?: string | null; schedule?: string | null }>;
}

export interface RoutineListTableProps {
  routines: RoutineItem[];
  routineSearch: string;
  statusFilter: string;
  agentFilter: string;
  agentById: Map<string, { id: string; name: string; icon?: string | null }>;
  projectById: Map<string, { id: string; name: string; color?: string | null }>;
  runningRoutineId: string | null;
  statusMutationRoutineId: string | null;
  onNavigate: (path: string) => void;
  onRunRoutine: (id: string) => void;
  onUpdateStatus: (id: string, status: string) => void;
}

export function RoutineListTable({
  routines,
  routineSearch,
  statusFilter,
  agentFilter,
  agentById,
  projectById,
  runningRoutineId,
  statusMutationRoutineId,
  onNavigate,
  onRunRoutine,
  onUpdateStatus,
}: RoutineListTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Project</th>
            <th className="px-3 py-2 font-medium">Agent</th>
            <th className="px-3 py-2 font-medium">Last run</th>
            <th className="px-3 py-2 font-medium">Next run</th>
            <th className="px-3 py-2 font-medium">Enabled</th>
            <th className="w-12 px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {routines.filter((r) => {
            if (routineSearch.trim() && !r.title.toLowerCase().includes(routineSearch.toLowerCase())) return false;
            if (statusFilter !== "all" && r.status !== statusFilter) return false;
            if (agentFilter !== "all" && r.assigneeAgentId !== agentFilter) return false;
            return true;
          }).map((routine) => {
            const enabled = routine.status === "active";
            const isArchived = routine.status === "archived";
            const isStatusPending = statusMutationRoutineId === routine.id;
            return (
              <tr
                key={routine.id}
                className="align-middle border-b border-border transition-colors hover:bg-accent/50 last:border-b-0 cursor-pointer"
                onClick={() => onNavigate(`/routines/${routine.id}`)}
              >
                <td className="px-3 py-2.5">
                  <div className="min-w-[180px]">
                    <span className="font-medium">
                      {routine.title}
                    </span>
                    {routine.status === "draft" && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-amber-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Needs setup - assign agent & project
                      </div>
                    )}
                    {routine.status !== "draft" && (isArchived || routine.status === "paused") && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {isArchived ? "archived" : "paused"}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  {routine.projectId ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span
                        className="shrink-0 h-3 w-3 rounded-sm"
                        style={{ backgroundColor: projectById.get(routine.projectId)?.color ?? "#6366f1" }}
                      />
                      <span className="truncate">{projectById.get(routine.projectId)?.name ?? "Unknown"}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {routine.assigneeAgentId ? (() => {
                    const agent = agentById.get(routine.assigneeAgentId);
                    return agent ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <AgentIcon icon={agent.icon} className="h-4 w-4 shrink-0" />
                        <span className="truncate">{agent.name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unknown</span>
                    );
                  })() : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    {formatLastRunTimestamp(routine.lastRun?.triggeredAt)}
                    <RoutineHealthBadge lastRunAt={routine.lastRun?.triggeredAt} status={routine.status} />
                  </div>
                  {routine.lastRun ? (
                    <>
                      <div className="mt-1 text-xs">{routine.lastRun.status.replaceAll("_", " ")}</div>
                      {routine.lastRun.failureReason ? (
                        <div className="mt-0.5 text-[10px] text-red-500 truncate max-w-[200px]" title={routine.lastRun.failureReason}>
                          {routine.lastRun.failureReason.slice(0, 60)}
                        </div>
                      ) : routine.lastRun.linkedIssue?.title ? (
                        <div className="mt-0.5 text-[10px] text-muted-foreground/80 truncate max-w-[200px]" title={routine.lastRun.linkedIssue.title}>
                          {routine.lastRun.linkedIssue.title.slice(0, 60)}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground text-xs">
                  {(() => {
                    const nextTrigger = routine.triggers?.find((t) => t.enabled && t.nextRunAt);
                    if (!nextTrigger?.nextRunAt) return <span>-</span>;
                    const d = new Date(nextTrigger.nextRunAt);
                    return (
                      <div>
                        <div>{d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                        <div className="text-muted-foreground/70">{d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
                      </div>
                    );
                  })()}
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      data-slot="toggle"
                      aria-checked={enabled}
                      aria-label={enabled ? `Disable ${routine.title}` : `Enable ${routine.title}`}
                      disabled={isStatusPending || isArchived}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        enabled ? "bg-foreground" : "bg-muted"
                      } ${isStatusPending || isArchived ? "cursor-not-allowed opacity-50" : ""}`}
                      onClick={() =>
                        onUpdateStatus(
                          routine.id,
                          nextRoutineStatus(routine.status, !enabled),
                        )
                      }
                    >
                      <span
                        className={`inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${
                          enabled ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {isArchived ? "Archived" : enabled ? "On" : "Off"}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${routine.title}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onNavigate(`/routines/${routine.id}`)}>
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={runningRoutineId === routine.id || isArchived}
                        onClick={() => onRunRoutine(routine.id)}
                      >
                        {runningRoutineId === routine.id ? "Running..." : "Run now"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() =>
                          onUpdateStatus(
                            routine.id,
                            enabled ? "paused" : "active",
                          )
                        }
                        disabled={isStatusPending || isArchived}
                      >
                        {enabled ? "Pause" : "Enable"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          onUpdateStatus(
                            routine.id,
                            routine.status === "archived" ? "active" : "archived",
                          )
                        }
                        disabled={isStatusPending}
                      >
                        {routine.status === "archived" ? "Restore" : "Archive"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

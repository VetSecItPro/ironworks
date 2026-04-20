import { type AgentDetail, DEPARTMENT_LABELS, type HeartbeatRun } from "@ironworksai/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { Copy, CopyPlus, MoreHorizontal, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "@/lib/router";
import { getAgentRingClass, getRoleLevel } from "../../lib/role-icons";
import { cn } from "../../lib/utils";
import { PauseResumeButton, RunButton } from "../AgentActionButtons";
import { AgentIcon, AgentIconPicker } from "../AgentIconPicker";
import { roleLabels } from "../agent-config-primitives";
import { EmploymentBadge } from "../EmploymentBadge";
import { StatusBadge } from "../StatusBadge";

interface AgentDetailHeaderProps {
  agent: AgentDetail;
  canonicalAgentRef: string;
  mobileLiveRun: HeartbeatRun | null;
  isPendingApproval: boolean;
  // Mutations
  agentAction: UseMutationResult<unknown, Error, "invoke" | "pause" | "resume" | "terminate">;
  cloneAgent: UseMutationResult<unknown, Error, void>;
  resetTaskSession: UseMutationResult<unknown, Error, string | null>;
  updateIcon: UseMutationResult<unknown, Error, string>;
  // Dialog
  onNewIssue: (opts: { assigneeAgentId: string }) => void;
  // Assigned issues for terminate warning
  assignedIssues: Array<{ status: string }>;
}

export function AgentDetailHeader({
  agent,
  canonicalAgentRef,
  mobileLiveRun,
  isPendingApproval,
  agentAction,
  cloneAgent,
  resetTaskSession,
  updateIcon,
  onNewIssue,
  assignedIssues,
}: AgentDetailHeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-3 min-w-0">
        <AgentIconPicker value={agent.icon} onChange={(icon) => updateIcon.mutate(icon)}>
          <button
            type="button"
            className={cn(
              "shrink-0 flex items-center justify-center h-12 w-12 rounded-lg transition-colors",
              getRoleLevel(agent.role) === "executive"
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : getRoleLevel(agent.role) === "management"
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : "bg-accent text-muted-foreground",
              getAgentRingClass(
                agent.role,
                (agent as unknown as Record<string, unknown>).employmentType as string | undefined,
              ),
              "hover:opacity-80",
            )}
          >
            <AgentIcon icon={agent.icon} className="h-8 w-8" />
          </button>
        </AgentIconPicker>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold truncate">{agent.name}</h2>
            <EmploymentBadge
              type={((agent as unknown as Record<string, unknown>).employmentType as string) ?? "full_time"}
            />
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {roleLabels[agent.role] ?? agent.role}
            {agent.title ? ` - ${agent.title}` : ""}
            {(agent as unknown as Record<string, unknown>).department
              ? ` · ${(DEPARTMENT_LABELS as Record<string, string>)[(agent as unknown as Record<string, unknown>).department as string] ?? (agent as unknown as Record<string, unknown>).department}`
              : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={() => onNewIssue({ assigneeAgentId: agent.id })}>
          <Plus className="h-3.5 w-3.5 sm:mr-1" />
          <span className="hidden sm:inline">Assign Task</span>
        </Button>
        <RunButton
          onClick={() => agentAction.mutate("invoke")}
          disabled={agentAction.isPending || isPendingApproval}
          label="Run Heartbeat"
        />
        <PauseResumeButton
          isPaused={agent.status === "paused"}
          onPause={() => agentAction.mutate("pause")}
          onResume={() => agentAction.mutate("resume")}
          disabled={agentAction.isPending || isPendingApproval}
        />
        <span className="hidden sm:inline">
          <StatusBadge status={agent.status} />
        </span>
        {mobileLiveRun && (
          <Link
            to={`/agents/${canonicalAgentRef}/runs/${mobileLiveRun.id}`}
            className="sm:hidden flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 hover:bg-blue-500/20 transition-colors no-underline"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">Live</span>
          </Link>
        )}

        {/* Overflow menu */}
        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-xs">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1" align="end">
            <button
              type="button"
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50"
              onClick={() => {
                navigator.clipboard.writeText(agent.id);
                setMoreOpen(false);
              }}
            >
              <Copy className="h-3 w-3" />
              Copy Agent ID
            </button>
            <button
              type="button"
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50"
              onClick={() => {
                resetTaskSession.mutate(null);
                setMoreOpen(false);
              }}
            >
              <RotateCcw className="h-3 w-3" />
              Reset Sessions
            </button>
            <button
              type="button"
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50"
              onClick={() => {
                cloneAgent.mutate();
                setMoreOpen(false);
              }}
              disabled={cloneAgent.isPending}
            >
              <CopyPlus className="h-3 w-3" />
              {cloneAgent.isPending ? "Cloning..." : "Clone Agent"}
            </button>
            <button
              type="button"
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-destructive"
              onClick={() => {
                const openIssueCount = assignedIssues.filter(
                  (i) => i.status !== "done" && i.status !== "cancelled",
                ).length;
                const successionWarning =
                  openIssueCount > 0 ? `\n\nWARNING: ${openIssueCount} open issue(s) will be unassigned.` : "";
                const reason = prompt(
                  `Exit Interview: ${agent.name}\n\nPlease provide a reason for termination:${successionWarning}`,
                  "",
                );
                if (reason !== null) {
                  try {
                    const exitInterviews = JSON.parse(localStorage.getItem("ironworks:exit-interviews") ?? "{}");
                    exitInterviews[agent.id] = {
                      agentName: agent.name,
                      reason: reason || "No reason provided",
                      date: new Date().toISOString(),
                      openIssueCount,
                    };
                    localStorage.setItem("ironworks:exit-interviews", JSON.stringify(exitInterviews));
                  } catch {
                    /* ignore */
                  }
                  agentAction.mutate("terminate");
                  setMoreOpen(false);
                }
              }}
            >
              <Trash2 className="h-3 w-3" />
              Terminate
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

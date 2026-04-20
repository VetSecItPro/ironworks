import { AGENT_ROLE_LABELS, type Agent, DEPARTMENT_LABELS } from "@ironworksai/shared";
import { Link } from "@/lib/router";
import { getAgentRingClass, getRoleLevel } from "../../lib/role-icons";
import { agentStatusDot, agentStatusDotDefault } from "../../lib/status-colors";
import { agentRouteRef, agentUrl, cn, formatCents } from "../../lib/utils";
import { AgentIcon } from "../AgentIconPicker";
import { EmploymentBadge } from "../EmploymentBadge";
import { StatusBadge } from "../StatusBadge";
import { LiveRunIndicator } from "./AgentListView";

const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

export function AgentGridView({
  agents,
  liveRunByAgent,
}: {
  agents: Agent[];
  liveRunByAgent: Map<string, { runId: string; liveCount: number }>;
}) {
  if (agents.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {agents.map((agent) => {
        const isTerminated = agent.status === "terminated";
        const empType = ((agent as unknown as Record<string, unknown>).employmentType as string) ?? "full_time";
        const dept = (agent as unknown as Record<string, unknown>).department as string | undefined;
        const dotColor = agentStatusDot[agent.status] ?? agentStatusDotDefault;

        return (
          <Link
            key={agent.id}
            to={agentUrl(agent)}
            className={cn(
              "flex flex-col gap-3 rounded-lg border border-border p-4 no-underline text-inherit transition-all duration-150 hover:bg-accent/30 hover:border-border/80 hover:shadow-sm",
              isTerminated && "opacity-50",
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex items-center justify-center h-9 w-9 rounded-lg",
                    getRoleLevel(agent.role) === "executive"
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : getRoleLevel(agent.role) === "management"
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "bg-muted text-muted-foreground",
                    getAgentRingClass(agent.role, empType),
                  )}
                >
                  <AgentIcon icon={agent.icon} className="h-4.5 w-4.5" />
                </span>
                <span className="relative flex h-2.5 w-2.5">
                  {(agent.status === "active" || agent.status === "running") && (
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-40 ${dotColor}`}
                    />
                  )}
                  <span className={`absolute inline-flex h-full w-full rounded-full ${dotColor}`} />
                </span>
              </div>
              {liveRunByAgent.has(agent.id) && (
                <LiveRunIndicator
                  agentRef={agentRouteRef(agent)}
                  runId={liveRunByAgent.get(agent.id)!.runId}
                  liveCount={liveRunByAgent.get(agent.id)!.liveCount}
                />
              )}
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-sm font-semibold truncate">{agent.name}</span>
              <span className="text-xs text-muted-foreground truncate">
                {roleLabels[agent.role] ?? agent.role}
                {agent.title ? ` - ${agent.title}` : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dept && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                  {(DEPARTMENT_LABELS as Record<string, string>)[dept] ?? dept}
                </span>
              )}
              <EmploymentBadge type={empType} />
            </div>
            {agent.spentMonthlyCents > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/50 pt-2 mt-auto">
                <span>Cost to date</span>
                <span className="tabular-nums font-medium text-foreground">{formatCents(agent.spentMonthlyCents)}</span>
              </div>
            )}
            <StatusBadge status={agent.status} />
          </Link>
        );
      })}
    </div>
  );
}

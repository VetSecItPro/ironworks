import { Link } from "@/lib/router";
import { AGENT_ROLE_LABELS, type Agent } from "@ironworksai/shared";
import { Play } from "lucide-react";
import { StatusBadge } from "../StatusBadge";
import { EmploymentBadge } from "../EmploymentBadge";
import { AgentIcon } from "../AgentIconPicker";
import { EntityRow } from "../EntityRow";
import { agentStatusDot, agentStatusDotDefault } from "../../lib/status-colors";
import { relativeTime, cn, agentRouteRef, agentUrl } from "../../lib/utils";
import { getRoleLevel, getAgentRingClass } from "../../lib/role-icons";

const adapterLabels: Record<string, string> = {
  claude_local: "Claude",
  codex_local: "Codex",
  gemini_local: "Gemini",
  opencode_local: "OpenCode",
  cursor: "Cursor",
  openclaw_gateway: "OpenClaw Gateway",
  process: "Process",
  http: "HTTP",
};

const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

export function LiveRunIndicator({
  agentRef,
  runId,
  liveCount,
}: {
  agentRef: string;
  runId: string;
  liveCount: number;
}) {
  return (
    <Link
      to={`/agents/${agentRef}/runs/${runId}`}
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 hover:bg-blue-500/20 transition-colors no-underline"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
      </span>
      <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
        Live{liveCount > 1 ? ` (${liveCount})` : ""}
      </span>
    </Link>
  );
}

export function AgentListView({
  agents,
  liveRunByAgent,
  compareIds,
  toggleCompare,
  onInvoke,
}: {
  agents: Agent[];
  liveRunByAgent: Map<string, { runId: string; liveCount: number }>;
  compareIds: Set<string>;
  toggleCompare: (id: string) => void;
  onInvoke: (agentId: string) => void;
}) {
  if (agents.length === 0) return null;

  return (
    <div className="border border-border">
      {agents.map((agent) => {
        const isTerminated = agent.status === "terminated";
        return (
          <div key={agent.id} className={cn("group/row relative", isTerminated && "opacity-50")}>
          <EntityRow
            title={agent.name}
            subtitle={`${roleLabels[agent.role] ?? agent.role}${agent.title ? ` - ${agent.title}` : ""}`}
            to={agentUrl(agent)}
            leading={
              <span className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleCompare(agent.id); }}
                  className={cn(
                    "flex items-center justify-center h-4 w-4 border rounded-sm text-[10px] shrink-0 transition-colors",
                    compareIds.has(agent.id)
                      ? "bg-foreground border-foreground text-background"
                      : "border-border opacity-0 group-hover/row:opacity-100",
                  )}
                  title="Add to comparison"
                >
                  {compareIds.has(agent.id) && <span>&#10003;</span>}
                </button>
                <span
                  className={cn(
                    "flex items-center justify-center h-6 w-6 rounded-md",
                    getRoleLevel(agent.role) === "executive"
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : getRoleLevel(agent.role) === "management"
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "bg-muted text-muted-foreground",
                    getAgentRingClass(agent.role, (agent as unknown as Record<string, unknown>).employmentType as string | undefined),
                  )}
                >
                  <AgentIcon icon={agent.icon} className="h-3.5 w-3.5" />
                </span>
                <span className="relative flex h-2.5 w-2.5">
                  <span
                    className={`absolute inline-flex h-full w-full rounded-full ${agentStatusDot[agent.status] ?? agentStatusDotDefault}`}
                  />
                </span>
              </span>
            }
            trailing={
              <div className="flex items-center gap-3">
                {/* Quick-invoke button on hover */}
                {!isTerminated && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onInvoke(agent.id); }}
                    className="hidden group-hover/row:flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
                    title="Trigger heartbeat run"
                  >
                    <Play className="h-3 w-3" />
                    Run
                  </button>
                )}
                <span className="sm:hidden">
                  {liveRunByAgent.has(agent.id) ? (
                    <LiveRunIndicator
                      agentRef={agentRouteRef(agent)}
                      runId={liveRunByAgent.get(agent.id)!.runId}
                      liveCount={liveRunByAgent.get(agent.id)!.liveCount}
                    />
                  ) : (
                    <StatusBadge status={agent.status} />
                  )}
                </span>
                <div className="hidden sm:flex items-center gap-3">
                  {liveRunByAgent.has(agent.id) && (
                    <LiveRunIndicator
                      agentRef={agentRouteRef(agent)}
                      runId={liveRunByAgent.get(agent.id)!.runId}
                      liveCount={liveRunByAgent.get(agent.id)!.liveCount}
                    />
                  )}
                  <EmploymentBadge type={(agent as unknown as Record<string, unknown>).employmentType as string ?? "full_time"} />
                  <span className="text-xs text-muted-foreground font-mono w-14 text-right">
                    {adapterLabels[agent.adapterType] ?? agent.adapterType}
                  </span>
                  <span className="text-xs text-muted-foreground w-16 text-right">
                    {agent.lastHeartbeatAt ? relativeTime(agent.lastHeartbeatAt) : "Never"}
                  </span>
                  <span className="w-20 flex justify-end">
                    <StatusBadge status={agent.status} />
                  </span>
                  {isTerminated && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                      Terminated
                    </span>
                  )}
                </div>
              </div>
            }
          />
          </div>
        );
      })}
    </div>
  );
}

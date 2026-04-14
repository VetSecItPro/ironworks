import { Link } from "@/lib/router";
import { AGENT_ROLE_LABELS, type Agent } from "@ironworksai/shared";
import type { OrgNode } from "../../api/agents";
import { StatusBadge } from "../StatusBadge";
import { EmploymentBadge } from "../EmploymentBadge";
import { AgentIcon } from "../AgentIconPicker";
import { agentStatusDot, agentStatusDotDefault } from "../../lib/status-colors";
import { relativeTime, cn, agentRouteRef, agentUrl } from "../../lib/utils";
import { getRoleLevel, getAgentRingClass } from "../../lib/role-icons";
import { LiveRunIndicator } from "./AgentListView";

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

export function AgentOrgTreeNode({
  node,
  depth,
  agentMap,
  liveRunByAgent,
}: {
  node: OrgNode;
  depth: number;
  agentMap: Map<string, Agent>;
  liveRunByAgent: Map<string, { runId: string; liveCount: number }>;
}) {
  const agent = agentMap.get(node.id);

  const statusColor = agentStatusDot[node.status] ?? agentStatusDotDefault;
  const isTerminated = node.status === "terminated";

  return (
    <div style={{ paddingLeft: depth * 24 }} className={cn(isTerminated && "opacity-50")}>
      <Link
        to={agent ? agentUrl(agent) : `/agents/${node.id}`}
        className="flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors w-full text-left no-underline text-inherit"
      >
        <span className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              "flex items-center justify-center h-6 w-6 rounded-md",
              getRoleLevel(node.role) === "executive"
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : getRoleLevel(node.role) === "management"
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : "bg-muted text-muted-foreground",
              getAgentRingClass(node.role, (agent as unknown as Record<string, unknown> | undefined)?.employmentType as string | undefined),
            )}
          >
            <AgentIcon icon={agent?.icon} className="h-3.5 w-3.5" />
          </span>
          <span className="relative flex h-2.5 w-2.5">
            <span className={`absolute inline-flex h-full w-full rounded-full ${statusColor}`} />
          </span>
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">{node.name}</span>
          <span className="text-xs text-muted-foreground ml-2">
            {roleLabels[node.role] ?? node.role}
            {agent?.title ? ` - ${agent.title}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="sm:hidden">
            {liveRunByAgent.has(node.id) ? (
              <LiveRunIndicator
                agentRef={agent ? agentRouteRef(agent) : node.id}
                runId={liveRunByAgent.get(node.id)!.runId}
                liveCount={liveRunByAgent.get(node.id)!.liveCount}
              />
            ) : (
              <StatusBadge status={node.status} />
            )}
          </span>
          <div className="hidden sm:flex items-center gap-3">
            {liveRunByAgent.has(node.id) && (
              <LiveRunIndicator
                agentRef={agent ? agentRouteRef(agent) : node.id}
                runId={liveRunByAgent.get(node.id)!.runId}
                liveCount={liveRunByAgent.get(node.id)!.liveCount}
              />
            )}
            {agent && (
              <>
                <EmploymentBadge type={(agent as unknown as Record<string, unknown>).employmentType as string ?? "full_time"} />
                <span className="text-xs text-muted-foreground font-mono w-14 text-right">
                  {adapterLabels[agent.adapterType] ?? agent.adapterType}
                </span>
                <span className="text-xs text-muted-foreground w-16 text-right">
                  {agent.lastHeartbeatAt ? relativeTime(agent.lastHeartbeatAt) : "-"}
                </span>
              </>
            )}
            <span className="w-20 flex justify-end">
              <StatusBadge status={node.status} />
            </span>
            {isTerminated && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                Terminated
              </span>
            )}
          </div>
        </div>
      </Link>
      {node.reports && node.reports.length > 0 && (
        <div className="border-l border-border/50 ml-4">
          {node.reports.map((child) => (
            <AgentOrgTreeNode key={child.id} node={child} depth={depth + 1} agentMap={agentMap} liveRunByAgent={liveRunByAgent} />
          ))}
        </div>
      )}
    </div>
  );
}

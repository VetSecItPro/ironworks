import {
  AGENT_LIFECYCLE_LABELS,
  AGENT_LIFECYCLE_STAGES,
  AGENT_ROLE_LABELS,
  type Agent,
  type AgentLifecycleStage,
} from "@ironworksai/shared";
import { Link } from "@/lib/router";
import { agentUrl, cn } from "../../lib/utils";
import { AgentIcon } from "../AgentIconPicker";

const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

export function AgentPipelineView({
  agents,
  deriveLifecycleStage,
}: {
  agents: Agent[];
  deriveLifecycleStage: (agent: Agent) => AgentLifecycleStage;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {AGENT_LIFECYCLE_STAGES.map((stage) => {
        const stageAgents = agents.filter((a) => deriveLifecycleStage(a) === stage);
        return (
          <div key={stage} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {AGENT_LIFECYCLE_LABELS[stage]}
              </h3>
              <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                {stageAgents.length}
              </span>
            </div>
            <div className="space-y-2">
              {stageAgents.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-md">
                  No agents
                </p>
              ) : (
                stageAgents.map((agent) => (
                  <Link
                    key={agent.id}
                    to={agentUrl(agent)}
                    className={cn(
                      "block rounded-md border border-border p-3 hover:bg-accent/30 transition-colors no-underline text-inherit space-y-2",
                      agent.status === "terminated" && "opacity-50",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <AgentIcon icon={agent.icon} className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-medium truncate">{agent.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{roleLabels[agent.role] ?? agent.role}</div>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        stage === "production"
                          ? "bg-green-500/15 text-green-600 dark:text-green-400"
                          : stage === "pilot"
                            ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                            : stage === "draft"
                              ? "bg-muted text-muted-foreground"
                              : "bg-muted/50 text-muted-foreground line-through",
                      )}
                    >
                      {AGENT_LIFECYCLE_LABELS[stage]}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

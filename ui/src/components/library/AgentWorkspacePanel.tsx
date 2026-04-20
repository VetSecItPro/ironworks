import { useQueries } from "@tanstack/react-query";
import { Bot, Users } from "lucide-react";
import type { AgentSlim } from "../../api/agents";
import { knowledgeApi } from "../../api/knowledge";
import { queryKeys } from "../../lib/queryKeys";
import { cn } from "../../lib/utils";

interface AgentWorkspacePanelProps {
  companyId: string;
  agents: AgentSlim[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
}

export function AgentWorkspacePanel({ companyId, agents, selectedAgentId, onSelectAgent }: AgentWorkspacePanelProps) {
  const pageCounts = useQueries({
    queries: agents.map((agent) => ({
      queryKey: queryKeys.knowledge.byAgent(companyId, agent.id),
      queryFn: () => knowledgeApi.listByAgent(companyId, agent.id),
      enabled: !!companyId,
    })),
  });

  if (agents.length === 0) return null;

  return (
    <div className="border-b border-border">
      <div className="px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        Agent Workspaces
      </div>
      <div className="pb-1">
        <button
          type="button"
          onClick={() => onSelectAgent(null)}
          className={cn(
            "flex items-center gap-2 w-full text-left px-3 py-1.5 text-[13px] hover:bg-accent/50 transition-colors",
            selectedAgentId === null && "bg-accent text-accent-foreground font-medium",
          )}
        >
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate flex-1">All documents</span>
        </button>

        {agents.map((agent, i) => {
          const result = pageCounts[i];
          const pages = result?.data ?? [];
          const docCount = pages.filter((p) => p.documentType !== "folder").length;

          return (
            <button
              type="button"
              key={agent.id}
              onClick={() => onSelectAgent(agent.id)}
              className={cn(
                "flex items-center gap-2 w-full text-left px-3 py-1.5 text-[13px] hover:bg-accent/50 transition-colors",
                selectedAgentId === agent.id && "bg-accent text-accent-foreground font-medium",
              )}
            >
              <Bot className="h-4 w-4 shrink-0 text-blue-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate">{agent.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{agent.role}</div>
              </div>
              {docCount > 0 && <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">{docCount}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

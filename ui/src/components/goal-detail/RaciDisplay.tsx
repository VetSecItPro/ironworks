import type { Goal, Agent } from "@ironworksai/shared";

export function RaciDisplay({
  goal,
  agentMap,
  parentGoal,
}: {
  goal: Goal;
  agentMap: Map<string, Agent>;
  parentGoal?: Goal | null;
}) {
  const responsible = goal.ownerAgentId ? agentMap.get(goal.ownerAgentId) : null;
  const accountableAgentId = parentGoal?.ownerAgentId ?? null;
  const accountable = accountableAgentId ? agentMap.get(accountableAgentId) : null;

  if (!responsible && !accountable) return null;

  return (
    <div className="flex items-center gap-3">
      {responsible && (
        <div className="flex items-center gap-1.5" title={`Responsible: ${responsible.name}`}>
          <div className="h-6 w-6 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-[10px] font-bold text-blue-600 dark:text-blue-400">
            R
          </div>
          <span className="text-xs text-muted-foreground truncate max-w-[100px]">{responsible.name}</span>
        </div>
      )}
      {accountable && (
        <div className="flex items-center gap-1.5" title={`Accountable: ${accountable.name}`}>
          <div className="h-6 w-6 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[10px] font-bold text-amber-600 dark:text-amber-400">
            A
          </div>
          <span className="text-xs text-muted-foreground truncate max-w-[100px]">{accountable.name}</span>
        </div>
      )}
      {!accountable && !parentGoal && (
        <div className="flex items-center gap-1.5" title="Accountable: Company leadership (top-level goal)">
          <div className="h-6 w-6 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[10px] font-bold text-amber-600 dark:text-amber-400">
            A
          </div>
          <span className="text-xs text-muted-foreground">Leadership</span>
        </div>
      )}
    </div>
  );
}

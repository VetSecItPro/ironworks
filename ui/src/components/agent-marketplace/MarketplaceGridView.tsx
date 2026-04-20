import { AGENT_ROLE_LABELS } from "@ironworksai/shared";
import { Bot, Download, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MarketplaceAgent } from "./marketplaceTypes";
import { CATEGORY_ICONS } from "./marketplaceTypes";

interface MarketplaceGridViewProps {
  agents: MarketplaceAgent[];
  onInstall: (agent: MarketplaceAgent) => void;
}

export function MarketplaceGridView({ agents, onInstall }: MarketplaceGridViewProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {agents.map((agent) => {
        const CategoryIcon = CATEGORY_ICONS[agent.category] ?? Bot;
        return (
          <div
            key={agent.id}
            className="rounded-lg border border-border bg-card p-4 flex flex-col hover:border-primary/30 transition-colors"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <CategoryIcon className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-semibold truncate">{agent.title}</h3>
                  {agent.popular && <Star className="h-3 w-3 text-amber-500 shrink-0 fill-amber-500" />}
                </div>
                <span className="text-[10px] font-medium text-muted-foreground uppercase">
                  {(AGENT_ROLE_LABELS as Record<string, string>)[agent.role] ?? agent.role}
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground flex-1 mb-3 line-clamp-3">{agent.description}</p>

            <div className="flex flex-wrap gap-1 mb-3">
              {agent.skills.slice(0, 4).map((skill) => (
                <span key={skill} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground">
                  {skill}
                </span>
              ))}
              {agent.skills.length > 4 && (
                <span className="text-[10px] px-1.5 py-0.5 text-muted-foreground">+{agent.skills.length - 4}</span>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-[10px] text-muted-foreground font-mono">
                {agent.recommendedModel.replace("claude-", "").replace("-20250514", "")}
              </span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onInstall(agent)}>
                <Download className="h-3 w-3 mr-1" />
                Install
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

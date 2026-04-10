import { Bot, Download, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AGENT_ROLE_LABELS } from "@ironworksai/shared";
import { CATEGORY_ICONS } from "./marketplaceTypes";
import type { MarketplaceAgent } from "./marketplaceTypes";

interface MarketplaceListViewProps {
  agents: MarketplaceAgent[];
  onInstall: (agent: MarketplaceAgent) => void;
}

export function MarketplaceListView({ agents, onInstall }: MarketplaceListViewProps) {
  return (
    <div className="border border-border rounded-lg divide-y divide-border">
      {agents.map((agent) => {
        const CategoryIcon = CATEGORY_ICONS[agent.category] ?? Bot;
        return (
          <div
            key={agent.id}
            className="flex items-center gap-4 px-4 py-3 hover:bg-accent/20 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <CategoryIcon className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{agent.title}</span>
                {agent.popular && (
                  <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                )}
                <span className="text-[10px] text-muted-foreground uppercase">
                  {(AGENT_ROLE_LABELS as Record<string, string>)[agent.role] ?? agent.role}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{agent.description}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:flex gap-1">
                {agent.skills.slice(0, 3).map((s) => (
                  <span
                    key={s}
                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground"
                  >
                    {s}
                  </span>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onInstall(agent)}
              >
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

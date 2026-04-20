import type { ActivityEvent, Agent } from "@ironworksai/shared";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { AggregatedGroup } from "../../types/dashboard";
import { ActivityRow } from "../ActivityRow";
import { ACTION_LABELS, isAggregated } from "./activityHelpers";

interface ActivityTimelineProps {
  groupedItems: Map<string, (ActivityEvent | AggregatedGroup)[]>;
  agentMap: Map<string, Agent>;
  entityNameMap: Map<string, string>;
  entityTitleMap: Map<string, string>;
}

export function ActivityTimeline({ groupedItems, agentMap, entityNameMap, entityTitleMap }: ActivityTimelineProps) {
  const [expandedAgg, setExpandedAgg] = useState<Set<string>>(new Set());

  return (
    <div className="space-y-6">
      {[...groupedItems.entries()].map(([timeGroup, items]) => (
        <div key={timeGroup}>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
            {timeGroup}
          </div>

          <div className="border border-border rounded-lg overflow-hidden relative">
            <div className="absolute left-5 top-0 bottom-0 w-px bg-border/50 hidden sm:block" />

            {items.map((item) =>
              isAggregated(item) ? (
                <div key={item.key} className="relative">
                  <div className="absolute left-[17px] top-4 h-2 w-2 rounded-full bg-muted-foreground/40 border-2 border-background z-10 hidden sm:block" />
                  <button type="button"
                    onClick={() => {
                      setExpandedAgg((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.key)) next.delete(item.key);
                        else next.add(item.key);
                        return next;
                      });
                    }}
                    className="w-full px-4 py-2.5 text-sm flex items-center justify-between hover:bg-accent/30 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {expandedAgg.has(item.key) ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-muted text-[10px] font-bold text-muted-foreground shrink-0">
                        {item.count}
                      </span>
                      <span>
                        <span className="font-medium">{item.actorName}</span>
                        <span className="text-muted-foreground ml-1">
                          logged {item.count} {ACTION_LABELS[item.action] ?? item.action.replace(/[._]/g, " ")}
                        </span>
                        {item.models.length > 0 && (
                          <span className="text-muted-foreground ml-1">
                            - {item.models.slice(0, 3).join(", ")}
                            {item.models.length > 3 ? ` +${item.models.length - 3} more` : ""}
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {(() => {
                        const d = new Date(item.latestEvent.createdAt);
                        return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                      })()}
                    </span>
                  </button>
                  {expandedAgg.has(item.key) && (
                    <div className="border-t border-border/50 bg-muted/10">
                      {item.events.map((event) => (
                        <ActivityRow
                          key={event.id}
                          event={event}
                          agentMap={agentMap}
                          entityNameMap={entityNameMap}
                          entityTitleMap={entityTitleMap}
                          className="pl-12"
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div key={item.id} className="relative">
                  <div className="absolute left-[17px] top-4 h-2 w-2 rounded-full bg-blue-500/60 border-2 border-background z-10 hidden sm:block" />
                  <ActivityRow
                    event={item}
                    agentMap={agentMap}
                    entityNameMap={entityNameMap}
                    entityTitleMap={entityTitleMap}
                    className="sm:pl-10 border-b border-border last:border-b-0"
                  />
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

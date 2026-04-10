import { useState } from "react";
import { Link } from "@/lib/router";
import { ChevronDown, ChevronRight, Radio } from "lucide-react";
import { cn } from "../../lib/utils";
import { ActivityRow } from "../ActivityRow";
import type { Agent } from "@ironworksai/shared";
import { isAggregated, ACTION_LABELS, type AggregatedGroup } from "./activityAggregation";
import type { ActivityEvent } from "@ironworksai/shared";

export function ActivitySection({
  aggregatedActivity,
  agentMap,
  entityNameMap,
  entityTitleMap,
  animatedActivityIds,
  liveMode,
  liveConnected,
  onToggleLiveMode,
}: {
  aggregatedActivity: (ActivityEvent | AggregatedGroup)[];
  agentMap: Map<string, Agent>;
  entityNameMap: Map<string, string>;
  entityTitleMap: Map<string, string>;
  animatedActivityIds: Set<string>;
  liveMode: boolean;
  liveConnected: boolean;
  onToggleLiveMode: () => void;
}) {
  const [expandedAgg, setExpandedAgg] = useState<Set<string>>(new Set());

  if (aggregatedActivity.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-4">
        <div className="flex items-center gap-3">
          <Link to="/activity" className="text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors no-underline">
            Recent Activity
          </Link>
          <button
            onClick={onToggleLiveMode}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              liveMode
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/20",
            )}
            aria-pressed={liveMode}
            title={liveMode ? "Disable live feed" : "Enable live feed"}
          >
            {liveMode && liveConnected ? (
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
            ) : (
              <Radio className="h-3 w-3 shrink-0" aria-hidden="true" />
            )}
            Live
          </button>
        </div>
        <Link to="/activity" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          View all activity
        </Link>
      </div>
      <div className="border border-border rounded-lg divide-y divide-border/50 overflow-hidden">
        {aggregatedActivity.map((item) =>
          isAggregated(item) ? (
            <div key={item.key}>
              <button
                onClick={() => setExpandedAgg((prev) => {
                  const next = new Set(prev);
                  if (next.has(item.key)) next.delete(item.key); else next.add(item.key);
                  return next;
                })}
                className={cn(
                  "w-full px-4 py-3 text-sm flex items-center justify-between hover:bg-accent/30 transition-all text-left",
                  expandedAgg.has(item.key) && "bg-accent/10",
                )}
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
                      </span>
                    )}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground/80 shrink-0 ml-2 tabular-nums font-mono min-w-[60px] text-right">
                  {new Date(item.latestEvent.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
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
            <ActivityRow
              key={item.id}
              event={item}
              agentMap={agentMap}
              entityNameMap={entityNameMap}
              entityTitleMap={entityTitleMap}
              className={animatedActivityIds.has(item.id) ? "activity-row-enter" : undefined}
            />
          ),
        )}
      </div>
    </div>
  );
}

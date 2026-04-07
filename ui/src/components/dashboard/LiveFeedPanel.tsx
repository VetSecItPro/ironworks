import { cn } from "../../lib/utils";
import type { Agent, LiveEvent } from "@ironworksai/shared";

export interface LiveFeedEvent {
  id: string;
  sseType: string;
  receivedAt: Date;
  event: LiveEvent;
}

function liveFeedEventColor(sseType: string, payload: Record<string, unknown>): string {
  if (sseType === "agent_run") {
    const status = payload.status as string | undefined;
    if (status === "completed" || status === "done") return "text-emerald-400";
    if (status === "failed" || status === "error") return "text-red-400";
    return "text-blue-400";
  }
  if (sseType === "activity") {
    const action = payload.action as string | undefined;
    if (action?.includes("completed") || action?.includes("done")) return "text-emerald-400";
    if (action?.includes("fail") || action?.includes("error") || action?.includes("blocked")) return "text-red-400";
  }
  return "text-muted-foreground";
}

function liveFeedDescription(
  sseType: string,
  event: LiveEvent,
  agentMap: Map<string, Agent>,
): string {
  const payload = event.payload;
  if (sseType === "activity") {
    const action = (payload.action as string | undefined) ?? event.type;
    const agentId = payload.agentId as string | undefined;
    const entityType = (payload.entityType as string | undefined) ?? "";
    const entityId = (payload.entityId as string | undefined) ?? "";
    const actorName = agentId
      ? (agentMap.get(agentId)?.name ?? agentId.slice(0, 8))
      : (payload.actorId as string | undefined) ?? "System";
    const label = action.replace(/[._]/g, " ");
    const entity = entityType ? `${entityType} ${entityId.slice(0, 8)}` : "";
    return entity ? `${actorName} - ${label} (${entity})` : `${actorName} - ${label}`;
  }
  if (sseType === "agent_run") {
    const status = (payload.status as string | undefined) ?? "";
    const agentId = payload.agentId as string | undefined;
    const agentName = agentId ? (agentMap.get(agentId)?.name ?? agentId.slice(0, 8)) : "Agent";
    return status ? `${agentName} run ${status}` : `${agentName} run updated`;
  }
  return event.type.replace(/[._]/g, " ");
}

function LiveFeedRow({
  entry,
  agentMap,
}: {
  entry: LiveFeedEvent;
  agentMap: Map<string, Agent>;
}) {
  const color = liveFeedEventColor(entry.sseType, entry.event.payload);
  const description = liveFeedDescription(entry.sseType, entry.event, agentMap);
  const timeStr = entry.receivedAt.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <div className="flex items-center gap-3 px-4 py-2 text-sm live-feed-row-enter hover:bg-accent/20 transition-colors">
      <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/70 font-mono w-[62px]">
        {timeStr}
      </span>
      <span className={cn("shrink-0 h-1.5 w-1.5 rounded-full", {
        "bg-emerald-500": color === "text-emerald-400",
        "bg-red-500": color === "text-red-400",
        "bg-blue-500": color === "text-blue-400",
        "bg-muted-foreground/50": color === "text-muted-foreground",
      })} />
      <span className={cn("truncate", color)}>{description}</span>
    </div>
  );
}

export function LiveFeedPanel({
  liveConnected,
  liveEvents,
  agentMap,
  liveFeedBottomRef,
  onClear,
}: {
  liveConnected: boolean;
  liveEvents: LiveFeedEvent[];
  agentMap: Map<string, Agent>;
  liveFeedBottomRef: React.RefObject<HTMLDivElement | null>;
  onClear: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Live Feed
          </h3>
          {liveConnected ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Connected
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">Connecting...</span>
          )}
        </div>
        {liveEvents.length > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        {liveEvents.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground text-center">
            Waiting for events...
          </div>
        ) : (
          <div className="divide-y divide-border max-h-80 overflow-y-auto">
            {liveEvents.map((entry) => (
              <LiveFeedRow
                key={entry.id}
                entry={entry}
                agentMap={agentMap}
              />
            ))}
            <div ref={liveFeedBottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}

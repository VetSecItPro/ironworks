import { useMemo } from "react";
import { Activity, Bot } from "lucide-react";
import type { LibraryContributor, LibraryFileEvent } from "../../api/library";
import { cn } from "../../lib/utils";
import { formatRelative } from "./libraryHelpers";

/* ── Event History ── */

export function EventHistory({ events }: { events: LibraryFileEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="border-t border-border">
      <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/20">
        History
      </div>
      <div className="divide-y divide-border">
        {events.slice(0, 10).map((event) => (
          <div
            key={event.id}
            className="px-4 py-2 text-xs flex items-center gap-2"
          >
            <span
              className={cn(
                "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                event.action === "created"
                  ? "bg-green-500/10 text-green-600"
                  : event.action === "modified"
                    ? "bg-blue-500/10 text-blue-600"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {event.action}
            </span>
            <span className="text-foreground font-medium">
              {event.agentName ?? event.userId ?? "Unknown"}
            </span>
            {event.changeSummary && (
              <span className="text-muted-foreground truncate flex-1">
                - {event.changeSummary}
              </span>
            )}
            <span className="text-muted-foreground shrink-0 ml-auto">
              {formatRelative(event.createdAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Usage Analytics Panel ── */

export function UsageAnalyticsPanel({
  events,
  contributors,
}: {
  events: LibraryFileEvent[];
  contributors: LibraryContributor[];
}) {
  const writesByAgent = useMemo(() => {
    const map = new Map<
      string,
      { name: string; writes: number; lastWrite: string }
    >();
    for (const e of events) {
      if (e.action === "created" || e.action === "modified") {
        const name = e.agentName ?? e.userId ?? "Unknown";
        const existing = map.get(name);
        if (existing) {
          existing.writes++;
          if (e.createdAt > existing.lastWrite) existing.lastWrite = e.createdAt;
        } else {
          map.set(name, { name, writes: 1, lastWrite: e.createdAt });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.writes - a.writes);
  }, [events]);

  return (
    <div className="border-t border-border">
      <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/20 flex items-center gap-1.5">
        <Activity className="h-3 w-3" />
        Usage Analytics
      </div>
      <div className="divide-y divide-border">
        {writesByAgent.length > 0 && (
          <div className="px-4 py-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              Write Activity
            </p>
            <div className="space-y-1">
              {writesByAgent.map((a) => (
                <div
                  key={a.name}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="font-medium text-foreground">{a.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {a.writes} write{a.writes !== 1 ? "s" : ""}
                    </span>
                    <span className="text-[10px] text-muted-foreground/80">
                      {formatRelative(a.lastWrite)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {contributors.length > 0 && (
          <div className="px-4 py-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              Contributors
            </p>
            <div className="flex flex-wrap gap-1">
              {contributors.map((c) => (
                <span
                  key={c.agentId ?? c.agentName}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-border bg-muted/30"
                >
                  <Bot className="h-2.5 w-2.5 text-blue-400" />
                  {c.agentName ?? c.agentId ?? "Unknown"}
                </span>
              ))}
            </div>
          </div>
        )}
        {writesByAgent.length === 0 && contributors.length === 0 && (
          <div className="px-4 py-3 text-xs text-muted-foreground text-center">
            No usage data available for this file.
          </div>
        )}
      </div>
    </div>
  );
}

import type { Agent } from "@ironworksai/shared";
import type { AggregatedGroup } from "../../types/dashboard";

export type { AggregatedGroup };

export const ACTION_LABELS: Record<string, string> = {
  "cost.reported": "cost events",
  "cost.recorded": "cost events",
  "issue.created": "issues",
  "issue.updated": "issue updates",
  "issue.comment_added": "comments",
  "agent.created": "agents",
  "project.created": "projects",
  "goal.created": "goals",
};

export function isActivityEventMeaningful(event: { action?: string }): boolean {
  const action = event.action ?? "";
  if (action.startsWith("cost.")) return false;
  return true;
}

export function aggregateActivityEvents(
  events: import("@ironworksai/shared").ActivityEvent[],
  agentMap: Map<string, Agent>,
): (import("@ironworksai/shared").ActivityEvent | AggregatedGroup)[] {
  const result: (import("@ironworksai/shared").ActivityEvent | AggregatedGroup)[] = [];
  let i = 0;
  while (i < events.length) {
    const event = events[i];
    let j = i + 1;
    const fiveMinutes = 5 * 60 * 1000;
    const eventTime = new Date(event.createdAt).getTime();
    while (j < events.length) {
      const next = events[j];
      if (
        next.action === event.action &&
        next.actorId === event.actorId &&
        Math.abs(eventTime - new Date(next.createdAt).getTime()) < fiveMinutes
      )
        j++;
      else break;
    }
    if (j - i >= 3) {
      const groupEvents = events.slice(i, j);
      const actor = event.actorType === "agent" ? agentMap.get(event.actorId) : null;
      const actorName = actor?.name ?? (event.actorType === "user" ? "Board" : event.actorId || "Unknown");
      const models = new Set<string>();
      for (const e of groupEvents) {
        const model = (e.details as Record<string, unknown> | null)?.model as string | undefined;
        if (model) models.add(model);
      }
      result.push({
        key: `agg-${event.id}`,
        action: event.action,
        actorName,
        count: j - i,
        models: [...models],
        latestEvent: event,
        events: groupEvents,
      });
      i = j;
    } else {
      result.push(event);
      i++;
    }
  }
  return result;
}

export function isAggregated(
  item: import("@ironworksai/shared").ActivityEvent | AggregatedGroup,
): item is AggregatedGroup {
  return "count" in item && "key" in item;
}

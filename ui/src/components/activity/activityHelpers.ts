import type { ActivityEvent, Agent } from "@ironworksai/shared";
import type { AggregatedGroup } from "../../types/dashboard";

export function getTimeGroup(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  if (date >= weekAgo) return "This Week";
  return "Older";
}

export function aggregateEvents(
  events: ActivityEvent[],
  agentMap: Map<string, Agent>,
): (ActivityEvent | AggregatedGroup)[] {
  const result: (ActivityEvent | AggregatedGroup)[] = [];
  let i = 0;

  while (i < events.length) {
    const event = events[i];
    let j = i + 1;
    const fiveMinutes = 5 * 60 * 1000;
    const eventTime = new Date(event.createdAt).getTime();

    while (j < events.length) {
      const next = events[j];
      const nextTime = new Date(next.createdAt).getTime();
      if (
        next.action === event.action &&
        next.actorId === event.actorId &&
        Math.abs(eventTime - nextTime) < fiveMinutes
      ) {
        j++;
      } else {
        break;
      }
    }

    const groupSize = j - i;
    if (groupSize >= 3) {
      const groupEvents = events.slice(i, j);
      const actor = event.actorType === "agent" ? agentMap.get(event.actorId) : null;
      const actorName = actor?.name ?? (event.actorType === "user" ? "Board" : event.actorId || "Unknown");
      const models = new Set<string>();
      for (const e of groupEvents) {
        const details = e.details as Record<string, unknown> | null;
        const model = details?.model as string | undefined;
        if (model) models.add(model);
      }

      result.push({
        key: `agg-${event.id}`,
        action: event.action,
        actorName,
        count: groupSize,
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

export function isAggregated(item: ActivityEvent | AggregatedGroup): item is AggregatedGroup {
  return "count" in item && "key" in item;
}

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

import { timeAgo } from "../../lib/timeAgo";
import type { ActivityEvent } from "@ironworksai/shared";

function formatActivityDetailValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length === 0 ? "[]" : value.map((item) => formatActivityDetailValue(item)).join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

export function ActivityTab({
  activity,
}: {
  activity: ActivityEvent[];
}) {
  if (activity.length === 0) {
    return <p className="text-xs text-muted-foreground">No activity yet.</p>;
  }

  return (
    <div className="border border-border rounded-lg divide-y divide-border">
      {activity.map((event) => (
        <div key={event.id} className="flex items-center justify-between px-3 py-2 text-xs gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-foreground/90 shrink-0">{event.action.replaceAll(".", " ")}</span>
            {event.details && Object.keys(event.details).length > 0 && (
              <span className="text-muted-foreground truncate">
                {Object.entries(event.details).slice(0, 3).map(([key, value], i) => (
                  <span key={key}>
                    {i > 0 && <span className="mx-1 text-border">·</span>}
                    <span className="text-muted-foreground/70">{key.replaceAll("_", " ")}:</span>{" "}
                    {formatActivityDetailValue(value)}
                  </span>
                ))}
              </span>
            )}
          </div>
          <span className="text-muted-foreground/80 shrink-0">{timeAgo(event.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

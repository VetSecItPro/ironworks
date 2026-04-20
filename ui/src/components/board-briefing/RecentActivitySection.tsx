import type { ActivityEvent, Agent } from "@ironworksai/shared";
import { History } from "lucide-react";
import { Link } from "../../lib/router";
import { ActivityRow } from "../ActivityRow";

interface RecentActivitySectionProps {
  recentActivity: ActivityEvent[];
  agentMap: Map<string, Agent>;
  entityNameMap: Map<string, string>;
  entityTitleMap: Map<string, string>;
}

export function RecentActivitySection({
  recentActivity,
  agentMap,
  entityNameMap,
  entityTitleMap,
}: RecentActivitySectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <History className="h-3.5 w-3.5" />
          Recent Activity
        </h3>
        <Link to="/activity" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          View all
        </Link>
      </div>
      <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
        {recentActivity.map((event) => (
          <ActivityRow
            key={event.id}
            event={event}
            agentMap={agentMap}
            entityNameMap={entityNameMap}
            entityTitleMap={entityTitleMap}
          />
        ))}
      </div>
    </div>
  );
}

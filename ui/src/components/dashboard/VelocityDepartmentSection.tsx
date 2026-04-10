import { Link } from "@/lib/router";
import type { VelocityWeek } from "../../api/velocity";
import { LastUpdatedBadge } from "./LastUpdatedBadge";
import { VelocityChart } from "./VelocityChart";
import { DepartmentMiniChart } from "./DepartmentMiniChart";

export function VelocityDepartmentSection({
  velocity,
  departmentBreakdown,
}: {
  velocity: VelocityWeek[] | undefined;
  departmentBreakdown: Array<{ name: string; count: number }>;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Velocity Chart */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team Velocity (12 weeks)</h4>
          <LastUpdatedBadge dataUpdatedAt={Date.now()} />
        </div>
        {!velocity || velocity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No velocity data yet.</p>
        ) : (
          <VelocityChart weeks={velocity} />
        )}
      </div>

      {/* Department Breakdown */}
      <div className="rounded-xl border border-border p-4 space-y-3">
        <Link to="/agents" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors no-underline">Agents by Department</Link>
        {departmentBreakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agents yet.</p>
        ) : (
          <DepartmentMiniChart departments={departmentBreakdown} />
        )}
      </div>
    </div>
  );
}

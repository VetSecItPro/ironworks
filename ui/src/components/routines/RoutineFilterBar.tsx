import { CalendarDays, Filter, LayoutList, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "../../lib/utils";

export type RoutineViewMode = "list" | "calendar";

export interface RoutineFilterBarProps {
  routineSearch: string;
  onSearchChange: (value: string) => void;
  statusFilter: "all" | "active" | "paused" | "draft" | "archived";
  onStatusFilterChange: (value: "all" | "active" | "paused" | "draft" | "archived") => void;
  agentFilter: string;
  onAgentFilterChange: (value: string) => void;
  agents: Array<{ id: string; name: string; status?: string }>;
  viewMode: RoutineViewMode;
  onViewModeChange: (mode: RoutineViewMode) => void;
}

export function RoutineFilterBar({
  routineSearch,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  agentFilter,
  onAgentFilterChange,
  agents,
  viewMode,
  onViewModeChange,
}: RoutineFilterBarProps) {
  const activeAgents = agents.filter((a) => a.status !== "terminated");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-48 sm:w-64">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={routineSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search routines..."
          className="pl-7 text-xs sm:text-sm"
        />
      </div>
      <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as typeof statusFilter)}>
        <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
          <Filter className="h-3 w-3 mr-1" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="paused">Paused</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
        </SelectContent>
      </Select>
      {activeAgents.length > 0 && (
        <Select value={agentFilter} onValueChange={onAgentFilterChange}>
          <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs">
            <SelectValue placeholder="All agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {activeAgents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {/* View mode toggle */}
      <div className="flex items-center rounded-md border border-border overflow-hidden ml-auto">
        <button type="button"
          className={cn(
            "flex items-center justify-center h-8 w-8 transition-colors",
            viewMode === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
          )}
          onClick={() => onViewModeChange("list")}
          title="List view"
        >
          <LayoutList className="h-3.5 w-3.5" />
        </button>
        <button type="button"
          className={cn(
            "flex items-center justify-center h-8 w-8 transition-colors",
            viewMode === "calendar" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
          )}
          onClick={() => onViewModeChange("calendar")}
          title="Calendar view"
        >
          <CalendarDays className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

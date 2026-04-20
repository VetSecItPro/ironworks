import { ArrowUpDown, CalendarRange, Filter, LayoutList, Network, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "../../lib/utils";

export type GoalSortField = "title" | "progress" | "updated";
export type GoalStatusFilter = "all" | "planned" | "active" | "achieved" | "cancelled";
export type ViewMode = "list" | "tree" | "timeline";

export interface GoalFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: GoalStatusFilter;
  onStatusFilterChange: (value: GoalStatusFilter) => void;
  sortField: GoalSortField;
  onSortFieldChange: (value: GoalSortField) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function GoalFilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortField,
  onSortFieldChange,
  viewMode,
  onViewModeChange,
}: GoalFilterBarProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="relative w-48 sm:w-64 md:w-80">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search goals..."
          className="pl-7 text-xs sm:text-sm"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as GoalStatusFilter)}>
          <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="planned">Planned</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="achieved">Achieved</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortField} onValueChange={(v) => onSortFieldChange(v as GoalSortField)}>
          <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
            <ArrowUpDown className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">Last updated</SelectItem>
            <SelectItem value="progress">Progress</SelectItem>
            <SelectItem value="title">Title</SelectItem>
          </SelectContent>
        </Select>
        {/* View mode toggle */}
        <div className="flex items-center rounded-md border border-border overflow-hidden">
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
              viewMode === "tree" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
            )}
            onClick={() => onViewModeChange("tree")}
            title="Tree view"
          >
            <Network className="h-3.5 w-3.5" />
          </button>
          <button type="button"
            className={cn(
              "flex items-center justify-center h-8 w-8 transition-colors",
              viewMode === "timeline" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
            )}
            onClick={() => onViewModeChange("timeline")}
            title="Timeline view"
          >
            <CalendarRange className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

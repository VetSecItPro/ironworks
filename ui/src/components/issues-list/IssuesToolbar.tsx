import { ArrowUpDown, Check, Columns3, Filter, Layers, List, Plus, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Identity } from "../Identity";
import { PriorityIcon } from "../PriorityIcon";
import { StatusIcon } from "../StatusIcon";
import { IssuesSearchInput } from "./IssuesSearchInput";
import type { Agent, IssueViewState, ProjectOption } from "./types";
import { arraysEqual, priorityOrder, quickFilterPresets, statusLabel, statusOrder, toggleInArray } from "./types";

interface IssuesToolbarProps {
  viewState: IssueViewState;
  agents?: Agent[];
  projects?: ProjectOption[];
  labels?: Array<{ id: string; name: string; color: string }>;
  currentUserId: string | null;
  initialSearch: string;
  activeFilterCount: number;
  selectionCount: number;
  filteredLength: number;
  bulkStatusOpen: boolean;
  bulkAssigneeOpen: boolean;
  bulkAssigneeSearch: string;
  selectedIds: Set<string>;
  onOpenNewIssue: (defaults: Record<string, string>) => void;
  onSearchCommit: (value: string) => void;
  onUpdateView: (patch: Partial<IssueViewState>) => void;
  onToggleSelectAll: () => void;
  onBulkUpdateStatus: (status: string) => void;
  onBulkAssign: (agentId: string | null, userId: string | null) => void;
  onSetBulkStatusOpen: (open: boolean) => void;
  onSetBulkAssigneeOpen: (open: boolean) => void;
  onSetBulkAssigneeSearch: (search: string) => void;
  onClearSelection: () => void;
}

export function IssuesToolbar({
  viewState,
  agents,
  projects,
  labels,
  currentUserId,
  initialSearch,
  activeFilterCount,
  selectionCount,
  filteredLength,
  bulkStatusOpen,
  bulkAssigneeOpen,
  bulkAssigneeSearch,
  selectedIds: _selectedIds,
  onOpenNewIssue,
  onSearchCommit,
  onUpdateView,
  onToggleSelectAll,
  onBulkUpdateStatus,
  onBulkAssign,
  onSetBulkStatusOpen,
  onSetBulkAssigneeOpen,
  onSetBulkAssigneeSearch,
  onClearSelection,
}: IssuesToolbarProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Button size="sm" variant="outline" onClick={() => onOpenNewIssue({})}>
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">New Mission</span>
          </Button>
          <IssuesSearchInput initialValue={initialSearch} onValueCommitted={onSearchCommit} />
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <div className="flex items-center border border-border rounded-md overflow-hidden mr-1">
            <button
              type="button"
              className={`p-1.5 transition-colors ${viewState.viewMode === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => onUpdateView({ viewMode: "list" })}
              title="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={`p-1.5 transition-colors ${viewState.viewMode === "board" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => onUpdateView({ viewMode: "board" })}
              title="Board view"
            >
              <Columns3 className="h-3.5 w-3.5" />
            </button>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`text-xs ${activeFilterCount > 0 ? "text-blue-600 dark:text-blue-400" : ""}`}
              >
                <Filter className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
                <span className="hidden sm:inline">
                  {activeFilterCount > 0 ? `Filters: ${activeFilterCount}` : "Filter"}
                </span>
                {activeFilterCount > 0 && (
                  <span className="sm:hidden text-[10px] font-medium ml-0.5">{activeFilterCount}</span>
                )}
                {activeFilterCount > 0 && (
                  <X
                    className="h-3 w-3 ml-1 hidden sm:block"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateView({ statuses: [], priorities: [], assignees: [], labels: [], projects: [] });
                    }}
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(480px,calc(100vw-2rem))] p-0">
              <div className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Filters</span>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => onUpdateView({ statuses: [], priorities: [], assignees: [], labels: [] })}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Quick filters</span>
                  <div className="flex flex-wrap gap-1.5">
                    {quickFilterPresets.map((preset) => {
                      const isActive = arraysEqual(viewState.statuses, preset.statuses);
                      return (
                        <button
                          type="button"
                          key={preset.label}
                          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${isActive ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
                          onClick={() => onUpdateView({ statuses: isActive ? [] : [...preset.statuses] })}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="border-t border-border" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <div className="space-y-0.5">
                      {statusOrder.map((s) => (
                        <div
                          key={s}
                          className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer"
                        >
                          <Checkbox
                            checked={viewState.statuses.includes(s)}
                            onCheckedChange={() => onUpdateView({ statuses: toggleInArray(viewState.statuses, s) })}
                            aria-label={statusLabel(s)}
                          />
                          <StatusIcon status={s} />
                          <span className="text-sm">{statusLabel(s)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Priority</span>
                      <div className="space-y-0.5">
                        {priorityOrder.map((p) => (
                          <div
                            key={p}
                            className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={viewState.priorities.includes(p)}
                              onCheckedChange={() =>
                                onUpdateView({ priorities: toggleInArray(viewState.priorities, p) })
                              }
                              aria-label={statusLabel(p)}
                            />
                            <PriorityIcon priority={p} />
                            <span className="text-sm">{statusLabel(p)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Assignee</span>
                      <div className="space-y-0.5 max-h-32 overflow-y-auto">
                        <div className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer">
                          <Checkbox
                            checked={viewState.assignees.includes("__unassigned")}
                            onCheckedChange={() =>
                              onUpdateView({ assignees: toggleInArray(viewState.assignees, "__unassigned") })
                            }
                            aria-label="No assignee"
                          />
                          <span className="text-sm">No assignee</span>
                        </div>
                        {currentUserId && (
                          <div className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer">
                            <Checkbox
                              checked={viewState.assignees.includes("__me")}
                              onCheckedChange={() =>
                                onUpdateView({ assignees: toggleInArray(viewState.assignees, "__me") })
                              }
                              aria-label="Me"
                            />
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">Me</span>
                          </div>
                        )}
                        {(agents ?? []).map((agent) => (
                          <div
                            key={agent.id}
                            className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={viewState.assignees.includes(agent.id)}
                              onCheckedChange={() =>
                                onUpdateView({ assignees: toggleInArray(viewState.assignees, agent.id) })
                              }
                              aria-label={agent.name}
                            />
                            <span className="text-sm">{agent.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {labels && labels.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Labels</span>
                        <div className="space-y-0.5 max-h-32 overflow-y-auto">
                          {labels.map((label) => (
                            <div
                              key={label.id}
                              className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer"
                            >
                              <Checkbox
                                checked={viewState.labels.includes(label.id)}
                                onCheckedChange={() =>
                                  onUpdateView({ labels: toggleInArray(viewState.labels, label.id) })
                                }
                                aria-label={label.name}
                              />
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} />
                              <span className="text-sm">{label.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {projects && projects.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Project</span>
                        <div className="space-y-0.5 max-h-32 overflow-y-auto">
                          {projects.map((project) => (
                            <div
                              key={project.id}
                              className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer"
                            >
                              <Checkbox
                                checked={viewState.projects.includes(project.id)}
                                onCheckedChange={() =>
                                  onUpdateView({ projects: toggleInArray(viewState.projects, project.id) })
                                }
                                aria-label={project.name}
                              />
                              <span className="text-sm">{project.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {viewState.viewMode === "list" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs">
                  <ArrowUpDown className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
                  <span className="hidden sm:inline">Sort</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-0">
                <div className="p-2 space-y-0.5">
                  {(
                    [
                      ["status", "Status"],
                      ["priority", "Priority"],
                      ["title", "Title"],
                      ["created", "Created"],
                      ["updated", "Updated"],
                    ] as const
                  ).map(([field, label]) => (
                    <button
                      type="button"
                      key={field}
                      className={`flex items-center justify-between w-full px-2 py-1.5 text-sm rounded-sm ${viewState.sortField === field ? "bg-accent/50 text-foreground" : "hover:bg-accent/50 text-muted-foreground"}`}
                      onClick={() => {
                        if (viewState.sortField === field)
                          onUpdateView({ sortDir: viewState.sortDir === "asc" ? "desc" : "asc" });
                        else onUpdateView({ sortField: field, sortDir: "asc" });
                      }}
                    >
                      <span>{label}</span>
                      {viewState.sortField === field && (
                        <span className="text-xs text-muted-foreground">
                          {viewState.sortDir === "asc" ? "\u2191" : "\u2193"}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {viewState.viewMode === "list" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs">
                  <Layers className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
                  <span className="hidden sm:inline">Group</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-0">
                <div className="p-2 space-y-0.5">
                  {(
                    [
                      ["status", "Status"],
                      ["priority", "Priority"],
                      ["assignee", "Assignee"],
                      ["none", "None"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      className={`flex items-center justify-between w-full px-2 py-1.5 text-sm rounded-sm ${viewState.groupBy === value ? "bg-accent/50 text-foreground" : "hover:bg-accent/50 text-muted-foreground"}`}
                      onClick={() => onUpdateView({ groupBy: value })}
                    >
                      <span>{label}</span>
                      {viewState.groupBy === value && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {selectionCount > 0 && viewState.viewMode === "list" && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-sm">
          <Checkbox checked={selectionCount === filteredLength} onCheckedChange={onToggleSelectAll} />
          <span className="font-medium">{selectionCount} selected</span>
          <div className="ml-auto flex items-center gap-1">
            <Popover open={bulkStatusOpen} onOpenChange={onSetBulkStatusOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs h-7">
                  Set status
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1" align="end">
                {statusOrder.map((s) => (
                  <button
                    type="button"
                    key={s}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/50"
                    onClick={() => onBulkUpdateStatus(s)}
                  >
                    <StatusIcon status={s} />
                    <span>{statusLabel(s)}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <Popover
              open={bulkAssigneeOpen}
              onOpenChange={(o) => {
                onSetBulkAssigneeOpen(o);
                if (!o) onSetBulkAssigneeSearch("");
              }}
            >
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs h-7">
                  Assign
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-1" align="end">
                <input
                  className="mb-1 w-full border-b border-border bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/70"
                  placeholder="Search assignees..."
                  value={bulkAssigneeSearch}
                  onChange={(e) => onSetBulkAssigneeSearch(e.target.value)}
                />
                <div className="max-h-48 overflow-y-auto overscroll-contain">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/50"
                    onClick={() => onBulkAssign(null, null)}
                  >
                    No assignee
                  </button>
                  {currentUserId && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/50"
                      onClick={() => onBulkAssign(null, currentUserId)}
                    >
                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      Me
                    </button>
                  )}
                  {(agents ?? [])
                    .filter(
                      (a) =>
                        !bulkAssigneeSearch.trim() || a.name.toLowerCase().includes(bulkAssigneeSearch.toLowerCase()),
                    )
                    .map((agent) => (
                      <button
                        type="button"
                        key={agent.id}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent/50"
                        onClick={() => onBulkAssign(agent.id, null)}
                      >
                        <Identity name={agent.name} size="sm" className="min-w-0" />
                      </button>
                    ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={onClearSelection}>
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

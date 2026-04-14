import { startTransition, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { pickTextColorForPillBg } from "@/lib/color-contrast";
import { useDialog } from "../../context/DialogContext";
import { useCompany } from "../../context/CompanyContext";
import { issuesApi } from "../../api/issues";
import { authApi } from "../../api/auth";
import { queryKeys } from "../../lib/queryKeys";
import { formatAssigneeUserLabel } from "../../lib/assignees";
import { groupBy } from "../../lib/groupBy";
import { formatDate, cn } from "../../lib/utils";
import { timeAgo } from "../../lib/timeAgo";
import { StatusIcon } from "../StatusIcon";
import { PriorityIcon } from "../PriorityIcon";
import { EmptyState } from "../EmptyState";
import { Identity } from "../Identity";
import { IssueRow } from "../IssueRow";
import { DeadlineCountdown } from "../DeadlineCountdown";
import { PageSkeleton } from "../PageSkeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { CircleDot, Plus, Filter, ChevronRight, ChevronUp, ChevronDown, User } from "lucide-react";
import { KanbanBoard } from "../kanban";
import { useConfetti, useStaggeredEntry } from "../../hooks/useMicroInteractions";

import type { IssuesListProps, IssueViewState } from "./types";
import {
  statusOrder,
  priorityOrder,
  statusLabel,
  defaultViewState,
  getViewState,
  saveViewState,
  applyFilters,
  sortIssues,
  applyColumnFilters,
  countActiveFilters,
} from "./types";
import { IssuesToolbar } from "./IssuesToolbar";

// Re-export the type
export type { IssueViewState } from "./types";

export function IssuesList({
  issues,
  isLoading,
  error,
  agents,
  projects,
  goals,
  routines,
  liveIssueIds,
  projectId,
  viewStateKey,
  issueLinkState,
  initialAssignees,
  initialSearch,
  searchFilters,
  onSearchChange,
  onUpdateIssue,
  goalInfo,
}: IssuesListProps) {
  const { selectedCompanyId } = useCompany();
  const { openNewIssue } = useDialog();
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;

  const scopedKey = selectedCompanyId ? `${viewStateKey}:${selectedCompanyId}` : viewStateKey;

  const [viewState, setViewState] = useState<IssueViewState>(() => {
    if (initialAssignees) return { ...defaultViewState, assignees: initialAssignees, statuses: [] };
    return getViewState(scopedKey);
  });
  const [assigneePickerIssueId, setAssigneePickerIssueId] = useState<string | null>(null);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [issueSearch, setIssueSearch] = useState(initialSearch ?? "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssigneeOpen, setBulkAssigneeOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkAssigneeSearch, setBulkAssigneeSearch] = useState("");
  const normalizedIssueSearch = issueSearch.trim();

  useEffect(() => { setIssueSearch(initialSearch ?? ""); }, [initialSearch]);

  const prevScopedKey = useRef(scopedKey);
  useEffect(() => {
    if (prevScopedKey.current !== scopedKey) {
      prevScopedKey.current = scopedKey;
      setViewState(initialAssignees ? { ...defaultViewState, assignees: initialAssignees, statuses: [] } : getViewState(scopedKey));
    }
  }, [scopedKey, initialAssignees]);

  const handleIssueSearchCommit = useCallback((nextSearch: string) => {
    startTransition(() => { setIssueSearch(nextSearch); });
    onSearchChange?.(nextSearch);
  }, [onSearchChange]);

  const updateView = useCallback((patch: Partial<IssueViewState>) => {
    setViewState((prev) => { const next = { ...prev, ...patch }; saveViewState(scopedKey, next); return next; });
  }, [scopedKey]);

  const { data: searchedIssues = [] } = useQuery({
    queryKey: [...queryKeys.issues.search(selectedCompanyId!, normalizedIssueSearch, projectId), searchFilters ?? {}],
    queryFn: () => issuesApi.list(selectedCompanyId!, { q: normalizedIssueSearch, projectId, ...searchFilters }),
    enabled: !!selectedCompanyId && normalizedIssueSearch.length > 0,
    placeholderData: (previousData) => previousData,
  });

  const agentName = useCallback((id: string | null) => { if (!id || !agents) return null; return agents.find((a) => a.id === id)?.name ?? null; }, [agents]);
  const goalName = useCallback((id: string | null) => { if (!id || !goals) return null; return goals.find((g) => g.id === id)?.title ?? null; }, [goals]);
  const routineName = useCallback((id: string | null) => { if (!id || !routines) return null; return routines.find((r) => r.id === id)?.title ?? null; }, [routines]);

  const filtered = useMemo(() => {
    const sourceIssues = normalizedIssueSearch.length > 0 ? searchedIssues : issues;
    return sortIssues(applyColumnFilters(applyFilters(sourceIssues, viewState, currentUserId), viewState.columnFilters), viewState);
  }, [issues, searchedIssues, viewState, normalizedIssueSearch, currentUserId]);

  const [editingCell, setEditingCell] = useState<{ issueId: string; field: "status" | "priority" } | null>(null);

  const handleColumnHeaderClick = useCallback((field: IssueViewState["sortField"], shiftKey: boolean) => {
    if (shiftKey) {
      const existing = viewState.secondarySorts ?? [];
      const alreadyIdx = existing.findIndex((s) => s.field === field);
      if (alreadyIdx >= 0) { const updated = [...existing]; updated[alreadyIdx] = { field, dir: updated[alreadyIdx].dir === "asc" ? "desc" : "asc" }; updateView({ secondarySorts: updated }); }
      else if (field !== viewState.sortField) updateView({ secondarySorts: [...existing, { field, dir: "asc" }] });
    } else {
      if (viewState.sortField === field) updateView({ sortDir: viewState.sortDir === "asc" ? "desc" : "asc", secondarySorts: [] });
      else updateView({ sortField: field, sortDir: "asc", secondarySorts: [] });
    }
  }, [viewState.sortField, viewState.sortDir, viewState.secondarySorts, updateView]);

  const updateColumnFilter = useCallback((key: keyof NonNullable<IssueViewState["columnFilters"]>, value: unknown) => {
    updateView({ columnFilters: { ...viewState.columnFilters, [key]: value } });
  }, [viewState.columnFilters, updateView]);

  const { trigger: triggerConfetti } = useConfetti();
  const getStaggerStyle = useStaggeredEntry(filtered.length, 30);

  const handleStatusChange = useCallback((issueId: string, newStatus: string, element?: HTMLElement | null) => {
    onUpdateIssue(issueId, { status: newStatus });
    if (newStatus === "done" && element) triggerConfetti(element);
    setEditingCell(null);
  }, [onUpdateIssue, triggerConfetti]);

  const handlePriorityChange = useCallback((issueId: string, newPriority: string) => {
    onUpdateIssue(issueId, { priority: newPriority });
    setEditingCell(null);
  }, [onUpdateIssue]);

  const { data: labels } = useQuery({
    queryKey: queryKeys.issues.labels(selectedCompanyId!),
    queryFn: () => issuesApi.listLabels(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const activeFilterCount = countActiveFilters(viewState);

  const groupedContent = useMemo(() => {
    if (viewState.groupBy === "none") return [{ key: "__all", label: null as string | null, items: filtered }];
    if (viewState.groupBy === "status") {
      const groups = groupBy(filtered, (i) => i.status);
      return statusOrder.filter((s) => groups[s]?.length).map((s) => ({ key: s, label: statusLabel(s), items: groups[s]! }));
    }
    if (viewState.groupBy === "priority") {
      const groups = groupBy(filtered, (i) => i.priority);
      return priorityOrder.filter((p) => groups[p]?.length).map((p) => ({ key: p, label: statusLabel(p), items: groups[p]! }));
    }
    const groups = groupBy(filtered, (issue) => issue.assigneeAgentId ?? (issue.assigneeUserId ? `__user:${issue.assigneeUserId}` : "__unassigned"));
    return Object.keys(groups).map((key) => ({
      key,
      label: key === "__unassigned" ? "Unassigned" : key.startsWith("__user:") ? (formatAssigneeUserLabel(key.slice("__user:".length), currentUserId) ?? "User") : (agentName(key) ?? key.slice(0, 8)),
      items: groups[key]!,
    }));
  }, [filtered, viewState.groupBy, agents, agentName, currentUserId]);

  const newIssueDefaults = (groupKey?: string) => {
    const defaults: Record<string, string> = {};
    if (projectId) defaults.projectId = projectId;
    if (groupKey) {
      if (viewState.groupBy === "status") defaults.status = groupKey;
      else if (viewState.groupBy === "priority") defaults.priority = groupKey;
      else if (viewState.groupBy === "assignee" && groupKey !== "__unassigned") {
        if (groupKey.startsWith("__user:")) defaults.assigneeUserId = groupKey.slice("__user:".length);
        else defaults.assigneeAgentId = groupKey;
      }
    }
    return defaults;
  };

  const assignIssue = (issueId: string, assigneeAgentId: string | null, assigneeUserId: string | null = null) => {
    onUpdateIssue(issueId, { assigneeAgentId, assigneeUserId });
    setAssigneePickerIssueId(null);
    setAssigneeSearch("");
  };

  const toggleSelected = useCallback((id: string) => { setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }, []);
  const toggleSelectAll = useCallback(() => { setSelectedIds((prev) => prev.size === filtered.length ? new Set() : new Set(filtered.map((i) => i.id))); }, [filtered]);
  const bulkUpdateStatus = useCallback((status: string) => { for (const id of selectedIds) onUpdateIssue(id, { status }); setSelectedIds(new Set()); setBulkStatusOpen(false); }, [selectedIds, onUpdateIssue]);
  const bulkAssign = useCallback((assigneeAgentId: string | null, assigneeUserId: string | null = null) => { for (const id of selectedIds) onUpdateIssue(id, { assigneeAgentId, assigneeUserId }); setSelectedIds(new Set()); setBulkAssigneeOpen(false); setBulkAssigneeSearch(""); }, [selectedIds, onUpdateIssue]);

  const selectionCount = selectedIds.size;

  return (
    <div className="space-y-4">
      <IssuesToolbar
        viewState={viewState}
        agents={agents}
        projects={projects}
        labels={labels}
        currentUserId={currentUserId}
        initialSearch={initialSearch ?? ""}
        activeFilterCount={activeFilterCount}
        selectionCount={selectionCount}
        filteredLength={filtered.length}
        bulkStatusOpen={bulkStatusOpen}
        bulkAssigneeOpen={bulkAssigneeOpen}
        bulkAssigneeSearch={bulkAssigneeSearch}
        selectedIds={selectedIds}
        onOpenNewIssue={(defaults) => openNewIssue({ ...newIssueDefaults(), ...defaults })}
        onSearchCommit={handleIssueSearchCommit}
        onUpdateView={updateView}
        onToggleSelectAll={toggleSelectAll}
        onBulkUpdateStatus={bulkUpdateStatus}
        onBulkAssign={bulkAssign}
        onSetBulkStatusOpen={setBulkStatusOpen}
        onSetBulkAssigneeOpen={setBulkAssigneeOpen}
        onSetBulkAssigneeSearch={setBulkAssigneeSearch}
        onClearSelection={() => setSelectedIds(new Set())}
      />

      {isLoading && <PageSkeleton variant="issues-list" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {!isLoading && filtered.length === 0 && viewState.viewMode === "list" && (
        <EmptyState icon={CircleDot} message="No missions match the current filters or search." action="Create Mission" onAction={() => openNewIssue(newIssueDefaults())} />
      )}

      {/* Mobile card layout */}
      <div className="md:hidden space-y-2">
        {!isLoading && filtered.length > 0 && filtered.map((issue) => (
          <Link key={`mobile-card-${issue.id}`} to={`/issues/${issue.identifier ?? issue.id}`} state={issueLinkState} className="block rounded-lg border border-border bg-card p-3 space-y-2 hover:border-foreground/20 transition-colors no-underline text-foreground">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <StatusIcon status={issue.status} />
                <span className="font-mono text-xs text-muted-foreground shrink-0">{issue.identifier ?? issue.id.slice(0, 8)}</span>
              </div>
              <PriorityIcon priority={issue.priority} />
            </div>
            <p className="text-sm font-medium leading-tight">{issue.title}</p>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{issue.assigneeAgentId && agentName(issue.assigneeAgentId) ? agentName(issue.assigneeAgentId) : "Unassigned"}</span>
              <div className="flex items-center gap-2">
                {issue.targetDate && <DeadlineCountdown targetDate={issue.targetDate} status={issue.status} />}
                <span>{timeAgo(issue.updatedAt)}</span>
              </div>
            </div>
            {liveIssueIds?.has(issue.id) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
                </span>
                Live
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Desktop list/board layout */}
      <div className="hidden md:block">
      {viewState.viewMode === "board" ? (
        <KanbanBoard issues={filtered} agents={agents} liveIssueIds={liveIssueIds} onUpdateIssue={onUpdateIssue} goalInfo={goalInfo} />
      ) : (
        <>
        <div className="flex items-center gap-2 border-b border-border px-2 py-1.5 text-xs text-muted-foreground select-none">
          <div className="w-[60px] shrink-0" />
          <div className="flex-1 min-w-0 flex items-center gap-1">
            <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={(e) => handleColumnHeaderClick("title", e.shiftKey)} title="Click to sort, Shift+click for secondary sort">
              <span className="font-medium">Title</span>
              {viewState.sortField === "title" && (viewState.sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
              {(viewState.secondarySorts ?? []).some((s) => s.field === "title") && <span className="text-[10px] tabular-nums text-blue-500">2</span>}
            </button>
            <input className="ml-1 h-5 w-28 rounded border border-border bg-transparent px-1.5 text-xs outline-none placeholder:text-muted-foreground/70 focus:border-ring" placeholder="Filter..." value={viewState.columnFilters?.title ?? ""} onChange={(e) => updateColumnFilter("title", e.target.value)} />
          </div>
          <div className="w-[100px] shrink-0 flex items-center gap-1">
            <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={(e) => handleColumnHeaderClick("status", e.shiftKey)} title="Click to sort, Shift+click for secondary sort">
              <span className="font-medium">Status</span>
              {viewState.sortField === "status" && (viewState.sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
            </button>
            <Popover>
              <PopoverTrigger asChild><button className="p-0.5 rounded hover:bg-accent/50" title="Filter by status"><Filter className="h-3 w-3" /></button></PopoverTrigger>
              <PopoverContent className="w-40 p-1" align="start">
                <div className="space-y-0.5">
                  {statusOrder.map((s) => (
                    <label key={s} className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer text-xs">
                      <Checkbox checked={(viewState.columnFilters?.status ?? []).includes(s)} onCheckedChange={() => { const current = viewState.columnFilters?.status ?? []; updateColumnFilter("status", current.includes(s) ? current.filter((v: string) => v !== s) : [...current, s]); }} />
                      <StatusIcon status={s} /><span>{statusLabel(s)}</span>
                    </label>
                  ))}
                  {(viewState.columnFilters?.status ?? []).length > 0 && <button className="w-full text-xs text-muted-foreground hover:text-foreground px-2 py-1" onClick={() => updateColumnFilter("status", [])}>Clear</button>}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="w-[100px] shrink-0 flex items-center gap-1">
            <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={(e) => handleColumnHeaderClick("priority", e.shiftKey)} title="Click to sort, Shift+click for secondary sort">
              <span className="font-medium">Priority</span>
              {viewState.sortField === "priority" && (viewState.sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
            </button>
            <Popover>
              <PopoverTrigger asChild><button className="p-0.5 rounded hover:bg-accent/50" title="Filter by priority"><Filter className="h-3 w-3" /></button></PopoverTrigger>
              <PopoverContent className="w-40 p-1" align="start">
                <div className="space-y-0.5">
                  {priorityOrder.map((p) => (
                    <label key={p} className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer text-xs">
                      <Checkbox checked={(viewState.columnFilters?.priority ?? []).includes(p)} onCheckedChange={() => { const current = viewState.columnFilters?.priority ?? []; updateColumnFilter("priority", current.includes(p) ? current.filter((v: string) => v !== p) : [...current, p]); }} />
                      <PriorityIcon priority={p} /><span>{statusLabel(p)}</span>
                    </label>
                  ))}
                  {(viewState.columnFilters?.priority ?? []).length > 0 && <button className="w-full text-xs text-muted-foreground hover:text-foreground px-2 py-1" onClick={() => updateColumnFilter("priority", [])}>Clear</button>}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="w-[180px] shrink-0">
            <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={(e) => handleColumnHeaderClick("updated", e.shiftKey)}>
              <span className="font-medium">Updated</span>
              {viewState.sortField === "updated" && (viewState.sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
            </button>
          </div>
        </div>
        {groupedContent.map((group) => (
          <Collapsible key={group.key} open={!viewState.collapsedGroups.includes(group.key)} onOpenChange={(open) => { updateView({ collapsedGroups: open ? viewState.collapsedGroups.filter((k) => k !== group.key) : [...viewState.collapsedGroups, group.key] }); }}>
            {group.label && (
              <div className="flex items-center py-1.5 pl-1 pr-3">
                <CollapsibleTrigger className="flex items-center gap-1.5">
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-90" />
                  <span className="text-sm font-semibold uppercase tracking-wide">{group.label}</span>
                </CollapsibleTrigger>
                <Button variant="ghost" size="icon-xs" className="ml-auto text-muted-foreground" onClick={() => openNewIssue(newIssueDefaults(group.key))}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
            <CollapsibleContent>
              {group.items.map((issue, itemIndex) => (
                <div key={issue.id} className="list-item-enter" style={getStaggerStyle(itemIndex)}>
                <IssueRow
                  issue={issue}
                  issueLinkState={issueLinkState}
                  desktopLeadingSpacer
                  mobileLeading={(
                    <span className="flex items-center gap-1.5" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                      {selectionCount > 0 && <Checkbox checked={selectedIds.has(issue.id)} onCheckedChange={() => toggleSelected(issue.id)} className="h-3.5 w-3.5" />}
                      <StatusIcon status={issue.status} onChange={(s) => handleStatusChange(issue.id, s, document.activeElement as HTMLElement)} />
                    </span>
                  )}
                  desktopMetaLeading={(
                    <>
                      <span className="hidden shrink-0 items-center gap-1.5 sm:inline-flex" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                        <Checkbox checked={selectedIds.has(issue.id)} onCheckedChange={() => toggleSelected(issue.id)} className="h-3.5 w-3.5" />
                        <StatusIcon status={issue.status} onChange={(s) => handleStatusChange(issue.id, s, document.activeElement as HTMLElement)} />
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{issue.identifier ?? issue.id.slice(0, 8)}</span>
                      {liveIssueIds?.has(issue.id) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 sm:gap-1.5 sm:px-2">
                          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-blue-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" /></span>
                          <span className="hidden text-[11px] font-medium text-blue-600 dark:text-blue-400 sm:inline">Live</span>
                        </span>
                      )}
                    </>
                  )}
                  mobileMeta={timeAgo(issue.updatedAt)}
                  desktopTrailing={(
                    <>
                      <span className="hidden items-center md:flex inline-edit-cell rounded px-1 py-0.5 cursor-pointer" onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingCell({ issueId: issue.id, field: "priority" }); }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} title="Double-click to change priority">
                        <PriorityIcon priority={issue.priority} onChange={editingCell?.issueId === issue.id && editingCell?.field === "priority" ? (p) => handlePriorityChange(issue.id, p) : undefined} />
                      </span>
                      {issue.goalId && goalName(issue.goalId) && (
                        <span className="hidden items-center md:flex"><span className="inline-flex items-center rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{goalName(issue.goalId)}</span></span>
                      )}
                      {issue.originKind === "routine_execution" && issue.originId && (
                        <span className="hidden items-center md:flex"><span className="inline-flex items-center rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400 whitespace-nowrap">{routineName(issue.originId) ?? "Playbook"}</span></span>
                      )}
                      {issue.status === "blocked" && (
                        <span className="hidden items-center md:flex">
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400 truncate max-w-[220px]" title={(() => { const depMatch = issue.description?.match(/Depends on:\s*(.+?)(?:\n|$)/i); return depMatch ? `Blocked by: ${depMatch[1].trim()}` : "Blocked"; })()}>
                            {(() => { const depMatch = issue.description?.match(/Depends on:\s*(.+?)(?:\n|$)/i); if (depMatch) return `Blocked by: ${depMatch[1].trim()}`; return "Blocked"; })()}
                          </span>
                        </span>
                      )}
                      {issue.parentId && <span className="hidden items-center md:flex"><span className="inline-flex items-center rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">Subtask</span></span>}
                      {(issue.labels ?? []).length > 0 && (
                        <span className="hidden items-center gap-1 overflow-hidden md:flex md:max-w-[240px]">
                          {(issue.labels ?? []).slice(0, 3).map((label) => (
                            <span key={label.id} className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium" style={{ borderColor: label.color, color: pickTextColorForPillBg(label.color, 0.12), backgroundColor: `${label.color}1f` }}>{label.name}</span>
                          ))}
                          {(issue.labels ?? []).length > 3 && <span className="text-[10px] text-muted-foreground">+{(issue.labels ?? []).length - 3}</span>}
                        </span>
                      )}
                      {issue.targetDate && <span className="hidden items-center md:flex"><DeadlineCountdown targetDate={issue.targetDate} status={issue.status} /></span>}
                      <Popover open={assigneePickerIssueId === issue.id} onOpenChange={(open) => { setAssigneePickerIssueId(open ? issue.id : null); if (!open) setAssigneeSearch(""); }}>
                        <PopoverTrigger asChild>
                          <button className="flex w-[180px] shrink-0 items-center rounded-md px-2 py-1 transition-colors hover:bg-accent/50" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                            {issue.assigneeAgentId && agentName(issue.assigneeAgentId) ? (
                              <Identity name={agentName(issue.assigneeAgentId)!} size="sm" />
                            ) : issue.assigneeUserId ? (
                              <span className="inline-flex items-center gap-1.5 text-xs"><span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/35 bg-muted/30"><User className="h-3 w-3" /></span>{formatAssigneeUserLabel(issue.assigneeUserId, currentUserId) ?? "User"}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/35 bg-muted/30"><User className="h-3 w-3" /></span>Assignee</span>
                            )}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-1" align="end" onClick={(e) => e.stopPropagation()} onPointerDownOutside={() => setAssigneeSearch("")}>
                          <input className="mb-1 w-full border-b border-border bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/70" placeholder="Search assignees..." value={assigneeSearch} onChange={(e) => setAssigneeSearch(e.target.value)} autoFocus />
                          <div className="max-h-48 overflow-y-auto overscroll-contain">
                            <button className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/50", !issue.assigneeAgentId && !issue.assigneeUserId && "bg-accent")} onClick={(e) => { e.preventDefault(); e.stopPropagation(); assignIssue(issue.id, null, null); }}>No assignee</button>
                            {currentUserId && (
                              <button className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent/50", issue.assigneeUserId === currentUserId && "bg-accent")} onClick={(e) => { e.preventDefault(); e.stopPropagation(); assignIssue(issue.id, null, currentUserId); }}>
                                <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span>Me</span>
                              </button>
                            )}
                            {(agents ?? []).filter((agent) => { if (!assigneeSearch.trim()) return true; return agent.name.toLowerCase().includes(assigneeSearch.toLowerCase()); }).map((agent) => (
                              <button key={agent.id} className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent/50", issue.assigneeAgentId === agent.id && "bg-accent")} onClick={(e) => { e.preventDefault(); e.stopPropagation(); assignIssue(issue.id, agent.id, null); }}>
                                <Identity name={agent.name} size="sm" className="min-w-0" />
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </>
                  )}
                  trailingMeta={<span className="hidden md:inline">{formatDate(issue.createdAt)}</span>}
                />
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))}
        </>
      )}
      </div>

      <button className="md:hidden fixed bottom-6 right-6 z-40 flex items-center justify-center h-12 w-12 rounded-full bg-foreground text-background shadow-lg hover:scale-105 transition-transform" onClick={() => openNewIssue(newIssueDefaults())} aria-label="Create mission">
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

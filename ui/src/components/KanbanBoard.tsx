import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { StatusIcon } from "./StatusIcon";
import { Identity } from "./Identity";
import { KanbanCard } from "./KanbanCard";
import { cn } from "../lib/utils";
import { HelpBeacon } from "./HelpBeacon";
import {
  Plus,
  Check,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Minus as MinusIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDialog } from "../context/DialogContext";
import type { Issue } from "@ironworksai/shared";

/* ── Constants ── */

const BOARD_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
] as const;

type BoardStatus = (typeof BOARD_STATUSES)[number];

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_COLUMN_TINTS: Record<string, string> = {
  backlog: "bg-muted/20 dark:bg-muted/10",
  todo: "bg-blue-500/5 dark:bg-blue-500/5",
  in_progress: "bg-yellow-500/5 dark:bg-yellow-500/5",
  in_review: "bg-violet-500/5 dark:bg-violet-500/5",
  done: "bg-green-500/5 dark:bg-green-500/5",
};

/* ── WIP Limits ── */

const DEFAULT_WIP_LIMITS: Record<string, number> = {
  in_progress: 5,
  in_review: 3,
};

function getWipLimits(): Record<string, number> {
  try {
    const raw = localStorage.getItem("kanban:wipLimits");
    if (raw) return { ...DEFAULT_WIP_LIMITS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_WIP_LIMITS };
}

/* ── Swimlane types ── */

type SwimlaneMode = "none" | "agent" | "project" | "priority";

interface Swimlane {
  key: string;
  label: string;
  issues: Issue[];
}

/* ── Agent type ── */

interface Agent {
  id: string;
  name: string;
}

/* ── Props ── */

/* ── Column Health Indicator ── */

function ColumnHealthIndicator({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;
  const now = Date.now();
  const ages = issues.map((i) => (now - new Date(i.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  const avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;
  const color = avgAge > 14 ? "bg-red-500" : avgAge > 7 ? "bg-amber-500" : "bg-emerald-500";
  const label = avgAge < 1 ? "<1d" : `${Math.round(avgAge)}d`;
  return (
    <span className="flex items-center gap-1 text-[9px] text-muted-foreground/60" title={`Average card age: ${label}`}>
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", color)} />
      {label} avg
    </span>
  );
}

/* ── Bulk Operations Bar ── */

function BulkOperationsBar({
  selectedCount,
  agents,
  onChangeStatus,
  onChangeAssignee,
  onChangePriority,
  onClear,
}: {
  selectedCount: number;
  agents?: Agent[];
  onChangeStatus: (status: string) => void;
  onChangeAssignee: (agentId: string) => void;
  onChangePriority: (priority: string) => void;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-lg border border-border bg-background/95 backdrop-blur-sm px-4 py-2 shadow-lg">
      <span className="text-sm font-medium">{selectedCount} selected</span>
      <Select onValueChange={onChangeStatus}>
        <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="backlog">Backlog</SelectItem>
          <SelectItem value="todo">Todo</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="in_review">In Review</SelectItem>
          <SelectItem value="done">Done</SelectItem>
        </SelectContent>
      </Select>
      {agents && agents.length > 0 && (
        <Select onValueChange={onChangeAssignee}>
          <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select onValueChange={onChangePriority}>
        <SelectTrigger className="h-7 w-auto min-w-[80px] text-xs">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="critical">Critical</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>
      <button
        onClick={onClear}
        className="ml-1 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Clear selection"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface KanbanBoardProps {
  issues: Issue[];
  agents?: Agent[];
  liveIssueIds?: Set<string>;
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void;
}

/* ── Column Component ── */

const KanbanColumn = memo(function KanbanColumn({
  status,
  issues,
  agents,
  liveIssueIds,
  wipLimit,
  collapsed,
  onToggleCollapse,
  onQuickCreate,
}: {
  status: string;
  issues: Issue[];
  agents?: Agent[];
  liveIssueIds?: Set<string>;
  wipLimit?: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onQuickCreate: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const count = issues.length;
  const atLimit = wipLimit !== undefined && count >= wipLimit;
  const overLimit = wipLimit !== undefined && count > wipLimit;

  const columnRef = useRef<HTMLDivElement>(null);

  return (
    <div className={cn("flex flex-col min-w-[280px] w-[280px] shrink-0")}>
      {/* Column Header */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 mb-1 rounded-t-lg",
          overLimit && "bg-red-500/10",
          atLimit && !overLimit && "bg-amber-500/10",
        )}
      >
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <StatusIcon status={status} />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {statusLabel(status)}
          </span>
        </button>

        <span
          className={cn(
            "text-xs tabular-nums font-medium px-1.5 py-0.5 rounded-full",
            overLimit
              ? "bg-red-500/20 text-red-500"
              : atLimit
                ? "bg-amber-500/20 text-amber-500"
                : "text-muted-foreground/60",
          )}
        >
          {count}
          {wipLimit !== undefined && (
            <span className="text-muted-foreground/40">/{wipLimit}</span>
          )}
        </span>
        {wipLimit !== undefined && (
          <HelpBeacon text="WIP (Work In Progress) limits cap how many issues can be in this column at once. When the limit is reached, the count turns amber. Going over turns it red. This helps prevent overloading agents with too many concurrent tasks." />
        )}

        {overLimit && (
          <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
        )}

        <ColumnHealthIndicator issues={issues} />

        <button
          onClick={onQuickCreate}
          className="ml-auto p-0.5 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
          title={`Create issue in ${statusLabel(status)}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Column Body */}
      {!collapsed && (
        <div
          ref={(node) => {
            setNodeRef(node);
            (columnRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }}
          className={cn(
            "flex-1 min-h-[120px] rounded-b-lg p-1.5 transition-colors overflow-y-auto",
            "scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent",
            isOver ? "bg-accent/40 ring-1 ring-primary/20" : STATUS_COLUMN_TINTS[status] ?? "bg-muted/20",
          )}
          style={{ maxHeight: "calc(100vh - 220px)" }}
        >
          <SortableContext
            items={issues.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {issues.map((issue) => (
                <KanbanCard
                  key={issue.id}
                  issue={issue}
                  agents={agents}
                  isLive={liveIssueIds?.has(issue.id)}
                  isBlocked={issue.status === "blocked"}
                />
              ))}
            </div>
          </SortableContext>

          {issues.length === 0 && (
            <div className="flex items-center justify-center h-20 border-2 border-dashed border-border/40 rounded-lg">
              <span className="text-xs text-muted-foreground/50">No items</span>
            </div>
          )}
        </div>
      )}

      {collapsed && (
        <div className="flex-1 min-h-[40px] rounded-b-lg bg-muted/10 flex items-center justify-center">
          <span className="text-xs text-muted-foreground/40">
            {count} item{count !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
});

/* ── Swimlane Header ── */

function SwimlaneHeader({
  label,
  count,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 px-2 py-2 w-full hover:bg-accent/30 rounded transition-colors"
    >
      {collapsed ? (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
    </button>
  );
}

/* ── Swimlane Toggle Bar ── */

function SwimlaneToggle({
  mode,
  onChange,
}: {
  mode: SwimlaneMode;
  onChange: (mode: SwimlaneMode) => void;
}) {
  const options: { value: SwimlaneMode; label: string }[] = [
    { value: "none", label: "No lanes" },
    { value: "agent", label: "By Agent" },
    { value: "project", label: "By Project" },
    { value: "priority", label: "By Priority" },
  ];

  return (
    <div className="flex items-center gap-1 border border-border rounded-md overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={cn(
            "px-2.5 py-1 text-xs transition-colors",
            mode === opt.value
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
          )}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ── Main Board ── */

export function KanbanBoard({
  issues,
  agents,
  liveIssueIds,
  onUpdateIssue,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set());
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkStatus = useCallback((status: string) => {
    for (const id of selectedIds) {
      onUpdateIssue(id, { status });
    }
    setSelectedIds(new Set());
  }, [selectedIds, onUpdateIssue]);

  const handleBulkAssignee = useCallback((assigneeAgentId: string) => {
    for (const id of selectedIds) {
      onUpdateIssue(id, { assigneeAgentId });
    }
    setSelectedIds(new Set());
  }, [selectedIds, onUpdateIssue]);

  const handleBulkPriority = useCallback((priority: string) => {
    for (const id of selectedIds) {
      onUpdateIssue(id, { priority });
    }
    setSelectedIds(new Set());
  }, [selectedIds, onUpdateIssue]);
  const [swimlaneMode, setSwimlaneMode] = useState<SwimlaneMode>(() => {
    try {
      return (localStorage.getItem("kanban:swimlaneMode") as SwimlaneMode) ?? "none";
    } catch {
      return "none";
    }
  });

  const { openNewIssue } = useDialog();

  const wipLimits = useMemo(() => getWipLimits(), []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Persist swimlane mode
  useEffect(() => {
    try {
      localStorage.setItem("kanban:swimlaneMode", swimlaneMode);
    } catch {
      /* ignore */
    }
  }, [swimlaneMode]);

  // Build swimlanes
  const swimlanes = useMemo((): Swimlane[] => {
    if (swimlaneMode === "none") {
      return [{ key: "__all", label: "", issues }];
    }
    if (swimlaneMode === "agent") {
      const grouped = new Map<string, Issue[]>();
      const unassigned: Issue[] = [];
      for (const issue of issues) {
        const agentId = issue.assigneeAgentId;
        if (!agentId) {
          unassigned.push(issue);
          continue;
        }
        if (!grouped.has(agentId)) grouped.set(agentId, []);
        grouped.get(agentId)!.push(issue);
      }
      const lanes: Swimlane[] = [];
      for (const [agentId, agentIssues] of grouped) {
        const agent = agents?.find((a) => a.id === agentId);
        lanes.push({
          key: agentId,
          label: agent?.name ?? agentId.slice(0, 8),
          issues: agentIssues,
        });
      }
      if (unassigned.length > 0) {
        lanes.push({ key: "__unassigned", label: "Unassigned", issues: unassigned });
      }
      return lanes;
    }
    if (swimlaneMode === "project") {
      const grouped = new Map<string, { name: string; issues: Issue[] }>();
      const noProject: Issue[] = [];
      for (const issue of issues) {
        if (!issue.projectId) {
          noProject.push(issue);
          continue;
        }
        if (!grouped.has(issue.projectId)) {
          grouped.set(issue.projectId, {
            name: issue.project?.name ?? issue.projectId.slice(0, 8),
            issues: [],
          });
        }
        grouped.get(issue.projectId)!.issues.push(issue);
      }
      const lanes: Swimlane[] = [];
      for (const [projectId, data] of grouped) {
        lanes.push({ key: projectId, label: data.name, issues: data.issues });
      }
      if (noProject.length > 0) {
        lanes.push({ key: "__none", label: "No Project", issues: noProject });
      }
      return lanes;
    }
    // priority
    const priorityOrder = ["critical", "high", "medium", "low"];
    const grouped = new Map<string, Issue[]>();
    for (const p of priorityOrder) grouped.set(p, []);
    for (const issue of issues) {
      const bucket = grouped.get(issue.priority);
      if (bucket) bucket.push(issue);
    }
    return priorityOrder
      .filter((p) => (grouped.get(p)?.length ?? 0) > 0)
      .map((p) => ({
        key: p,
        label: statusLabel(p),
        issues: grouped.get(p)!,
      }));
  }, [issues, swimlaneMode, agents]);

  // Group issues by status per swimlane
  const groupByStatus = useCallback(
    (laneIssues: Issue[]): Record<string, Issue[]> => {
      const grouped: Record<string, Issue[]> = {};
      for (const status of BOARD_STATUSES) {
        grouped[status] = [];
      }
      for (const issue of laneIssues) {
        // Map blocked issues to the backlog column visually
        const col = BOARD_STATUSES.includes(issue.status as BoardStatus)
          ? issue.status
          : issue.status === "blocked"
            ? "backlog"
            : issue.status === "cancelled"
              ? "done"
              : "backlog";
        if (grouped[col]) {
          grouped[col].push(issue);
        }
      }
      return grouped;
    },
    [],
  );

  const activeIssue = useMemo(
    () => (activeId ? issues.find((i) => i.id === activeId) : null),
    [activeId, issues],
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const issueId = active.id as string;
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;

    let targetStatus: string | null = null;

    if ((BOARD_STATUSES as readonly string[]).includes(over.id as string)) {
      targetStatus = over.id as string;
    } else {
      // Dropped on a card - find which column it belongs to
      const targetIssue = issues.find((i) => i.id === over.id);
      if (targetIssue) {
        targetStatus = targetIssue.status;
      }
    }

    if (targetStatus && targetStatus !== issue.status) {
      onUpdateIssue(issueId, { status: targetStatus });
    }
  }

  function handleDragOver(_event: DragOverEvent) {
    // Visual feedback handled via isOver in columns
  }

  const toggleColumn = useCallback((status: string) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const toggleLane = useCallback((key: string) => {
    setCollapsedLanes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleQuickCreate = useCallback(
    (status: string) => {
      openNewIssue({ status });
    },
    [openNewIssue],
  );

  /* ── Keyboard navigation ── */
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only handle when board is focused or contains active element
      if (!boardRef.current?.contains(document.activeElement)) return;

      const cards = boardRef.current.querySelectorAll<HTMLElement>(
        "[data-kanban-card]",
      );
      if (cards.length === 0) return;

      const currentIndex = Array.from(cards).findIndex(
        (el) => el === document.activeElement || el.contains(document.activeElement),
      );

      if (e.key === "ArrowDown" && currentIndex < cards.length - 1) {
        e.preventDefault();
        cards[currentIndex + 1]?.focus();
      } else if (e.key === "ArrowUp" && currentIndex > 0) {
        e.preventDefault();
        cards[currentIndex - 1]?.focus();
      } else if (e.key === "Enter" && currentIndex >= 0) {
        const link = cards[currentIndex]?.querySelector("a");
        if (link) link.click();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div ref={boardRef} className="space-y-3">
      {/* Toolbar: swimlane toggle */}
      <div className="flex items-center gap-3">
        <SwimlaneToggle mode={swimlaneMode} onChange={setSwimlaneMode} />
      </div>

      {/* Bulk operations bar */}
      <BulkOperationsBar
        selectedCount={selectedIds.size}
        agents={agents}
        onChangeStatus={handleBulkStatus}
        onChangeAssignee={handleBulkAssignee}
        onChangePriority={handleBulkPriority}
        onClear={() => setSelectedIds(new Set())}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* Swimlanes */}
        {swimlanes.map((lane) => {
          const laneCollapsed = collapsedLanes.has(lane.key);
          const columnGroups = groupByStatus(lane.issues);

          return (
            <div key={lane.key}>
              {/* Swimlane header (only if not "none" mode) */}
              {swimlaneMode !== "none" && (
                <SwimlaneHeader
                  label={lane.label}
                  count={lane.issues.length}
                  collapsed={laneCollapsed}
                  onToggle={() => toggleLane(lane.key)}
                />
              )}

              {/* Columns */}
              {(!laneCollapsed || swimlaneMode === "none") && (
                <div className="flex gap-3 overflow-x-auto pb-4 px-1">
                  {BOARD_STATUSES.map((status) => (
                    <KanbanColumn
                      key={`${lane.key}-${status}`}
                      status={status}
                      issues={columnGroups[status] ?? []}
                      agents={agents}
                      liveIssueIds={liveIssueIds}
                      wipLimit={wipLimits[status]}
                      collapsed={collapsedColumns.has(status)}
                      onToggleCollapse={() => toggleColumn(status)}
                      onQuickCreate={() => handleQuickCreate(status)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
          {activeIssue ? (
            <KanbanCard issue={activeIssue} agents={agents} isOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

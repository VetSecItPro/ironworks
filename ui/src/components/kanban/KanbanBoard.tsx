import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Issue } from "@ironworksai/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDialog } from "../../context/DialogContext";
import { KanbanCard } from "../KanbanCard";
import { KanbanColumn } from "./KanbanColumn";
import { BulkOperationsBar, GoalBoardHeader, SwimlaneHeader, SwimlaneToggle } from "./KanbanHelpers";
import {
  BOARD_STATUSES,
  type BoardStatus,
  getWipLimits,
  type KanbanBoardProps,
  type Swimlane,
  type SwimlaneMode,
  statusLabel,
} from "./types";

// Re-export for external consumers
export type { KanbanGoalInfo } from "./types";

export function KanbanBoard({ issues, agents, liveIssueIds, onUpdateIssue, goalInfo }: KanbanBoardProps) {
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

  const handleBulkStatus = useCallback(
    (status: string) => {
      for (const id of selectedIds) {
        onUpdateIssue(id, { status });
      }
      setSelectedIds(new Set());
    },
    [selectedIds, onUpdateIssue],
  );

  const handleBulkAssignee = useCallback(
    (assigneeAgentId: string) => {
      for (const id of selectedIds) {
        onUpdateIssue(id, { assigneeAgentId });
      }
      setSelectedIds(new Set());
    },
    [selectedIds, onUpdateIssue],
  );

  const handleBulkPriority = useCallback(
    (priority: string) => {
      for (const id of selectedIds) {
        onUpdateIssue(id, { priority });
      }
      setSelectedIds(new Set());
    },
    [selectedIds, onUpdateIssue],
  );

  const [swimlaneMode, setSwimlaneMode] = useState<SwimlaneMode>(() => {
    try {
      return (localStorage.getItem("kanban:swimlaneMode") as SwimlaneMode) ?? "none";
    } catch {
      return "none";
    }
  });

  const { openNewIssue } = useDialog();

  const wipLimits = useMemo(() => getWipLimits(), []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
  const groupByStatus = useCallback((laneIssues: Issue[]): Record<string, Issue[]> => {
    const grouped: Record<string, Issue[]> = {};
    for (const status of BOARD_STATUSES) {
      grouped[status] = [];
    }
    for (const issue of laneIssues) {
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
  }, []);

  const activeIssue = useMemo(() => (activeId ? issues.find((i) => i.id === activeId) : null), [activeId, issues]);

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

  /* ---- Keyboard-accessible drag & drop ---- */
  const boardRef = useRef<HTMLDivElement>(null);
  const [kbDragId, setKbDragId] = useState<string | null>(null);
  const [kbDragCol, setKbDragCol] = useState<number | null>(null);

  const cancelKbDrag = useCallback(() => {
    setKbDragId(null);
    setKbDragCol(null);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!boardRef.current?.contains(document.activeElement)) return;

      if (e.key === "Escape" && kbDragId) {
        e.preventDefault();
        cancelKbDrag();
        return;
      }

      const cards = boardRef.current.querySelectorAll<HTMLElement>("[data-kanban-card]");
      if (cards.length === 0) return;

      const currentIndex = Array.from(cards).findIndex(
        (el) => el === document.activeElement || el.contains(document.activeElement),
      );

      if (kbDragId && kbDragCol !== null) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          const newCol = Math.max(0, kbDragCol - 1);
          setKbDragCol(newCol);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          const newCol = Math.min(BOARD_STATUSES.length - 1, kbDragCol + 1);
          setKbDragCol(newCol);
        } else if (e.key === "Enter") {
          e.preventDefault();
          const targetStatus = BOARD_STATUSES[kbDragCol];
          const draggedIssue = issues.find((i) => i.id === kbDragId);
          if (draggedIssue && targetStatus && targetStatus !== draggedIssue.status) {
            onUpdateIssue(kbDragId, { status: targetStatus });
          }
          cancelKbDrag();
        }
        return;
      }

      if (e.key === "ArrowDown" && currentIndex < cards.length - 1) {
        e.preventDefault();
        cards[currentIndex + 1]?.focus();
      } else if (e.key === "ArrowUp" && currentIndex > 0) {
        e.preventDefault();
        cards[currentIndex - 1]?.focus();
      } else if (e.key === "Enter" && currentIndex >= 0) {
        e.preventDefault();
        const cardEl = cards[currentIndex];
        const issueId = cardEl?.getAttribute("data-kanban-card");
        if (issueId) {
          const issue = issues.find((i) => i.id === issueId);
          if (issue) {
            const colIdx = BOARD_STATUSES.indexOf(issue.status as BoardStatus);
            setKbDragId(issueId);
            setKbDragCol(colIdx >= 0 ? colIdx : 0);
          }
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [kbDragId, kbDragCol, issues, onUpdateIssue, cancelKbDrag]);

  return (
    <div ref={boardRef} className="space-y-3">
      {goalInfo && <GoalBoardHeader goalInfo={goalInfo} />}

      <div className="flex items-center gap-3">
        <SwimlaneToggle mode={swimlaneMode} onChange={setSwimlaneMode} />
      </div>

      <BulkOperationsBar
        selectedCount={selectedIds.size}
        agents={agents}
        onChangeStatus={handleBulkStatus}
        onChangeAssignee={handleBulkAssignee}
        onChangePriority={handleBulkPriority}
        onClear={() => setSelectedIds(new Set())}
      />

      {kbDragId && kbDragCol !== null && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-sm">
          <span className="font-medium">Moving card with keyboard</span>
          <span className="text-muted-foreground">
            Target: <strong>{statusLabel(BOARD_STATUSES[kbDragCol])}</strong>
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            Left/Right to move, Enter to drop, Escape to cancel
          </span>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {swimlanes.map((lane) => {
          const laneCollapsed = collapsedLanes.has(lane.key);
          const columnGroups = groupByStatus(lane.issues);

          return (
            <div key={lane.key}>
              {swimlaneMode !== "none" && (
                <SwimlaneHeader
                  label={lane.label}
                  count={lane.issues.length}
                  collapsed={laneCollapsed}
                  onToggle={() => toggleLane(lane.key)}
                />
              )}

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
          {activeIssue ? <KanbanCard issue={activeIssue} agents={agents} isOverlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

import { memo, useMemo } from "react";
import { Link } from "@/lib/router";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { PriorityIcon } from "./PriorityIcon";
import { Identity } from "./Identity";
import { cn } from "../lib/utils";
import { Calendar, Link2, AlertTriangle } from "lucide-react";
import { pickTextColorForPillBg } from "@/lib/color-contrast";
import type { Issue, IssueLabel } from "@ironworksai/shared";

/* ── Priority dot colors ── */

const priorityDot: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-amber-500",
  medium: "bg-blue-500",
  low: "bg-gray-400",
};

const priorityBorder: Record<string, string> = {
  critical: "border-l-red-500",
  high: "border-l-amber-500",
  medium: "border-l-blue-500",
  low: "border-l-gray-400",
};

/* ── Date helpers ── */

function daysUntil(date: Date | string): number {
  const target = new Date(date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDueLabel(date: Date | string): string {
  const days = daysUntil(date);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days}d`;
}

/* ── Agent type ── */

interface Agent {
  id: string;
  name: string;
}

/* ── Props ── */

export interface KanbanCardProps {
  issue: Issue;
  agents?: Agent[];
  isLive?: boolean;
  isOverlay?: boolean;
  isBlocked?: boolean;
}

/* ── Component ── */

export const KanbanCard = memo(function KanbanCard({
  issue,
  agents,
  isLive,
  isOverlay,
  isBlocked,
}: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: issue.id, data: { issue } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const agentName = useMemo(() => {
    if (!issue.assigneeAgentId || !agents) return null;
    return agents.find((a) => a.id === issue.assigneeAgentId)?.name ?? null;
  }, [issue.assigneeAgentId, agents]);

  const targetDate = issue.targetDate;
  const daysLeft = targetDate ? daysUntil(targetDate) : null;
  const isOverdue = daysLeft !== null && daysLeft < 0;
  const isDueSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;

  const labels = issue.labels ?? [];

  // Card background tint for overdue / due-soon
  const cardBg = isOverdue
    ? "bg-red-500/10 border-l-red-500"
    : isDueSoon
      ? "bg-amber-500/10"
      : "";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-kanban-card={issue.id}
      tabIndex={0}
      className={cn(
        "bg-card rounded-lg border border-border p-3 shadow-sm transition-all cursor-grab active:cursor-grabbing border-l-2 focus:outline-2 focus:outline-primary/50 focus:outline-offset-1",
        priorityBorder[issue.priority] ?? "border-l-gray-400",
        cardBg,
        isDragging && !isOverlay && "opacity-30",
        isOverlay && "shadow-lg scale-[1.02] ring-1 ring-primary/20",
        !isOverlay && "hover:shadow-md",
        isBlocked && "border-dashed opacity-80",
      )}
    >
      <Link
        to={`/issues/${issue.identifier ?? issue.id}`}
        className="block no-underline text-inherit"
        onClick={(e) => {
          if (isDragging) e.preventDefault();
        }}
      >
        {/* Row 1: Priority dot + identifier + live indicator */}
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full shrink-0",
              priorityDot[issue.priority] ?? "bg-gray-400",
            )}
          />
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {issue.identifier ?? issue.id.slice(0, 8)}
          </span>
          {isLive && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
          )}
          {isBlocked && (
            <AlertTriangle className="h-3 w-3 text-amber-500 ml-auto shrink-0" />
          )}
        </div>

        {/* Row 2: Title */}
        <p className="text-sm leading-snug line-clamp-2 mb-2">{issue.title}</p>

        {/* Row 3: Assignee */}
        {agentName && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <Identity name={agentName} size="xs" />
          </div>
        )}

        {/* Row 4: Due date + project */}
        {(targetDate || issue.project) && (
          <div className="flex items-center gap-2 mb-1.5 text-xs">
            {targetDate && (
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  isOverdue
                    ? "text-red-500"
                    : isDueSoon
                      ? "text-amber-500"
                      : "text-muted-foreground",
                )}
              >
                <Calendar className="h-3 w-3" />
                {formatDueLabel(targetDate)}
              </span>
            )}
            {issue.project && (
              <span className="text-muted-foreground/60 truncate ml-auto">
                {issue.project.name}
              </span>
            )}
          </div>
        )}

        {/* Row 5: Labels */}
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {labels.slice(0, 3).map((label: IssueLabel) => (
              <span
                key={label.id}
                className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded-full leading-none font-medium"
                style={{
                  backgroundColor: `${label.color}36`,
                  color: pickTextColorForPillBg(label.color, 0.22),
                }}
              >
                {label.name}
              </span>
            ))}
            {labels.length > 3 && (
              <span className="text-[10px] text-muted-foreground/60">
                +{labels.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Row 6: Blocked-by indicator */}
        {isBlocked && issue.status === "blocked" && (
          <div className="flex items-center gap-1 text-[11px] text-amber-500">
            <Link2 className="h-3 w-3" />
            <span>Blocked</span>
          </div>
        )}
      </Link>
    </div>
  );
});

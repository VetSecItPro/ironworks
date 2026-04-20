import type { Goal } from "@ironworksai/shared";
import { Calendar, Plus, Target, X } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "../../lib/utils";
import { StatusBadge } from "../StatusBadge";

const projectStatuses = [
  { value: "backlog", label: "Backlog" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

interface ProjectPropertyChipsProps {
  status: string;
  setStatus: (v: string) => void;
  goalIds: string[];
  setGoalIds: React.Dispatch<React.SetStateAction<string[]>>;
  goals: Goal[];
  targetDate: string;
  setTargetDate: (v: string) => void;
}

export function ProjectPropertyChips({
  status,
  setStatus,
  goalIds,
  setGoalIds,
  goals,
  targetDate,
  setTargetDate,
}: ProjectPropertyChipsProps) {
  const [statusOpen, setStatusOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);

  const selectedGoals = goals.filter((g) => goalIds.includes(g.id));
  const availableGoals = goals.filter((g) => !goalIds.includes(g.id));

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border flex-wrap">
      <Popover open={statusOpen} onOpenChange={setStatusOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors"
          >
            <StatusBadge status={status} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-40 p-1" align="start">
          {projectStatuses.map((s) => (
            <button
              type="button"
              key={s.value}
              className={cn(
                "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                s.value === status && "bg-accent",
              )}
              onClick={() => {
                setStatus(s.value);
                setStatusOpen(false);
              }}
            >
              {s.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {selectedGoals.map((goal) => (
        <span
          key={goal.id}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"
        >
          <Target className="h-3 w-3 text-muted-foreground" />
          <span className="max-w-[160px] truncate">{goal.title}</span>
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setGoalIds((prev) => prev.filter((id) => id !== goal.id))}
            aria-label={`Remove goal ${goal.title}`}
            type="button"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      <Popover open={goalOpen} onOpenChange={setGoalOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors disabled:opacity-60"
            disabled={selectedGoals.length > 0 && availableGoals.length === 0}
          >
            {selectedGoals.length > 0 ? (
              <Plus className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Target className="h-3 w-3 text-muted-foreground" />
            )}
            {selectedGoals.length > 0 ? "+ Goal" : "Goal"}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1" align="start">
          {selectedGoals.length === 0 && (
            <button
              type="button"
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-muted-foreground"
              onClick={() => setGoalOpen(false)}
            >
              No goal
            </button>
          )}
          {availableGoals.map((g) => (
            <button
              type="button"
              key={g.id}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 truncate"
              onClick={() => {
                setGoalIds((prev) => [...prev, g.id]);
                setGoalOpen(false);
              }}
            >
              {g.title}
            </button>
          ))}
          {selectedGoals.length > 0 && availableGoals.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">All goals already selected.</div>
          )}
        </PopoverContent>
      </Popover>

      <div className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs">
        <Calendar className="h-3 w-3 text-muted-foreground" />
        <input
          type="date"
          className="bg-transparent outline-none text-xs w-24"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          placeholder="Target date"
        />
      </div>
    </div>
  );
}

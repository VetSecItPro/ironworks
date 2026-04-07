import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckSquare, ClipboardCheck, Plus, Square, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";

export interface Milestone {
  id: string;
  title: string;
  targetDate: string;
  completed: boolean;
}

export function useMilestones(goalId: string) {
  const key = `ironworks:milestones:${goalId}`;
  const [milestones, setMilestones] = useState<Milestone[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "[]");
    } catch {
      return [];
    }
  });

  const save = useCallback(
    (ms: Milestone[]) => {
      setMilestones(ms);
      try {
        localStorage.setItem(key, JSON.stringify(ms));
      } catch {
        // ignore
      }
    },
    [key],
  );

  const add = useCallback(
    (title: string, targetDate: string) => {
      const ms = [...milestones, { id: crypto.randomUUID(), title, targetDate, completed: false }];
      save(ms);
    },
    [milestones, save],
  );

  const toggle = useCallback(
    (id: string) => {
      const ms = milestones.map((m) => (m.id === id ? { ...m, completed: !m.completed } : m));
      save(ms);
    },
    [milestones, save],
  );

  const remove = useCallback(
    (id: string) => {
      save(milestones.filter((m) => m.id !== id));
    },
    [milestones, save],
  );

  return { milestones, add, toggle, remove };
}

export function MilestonesSection({
  milestonesHook,
}: {
  milestonesHook: ReturnType<typeof useMilestones>;
}) {
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDate, setMilestoneDate] = useState("");

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <ClipboardCheck className="h-3.5 w-3.5" />
          Milestones
        </h4>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowMilestoneForm(true)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>

      {showMilestoneForm && (
        <div className="flex items-center gap-2">
          <Input
            placeholder="Milestone title..."
            value={milestoneTitle}
            onChange={(e) => setMilestoneTitle(e.target.value)}
            className="text-xs"
            autoFocus
          />
          <Input
            type="date"
            value={milestoneDate}
            onChange={(e) => setMilestoneDate(e.target.value)}
            className="w-auto text-xs"
          />
          <Button
            size="sm"
            disabled={!milestoneTitle.trim()}
            onClick={() => {
              milestonesHook.add(milestoneTitle.trim(), milestoneDate);
              setMilestoneTitle("");
              setMilestoneDate("");
              setShowMilestoneForm(false);
            }}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setShowMilestoneForm(false); setMilestoneTitle(""); }}
          >
            Cancel
          </Button>
        </div>
      )}

      {milestonesHook.milestones.length === 0 && !showMilestoneForm ? (
        <p className="text-sm text-muted-foreground">No milestones defined yet.</p>
      ) : (
        <div className="space-y-1">
          {milestonesHook.milestones.map((ms) => (
            <div key={ms.id} className="flex items-center gap-2 py-1">
              <button
                onClick={() => milestonesHook.toggle(ms.id)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {ms.completed ? (
                  <CheckSquare className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>
              <span className={cn("text-sm flex-1", ms.completed && "line-through text-muted-foreground")}>
                {ms.title}
              </span>
              {ms.targetDate && (
                <span className="text-[10px] text-muted-foreground">
                  {new Date(ms.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
              <button
                onClick={() => milestonesHook.remove(ms.id)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

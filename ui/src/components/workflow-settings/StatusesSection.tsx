import { useState } from "react";
import { Plus, Save, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "../../lib/utils";
import { StatusRow } from "./StatusRow";
import type { CustomStatus } from "./workflowTypes";
import { COLOR_OPTIONS, generateId } from "./workflowTypes";

interface StatusesSectionProps {
  statuses: CustomStatus[];
  onPersist: (next: CustomStatus[]) => void;
  onToast: (msg: string) => void;
}

export function StatusesSection({ statuses, onPersist, onToast }: StatusesSectionProps) {
  const [newStatusLabel, setNewStatusLabel] = useState("");
  const [newStatusCategory, setNewStatusCategory] = useState<"open" | "closed">("open");
  const [showNewStatus, setShowNewStatus] = useState(false);

  function addStatus() {
    if (!newStatusLabel.trim()) return;
    const next: CustomStatus[] = [
      ...statuses,
      {
        id: generateId(),
        label: newStatusLabel.trim(),
        category: newStatusCategory,
        color: COLOR_OPTIONS[Math.floor(Math.random() * COLOR_OPTIONS.length)],
        isDefault: false,
      },
    ];
    onPersist(next);
    setNewStatusLabel("");
    setShowNewStatus(false);
    onToast("Status added");
  }

  function moveStatus(idx: number, direction: -1 | 1) {
    const next = [...statuses];
    const target = idx + direction;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onPersist(next);
  }

  const openCount = statuses.filter((s) => s.category === "open").length;
  const closedCount = statuses.filter((s) => s.category === "closed").length;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Issue Statuses</h2>
          <span className="text-[10px] text-muted-foreground">
            {openCount} open, {closedCount} closed
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowNewStatus(true)}>
          <Plus className="h-3 w-3 mr-1" />
          Add Status
        </Button>
      </div>

      <div className="space-y-0">
        {statuses.map((status, idx) => (
          <StatusRow
            key={status.id}
            status={status}
            onUpdate={(updated) => {
              const next = statuses.map((s) => s.id === updated.id ? updated : s);
              onPersist(next);
            }}
            onDelete={() => {
              onPersist(statuses.filter((s) => s.id !== status.id));
              onToast(`Status "${status.label}" removed`);
            }}
            onMoveUp={() => moveStatus(idx, -1)}
            onMoveDown={() => moveStatus(idx, 1)}
            isFirst={idx === 0}
            isLast={idx === statuses.length - 1}
          />
        ))}
      </div>

      {showNewStatus && (
        <div className="mt-3 p-3 rounded-md bg-muted/30 border border-border space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={newStatusLabel}
              onChange={(e) => setNewStatusLabel(e.target.value)}
              placeholder="Status name"
              className="h-7 text-xs flex-1"
              onKeyDown={(e) => { if (e.key === "Enter") addStatus(); }}
              autoFocus
            />
            <select
              value={newStatusCategory}
              onChange={(e) => setNewStatusCategory(e.target.value as "open" | "closed")}
              className="h-7 text-xs bg-background border border-border rounded px-2"
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowNewStatus(false)}>Cancel</Button>
            <Button size="sm" onClick={addStatus} disabled={!newStatusLabel.trim()}>
              <Save className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
        </div>
      )}

      {/* Category mapping summary */}
      <div className="mt-4 pt-3 border-t border-border">
        <h3 className="text-xs font-medium text-muted-foreground mb-2">Status Category Mapping</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">Open</p>
            <div className="space-y-0.5">
              {statuses.filter((s) => s.category === "open").map((s) => (
                <div key={s.id} className="flex items-center gap-1.5 text-xs">
                  <div className={cn("h-2 w-2 rounded-full", s.color)} />
                  {s.label}
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-medium text-green-600 dark:text-green-400 uppercase tracking-wider mb-1">Closed</p>
            <div className="space-y-0.5">
              {statuses.filter((s) => s.category === "closed").map((s) => (
                <div key={s.id} className="flex items-center gap-1.5 text-xs">
                  <div className={cn("h-2 w-2 rounded-full", s.color)} />
                  {s.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

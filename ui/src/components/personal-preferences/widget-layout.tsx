import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GripVertical, LayoutGrid, Eye, EyeOff, RotateCcw } from "lucide-react";
import { cn } from "../../lib/utils";

const PREFIX = "ironworks:prefs";
const LAYOUT_KEY = `${PREFIX}:dashboard-layout`;

export interface WidgetConfig {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "metrics", label: "Key Metrics", visible: true, order: 0 },
  { id: "active-agents", label: "Active Agents", visible: true, order: 1 },
  { id: "recent-issues", label: "Recent Issues", visible: true, order: 2 },
  { id: "charts", label: "Charts", visible: true, order: 3 },
  { id: "activity", label: "Activity Feed", visible: true, order: 4 },
  { id: "goals", label: "Goal Progress", visible: true, order: 5 },
  { id: "velocity", label: "Velocity", visible: true, order: 6 },
  { id: "alerts", label: "Alerts", visible: true, order: 7 },
];

export function loadWidgetLayout(): WidgetConfig[] {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as WidgetConfig[];
      const savedMap = new Map(saved.map((w) => [w.id, w]));
      return DEFAULT_WIDGETS.map((def) => savedMap.get(def.id) ?? def)
        .sort((a, b) => a.order - b.order);
    }
  } catch { /* ignore */ }
  return DEFAULT_WIDGETS;
}

export function saveWidgetLayout(widgets: WidgetConfig[]) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(widgets));
  } catch { /* ignore */ }
}

interface WidgetLayoutEditorProps {
  widgets: WidgetConfig[];
  onChange: (widgets: WidgetConfig[]) => void;
}

export function WidgetLayoutEditor({ widgets, onChange }: WidgetLayoutEditorProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function toggleWidget(id: string) {
    onChange(widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)));
  }

  function moveWidget(fromIndex: number, toIndex: number) {
    const next = [...widgets];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange(next.map((w, i) => ({ ...w, order: i })));
  }

  function resetLayout() {
    onChange(DEFAULT_WIDGETS);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Dashboard Widgets</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={resetLayout} className="h-7 text-xs">
          <RotateCcw className="h-3 w-3 mr-1" />
          Reset
        </Button>
      </div>
      <div className="space-y-1">
        {widgets.map((widget, index) => (
          <div
            key={widget.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== index) {
                moveWidget(dragIndex, index);
                setDragIndex(index);
              }
            }}
            onDragEnd={() => setDragIndex(null)}
            className={cn(
              "flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-grab active:cursor-grabbing transition-colors",
              dragIndex === index && "border-primary bg-primary/5",
              !widget.visible && "opacity-50",
            )}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="flex-1 text-sm">{widget.label}</span>
            <button
              type="button"
              onClick={() => toggleWidget(widget.id)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title={widget.visible ? "Hide widget" : "Show widget"}
            >
              {widget.visible ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

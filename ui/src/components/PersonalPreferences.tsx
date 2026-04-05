import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Check,
  GripVertical,
  Palette,
  Minimize2,
  Maximize2,
  LayoutGrid,
  Eye,
  EyeOff,
  Save,
  RotateCcw,
} from "lucide-react";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const PREFIX = "ironworks:prefs";
const LAYOUT_KEY = `${PREFIX}:dashboard-layout`;
const VIEW_PREFS_KEY = `${PREFIX}:view-prefs`;
const SAVED_FILTERS_KEY = `${PREFIX}:saved-filters`;
const ACCENT_KEY = `${PREFIX}:accent-color`;
const COMPACT_KEY = `${PREFIX}:compact-mode`;
const SIDEBAR_WIDTH_KEY = `${PREFIX}:sidebar-width`;

// ---------------------------------------------------------------------------
// Dashboard Widget Layout
// ---------------------------------------------------------------------------

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
      // Merge with defaults to pick up new widgets
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

// ---------------------------------------------------------------------------
// Default View Preferences
// ---------------------------------------------------------------------------

export interface ViewPreference {
  page: string;
  viewMode?: "list" | "board" | "grid";
  sortField?: string;
  sortDir?: "asc" | "desc";
  groupBy?: string;
}

export function loadViewPrefs(): Record<string, ViewPreference> {
  try {
    const raw = localStorage.getItem(VIEW_PREFS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, ViewPreference>;
  } catch { /* ignore */ }
  return {};
}

export function saveViewPref(page: string, pref: Partial<ViewPreference>) {
  const prefs = loadViewPrefs();
  prefs[page] = { ...prefs[page], page, ...pref };
  try {
    localStorage.setItem(VIEW_PREFS_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

export function getViewPref(page: string): ViewPreference | null {
  return loadViewPrefs()[page] ?? null;
}

// ---------------------------------------------------------------------------
// Saved Filters (per user)
// ---------------------------------------------------------------------------

export interface SavedFilter {
  id: string;
  name: string;
  page: string;
  filters: Record<string, unknown>;
  createdAt: string;
  isGlobal: boolean;
}

export function loadSavedFilters(page?: string): SavedFilter[] {
  try {
    const raw = localStorage.getItem(SAVED_FILTERS_KEY);
    if (raw) {
      const all = JSON.parse(raw) as SavedFilter[];
      return page ? all.filter((f) => f.page === page) : all;
    }
  } catch { /* ignore */ }
  return [];
}

export function saveSavedFilter(filter: Omit<SavedFilter, "id" | "createdAt">) {
  const all = loadSavedFilters();
  const newFilter: SavedFilter = {
    ...filter,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  all.push(newFilter);
  try {
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
  return newFilter;
}

export function deleteSavedFilter(id: string) {
  const all = loadSavedFilters();
  const next = all.filter((f) => f.id !== id);
  try {
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

interface SavedFiltersBarProps {
  page: string;
  onApply: (filters: Record<string, unknown>) => void;
  currentFilters?: Record<string, unknown>;
}

export function SavedFiltersBar({ page, onApply, currentFilters }: SavedFiltersBarProps) {
  const [filters, setFilters] = useState<SavedFilter[]>(() => loadSavedFilters(page));
  const [showSave, setShowSave] = useState(false);
  const [filterName, setFilterName] = useState("");

  function handleSave() {
    if (!filterName.trim() || !currentFilters) return;
    const saved = saveSavedFilter({
      name: filterName.trim(),
      page,
      filters: currentFilters,
      isGlobal: false,
    });
    setFilters((prev) => [...prev, saved]);
    setFilterName("");
    setShowSave(false);
  }

  function handleDelete(id: string) {
    deleteSavedFilter(id);
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {filters.map((f) => (
        <div key={f.id} className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onApply(f.filters)}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors"
          >
            {f.name}
          </button>
          <button
            type="button"
            onClick={() => handleDelete(f.id)}
            className="text-muted-foreground hover:text-destructive text-[10px] px-0.5"
            title="Delete filter"
          >
            x
          </button>
        </div>
      ))}

      {showSave ? (
        <div className="flex items-center gap-1">
          <Input
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            placeholder="Filter name..."
            className="h-6 w-32 text-xs"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setShowSave(false); }}
          />
          <Button variant="ghost" size="sm" onClick={handleSave} className="h-6 text-xs px-1.5">
            <Check className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        currentFilters && Object.keys(currentFilters).length > 0 && (
          <button
            type="button"
            onClick={() => setShowSave(true)}
            className="flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <Save className="h-3 w-3" />
            Save filter
          </button>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Theme Accent Color Picker
// ---------------------------------------------------------------------------

const ACCENT_COLORS = [
  { name: "Blue", value: "210 100% 50%" },
  { name: "Purple", value: "270 70% 55%" },
  { name: "Green", value: "142 70% 45%" },
  { name: "Orange", value: "24 95% 53%" },
  { name: "Red", value: "0 72% 51%" },
  { name: "Teal", value: "180 60% 40%" },
  { name: "Pink", value: "330 80% 60%" },
  { name: "Amber", value: "40 96% 50%" },
];

export function loadAccentColor(): string | null {
  try {
    return localStorage.getItem(ACCENT_KEY);
  } catch {
    return null;
  }
}

export function applyAccentColor(hsl: string | null) {
  if (!hsl) {
    document.documentElement.style.removeProperty("--primary");
    return;
  }
  document.documentElement.style.setProperty("--primary", hsl);
}

export function AccentColorPicker() {
  const [selected, setSelected] = useState<string | null>(loadAccentColor);

  function selectColor(hsl: string | null) {
    setSelected(hsl);
    applyAccentColor(hsl);
    try {
      if (hsl) {
        localStorage.setItem(ACCENT_KEY, hsl);
      } else {
        localStorage.removeItem(ACCENT_KEY);
      }
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Palette className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Accent Color</h3>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => selectColor(null)}
          className={cn(
            "h-8 w-8 rounded-full border-2 transition-all flex items-center justify-center",
            selected === null ? "border-foreground scale-110" : "border-border",
          )}
          title="Default"
        >
          <RotateCcw className="h-3 w-3 text-muted-foreground" />
        </button>
        {ACCENT_COLORS.map((color) => (
          <button
            key={color.name}
            type="button"
            onClick={() => selectColor(color.value)}
            className={cn(
              "h-8 w-8 rounded-full border-2 transition-all",
              selected === color.value ? "border-foreground scale-110" : "border-transparent",
            )}
            style={{ backgroundColor: `hsl(${color.value})` }}
            title={color.name}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact Mode
// ---------------------------------------------------------------------------

export function isCompactMode(): boolean {
  try {
    return localStorage.getItem(COMPACT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setCompactMode(enabled: boolean) {
  try {
    localStorage.setItem(COMPACT_KEY, enabled ? "1" : "0");
  } catch { /* ignore */ }
  if (enabled) {
    document.documentElement.classList.add("compact");
  } else {
    document.documentElement.classList.remove("compact");
  }
}

export function CompactModeToggle() {
  const [compact, setCompact] = useState(isCompactMode);

  function toggle() {
    const next = !compact;
    setCompact(next);
    setCompactMode(next);
  }

  return (
    <Button variant={compact ? "secondary" : "ghost"} size="sm" onClick={toggle} className="gap-1.5 text-xs">
      {compact ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      {compact ? "Compact" : "Comfortable"}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Sidebar Width Preference
// ---------------------------------------------------------------------------

export function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (raw) return Number(raw);
  } catch { /* ignore */ }
  return 240; // default 15rem = 240px
}

export function saveSidebarWidth(width: number) {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  } catch { /* ignore */ }
}

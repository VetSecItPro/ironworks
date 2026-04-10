import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Palette, Minimize2, Maximize2, RotateCcw } from "lucide-react";
import { cn } from "../../lib/utils";

const PREFIX = "ironworks:prefs";
const ACCENT_KEY = `${PREFIX}:accent-color`;
const COMPACT_KEY = `${PREFIX}:compact-mode`;
const VIEW_PREFS_KEY = `${PREFIX}:view-prefs`;
const SIDEBAR_WIDTH_KEY = `${PREFIX}:sidebar-width`;

// ---------------------------------------------------------------------------
// View Preferences
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
  try { return localStorage.getItem(ACCENT_KEY); }
  catch { return null; }
}

export function applyAccentColor(hsl: string | null) {
  if (!hsl) { document.documentElement.style.removeProperty("--primary"); return; }
  document.documentElement.style.setProperty("--primary", hsl);
}

export function AccentColorPicker() {
  const [selected, setSelected] = useState<string | null>(loadAccentColor);

  function selectColor(hsl: string | null) {
    setSelected(hsl);
    applyAccentColor(hsl);
    try {
      if (hsl) localStorage.setItem(ACCENT_KEY, hsl);
      else localStorage.removeItem(ACCENT_KEY);
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
  try { return localStorage.getItem(COMPACT_KEY) === "1"; }
  catch { return false; }
}

export function setCompactMode(enabled: boolean) {
  try { localStorage.setItem(COMPACT_KEY, enabled ? "1" : "0"); }
  catch { /* ignore */ }
  if (enabled) document.documentElement.classList.add("compact");
  else document.documentElement.classList.remove("compact");
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
  return 240;
}

export function saveSidebarWidth(width: number) {
  try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width)); }
  catch { /* ignore */ }
}

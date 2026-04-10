import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Save } from "lucide-react";

const PREFIX = "ironworks:prefs";
const SAVED_FILTERS_KEY = `${PREFIX}:saved-filters`;

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

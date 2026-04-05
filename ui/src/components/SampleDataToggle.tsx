import { useState } from "react";
import { Database, ToggleLeft, ToggleRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Sample Data Mode
// ---------------------------------------------------------------------------

const SAMPLE_DATA_KEY = "ironworks:sample-data-mode";

export function isSampleDataMode(): boolean {
  try {
    return localStorage.getItem(SAMPLE_DATA_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSampleDataMode(enabled: boolean) {
  try {
    if (enabled) {
      localStorage.setItem(SAMPLE_DATA_KEY, "1");
    } else {
      localStorage.removeItem(SAMPLE_DATA_KEY);
    }
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Toggle Component
// ---------------------------------------------------------------------------

export function SampleDataToggle() {
  const [enabled, setEnabled] = useState(isSampleDataMode);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    setSampleDataMode(next);
    // Reload to apply sample data
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-accent/50"
      title={enabled ? "Disable demo data" : "Explore with demo data"}
    >
      <Database className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground">Demo Data</span>
      {enabled ? (
        <ToggleRight className="h-5 w-5 text-primary" />
      ) : (
        <ToggleLeft className="h-5 w-5 text-muted-foreground" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Banner (shown when sample data is active)
// ---------------------------------------------------------------------------

export function SampleDataBanner() {
  const [enabled, setEnabled] = useState(isSampleDataMode);

  if (!enabled) return null;

  function disable() {
    setSampleDataMode(false);
    setEnabled(false);
    window.location.reload();
  }

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 flex items-center justify-center gap-2 text-xs text-amber-700 dark:text-amber-400">
      <Database className="h-3.5 w-3.5" />
      <span>You are viewing demo data.</span>
      <button
        type="button"
        onClick={disable}
        className="underline hover:no-underline font-medium"
      >
        Switch to real data
      </button>
    </div>
  );
}

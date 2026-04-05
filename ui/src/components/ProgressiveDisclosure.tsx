import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Power Mode Context
// ---------------------------------------------------------------------------

const POWER_MODE_KEY = "ironworks:power-mode";

function loadPowerMode(): boolean {
  try {
    return localStorage.getItem(POWER_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

function savePowerMode(enabled: boolean) {
  try {
    localStorage.setItem(POWER_MODE_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}

interface PowerModeContextValue {
  powerMode: boolean;
  setPowerMode: (enabled: boolean) => void;
  togglePowerMode: () => void;
}

const PowerModeContext = createContext<PowerModeContextValue | null>(null);

export function PowerModeProvider({ children }: { children: ReactNode }) {
  const [powerMode, setPowerModeState] = useState(loadPowerMode);

  const setPowerMode = useCallback((enabled: boolean) => {
    setPowerModeState(enabled);
    savePowerMode(enabled);
  }, []);

  const togglePowerMode = useCallback(() => {
    setPowerModeState((prev) => {
      const next = !prev;
      savePowerMode(next);
      return next;
    });
  }, []);

  return (
    <PowerModeContext.Provider value={{ powerMode, setPowerMode, togglePowerMode }}>
      {children}
    </PowerModeContext.Provider>
  );
}

export function usePowerMode() {
  const ctx = useContext(PowerModeContext);
  if (!ctx) {
    throw new Error("usePowerMode must be used within PowerModeProvider");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Power Feature Gate - only renders children in power mode
// ---------------------------------------------------------------------------

interface PowerFeatureProps {
  children: ReactNode;
  /** Optional fallback to show in simplified mode */
  fallback?: ReactNode;
}

export function PowerFeature({ children, fallback = null }: PowerFeatureProps) {
  const { powerMode } = usePowerMode();
  return <>{powerMode ? children : fallback}</>;
}

// ---------------------------------------------------------------------------
// Toggle Button
// ---------------------------------------------------------------------------

export function PowerModeToggle({ className }: { className?: string }) {
  const { powerMode, togglePowerMode } = usePowerMode();

  return (
    <Button
      variant={powerMode ? "secondary" : "ghost"}
      size="sm"
      onClick={togglePowerMode}
      className={cn("gap-1.5 text-xs", className)}
      title={powerMode ? "Switch to simplified view" : "Enable power features"}
    >
      <Layers className="h-3.5 w-3.5" />
      {powerMode ? "Power Mode" : "Simple Mode"}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Collapsible Advanced Section
// ---------------------------------------------------------------------------

interface AdvancedSectionProps {
  label?: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}

export function AdvancedSection({
  label = "Advanced options",
  children,
  className,
  defaultOpen = false,
}: AdvancedSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("border-t border-border pt-2", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {label}
      </button>
      {open && <div className="mt-2 space-y-3">{children}</div>}
    </div>
  );
}

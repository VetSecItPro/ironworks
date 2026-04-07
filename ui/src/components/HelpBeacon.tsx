import { useState, useRef, useEffect } from "react";
import { HelpCircle, X } from "lucide-react";
import { cn } from "../lib/utils";

interface HelpBeaconProps {
  text: string;
  className?: string;
}

export function HelpBeacon({ text, className }: HelpBeaconProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center h-4 w-4 rounded-full text-muted-foreground/80 hover:text-foreground hover:bg-muted/50 transition-colors"
        aria-label="Help"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg border border-border bg-popover px-3 py-2.5 shadow-lg animate-in fade-in slide-in-from-bottom-1 duration-200">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-popover-foreground leading-relaxed">{text}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="w-2 h-2 rotate-45 bg-popover border-r border-b border-border" />
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { SNOOZE_OPTIONS } from "./inboxSnoozeUtils";

export function SnoozeButton({
  itemKey,
  onSnooze,
}: {
  itemKey: string;
  onSnooze: (key: string, ms: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
        aria-label="Snooze"
        title="Snooze"
      >
        <Clock className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-border bg-popover p-1 shadow-md">
          {SNOOZE_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSnooze(itemKey, opt.ms);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors"
            >
              <Clock className="h-3 w-3 text-muted-foreground" />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

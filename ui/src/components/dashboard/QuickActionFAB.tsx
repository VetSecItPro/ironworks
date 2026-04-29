import { CircleDot, Play, Plus, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

export function QuickActionFAB({
  onCreateIssue,
  onInvokeAgent,
  onRunPlaybook,
}: {
  onCreateIssue: () => void;
  onInvokeAgent: () => void;
  onRunPlaybook: () => void;
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
    <div ref={ref} className="fixed bottom-6 right-6 z-40">
      {open && (
        <div className="absolute bottom-16 right-0 flex flex-col gap-2.5 items-end animate-in fade-in slide-in-from-bottom-3 duration-200">
          <button
            type="button"
            onClick={() => {
              onCreateIssue();
              setOpen(false);
            }}
            className="flex items-center gap-2 rounded-full bg-background border border-border px-4 py-2.5 text-sm font-medium shadow-xl hover:bg-accent hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-150 whitespace-nowrap"
          >
            <CircleDot className="h-3.5 w-3.5" />
            Create Mission
          </button>
          <button
            type="button"
            onClick={() => {
              onInvokeAgent();
              setOpen(false);
            }}
            className="flex items-center gap-2 rounded-full bg-background border border-border px-4 py-2.5 text-sm font-medium shadow-xl hover:bg-accent hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-150 whitespace-nowrap"
          >
            <Play className="h-3.5 w-3.5" />
            Invoke Agent
          </button>
          <button
            type="button"
            onClick={() => {
              onRunPlaybook();
              setOpen(false);
            }}
            className="flex items-center gap-2 rounded-full bg-background border border-border px-4 py-2.5 text-sm font-medium shadow-xl hover:bg-accent hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-150 whitespace-nowrap"
          >
            <Zap className="h-3.5 w-3.5" />
            Run Playbook
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center justify-center h-12 w-12 rounded-full shadow-xl transition-all duration-200",
          open
            ? "bg-foreground text-background rotate-45 shadow-2xl"
            : "bg-foreground text-background hover:scale-110 hover:shadow-2xl",
        )}
        aria-label="Quick actions"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

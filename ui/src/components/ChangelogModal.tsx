import { useState, useEffect } from "react";
import { Bell, Check, Gift, Wrench, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "../lib/utils";

/* ------------------------------------------------------------------ */
/*  Types & storage                                                    */
/* ------------------------------------------------------------------ */

interface ChangelogEntry {
  id: string;
  version: string;
  date: string;
  title: string;
  description: string;
  type: "feature" | "improvement" | "fix";
}

const CHANGELOG_READ_KEY = "ironworks.changelog-read-ids";

function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(CHANGELOG_READ_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

function markAllRead(entries: ChangelogEntry[]) {
  const ids = entries.map((e) => e.id);
  localStorage.setItem(CHANGELOG_READ_KEY, JSON.stringify(ids));
}

/* ------------------------------------------------------------------ */
/*  Changelog entries                                                  */
/* ------------------------------------------------------------------ */

const CHANGELOG: ChangelogEntry[] = [
  {
    id: "v0.12.70",
    version: "0.12.70",
    date: "2026-04-05",
    title: "Platform Health Dashboard",
    description: "New real-time system status page showing API, database, agent runtime, and integration health with performance metrics and auto-refresh.",
    type: "feature",
  },
  {
    id: "v0.12.63",
    version: "0.12.63",
    date: "2026-04-05",
    title: "SLA & Service Level Management",
    description: "Configure response and resolution time targets per priority level. Track compliance rates and SLA breaches with countdown timers on issues.",
    type: "feature",
  },
  {
    id: "v0.12.67",
    version: "0.12.67",
    date: "2026-04-05",
    title: "Advanced Playbook Features",
    description: "Conditional step logic with skip-on-failure toggles, playbook parameters for runtime variables, and dry-run simulation mode.",
    type: "improvement",
  },
  {
    id: "v0.12.74",
    version: "0.12.74",
    date: "2026-04-05",
    title: "Smart Priority Suggestions & Duplicate Detection",
    description: "AI-powered priority suggestions based on issue title keywords and automatic duplicate issue detection when creating new issues.",
    type: "feature",
  },
  {
    id: "v0.12.62",
    version: "0.12.62",
    date: "2026-04-05",
    title: "Custom Workflow & Status Configuration",
    description: "Define custom issue statuses beyond the defaults, map them to open/closed categories, and add custom fields (text, number, date, select) to issues.",
    type: "feature",
  },
];

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

const TYPE_CONFIG: Record<ChangelogEntry["type"], { icon: React.ElementType; color: string; label: string }> = {
  feature: { icon: Gift, color: "text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40", label: "New" },
  improvement: { icon: Zap, color: "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40", label: "Improved" },
  fix: { icon: Wrench, color: "text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/40", label: "Fixed" },
};

function EntryCard({ entry, isNew }: { entry: ChangelogEntry; isNew: boolean }) {
  const cfg = TYPE_CONFIG[entry.type];
  const Icon = cfg.icon;
  return (
    <div className={cn(
      "rounded-lg border border-border p-4 transition-colors",
      isNew && "ring-1 ring-primary/30 bg-primary/5",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium", cfg.color)}>
            <Icon className="h-3 w-3" />
            {cfg.label}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">v{entry.version}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">{entry.date}</span>
      </div>
      <h3 className="text-sm font-semibold mt-2">{entry.title}</h3>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{entry.description}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook: unread changelog count                                       */
/* ------------------------------------------------------------------ */

export function useChangelogUnread(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const readIds = getReadIds();
    setCount(CHANGELOG.filter((e) => !readIds.has(e.id)).length);
  }, []);
  return count;
}

/* ------------------------------------------------------------------ */
/*  Trigger button (for header/footer)                                 */
/* ------------------------------------------------------------------ */

export function ChangelogTrigger({ onClick }: { onClick: () => void }) {
  const unread = useChangelogUnread();
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative hover:text-foreground transition-colors"
    >
      What&apos;s New
      {unread > 0 && (
        <span className="absolute -top-1.5 -right-2 h-3.5 min-w-[14px] rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center px-0.5">
          {unread}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Modal                                                              */
/* ------------------------------------------------------------------ */

export function ChangelogModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [readIds, setReadIds] = useState<Set<string>>(() => getReadIds());

  function handleMarkAllRead() {
    markAllRead(CHANGELOG);
    setReadIds(new Set(CHANGELOG.map((e) => e.id)));
  }

  // On close, persist reads
  useEffect(() => {
    if (!open) return;
    // Refresh read state when opening
    setReadIds(getReadIds());
  }, [open]);

  const unreadCount = CHANGELOG.filter((e) => !readIds.has(e.id)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            What&apos;s New
            {unreadCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-medium">
                {unreadCount} new
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {CHANGELOG.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              isNew={!readIds.has(entry.id)}
            />
          ))}
        </div>

        {unreadCount > 0 && (
          <div className="pt-3 border-t border-border">
            <Button size="sm" variant="outline" onClick={handleMarkAllRead} className="w-full">
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Mark all as read
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

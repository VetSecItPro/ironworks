import { ChevronRight, Play } from "lucide-react";
import type { Playbook } from "../../api/playbooks";
import { cn } from "../../lib/utils";

const CATEGORY_COLORS: Record<string, string> = {
  onboarding: "bg-green-500/10 text-green-600 dark:text-green-400",
  security: "bg-red-500/10 text-red-600 dark:text-red-400",
  engineering: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  operations: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  marketing: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  custom: "bg-muted text-muted-foreground",
};

export { CATEGORY_COLORS };

export function PlaybookCard({
  playbook,
  isSelected,
  onSelect,
}: {
  playbook: Playbook;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left p-3 border-b border-border transition-colors",
        isSelected ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium flex-1 truncate">{playbook.name}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <span
          className={cn(
            "inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium",
            CATEGORY_COLORS[playbook.category] ?? CATEGORY_COLORS.custom,
          )}
        >
          {playbook.category}
        </span>
        {playbook.runCount > 0 && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
            <Play className="h-3 w-3" />
            {playbook.runCount}x
          </span>
        )}
      </div>
      {playbook.description && (
        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
          {playbook.description}
        </p>
      )}
    </button>
  );
}

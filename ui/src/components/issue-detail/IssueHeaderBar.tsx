import { Check, Copy, EyeOff, Hexagon, MoreHorizontal, Repeat, SlidersHorizontal } from "lucide-react";
import { PriorityIcon } from "@/components/PriorityIcon";
import { StatusIcon } from "@/components/StatusIcon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { pickTextColorForPillBg } from "@/lib/color-contrast";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";

interface Label {
  id: string;
  name: string;
  color: string;
}

interface Project {
  id: string;
  name: string;
}

interface IssueHeaderBarProps {
  issueId: string;
  identifier: string | null;
  status: string;
  priority: string;
  projectId: string | null;
  projects: Project[];
  labels: Label[];
  hasLiveRuns: boolean;
  originKind: string | null;
  originId: string | null;
  panelVisible: boolean;
  copied: boolean;
  moreOpen: boolean;
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
  onCopy: () => void;
  onMobilePropsOpen: () => void;
  onPanelShow: () => void;
  onMoreOpenChange: (open: boolean) => void;
  onHide: () => void;
}

export function IssueHeaderBar({
  issueId,
  identifier,
  status,
  priority,
  projectId,
  projects,
  labels,
  hasLiveRuns,
  originKind,
  originId,
  panelVisible,
  copied,
  moreOpen,
  onStatusChange,
  onPriorityChange,
  onCopy,
  onMobilePropsOpen,
  onPanelShow,
  onMoreOpenChange,
  onHide,
}: IssueHeaderBarProps) {
  return (
    <div className="flex items-center gap-2 min-w-0 flex-wrap">
      <StatusIcon status={status} onChange={onStatusChange} />
      <PriorityIcon priority={priority} onChange={onPriorityChange} />
      <span className="text-sm font-mono text-muted-foreground shrink-0">{identifier ?? issueId.slice(0, 8)}</span>

      {hasLiveRuns && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-medium text-cyan-600 dark:text-cyan-400 shrink-0">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
          </span>
          Live
        </span>
      )}

      {originKind === "routine_execution" && originId && (
        <Link
          to={`/routines/${originId}`}
          className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 border border-violet-500/30 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400 shrink-0 hover:bg-violet-500/20 transition-colors"
        >
          <Repeat className="h-3 w-3" />
          Routine
        </Link>
      )}

      {projectId ? (
        <Link
          to={`/projects/${projectId}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded px-1 -mx-1 py-0.5 min-w-0"
        >
          <Hexagon className="h-3 w-3 shrink-0" />
          <span className="truncate">{projects.find((p) => p.id === projectId)?.name ?? projectId.slice(0, 8)}</span>
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground opacity-50 px-1 -mx-1 py-0.5">
          <Hexagon className="h-3 w-3 shrink-0" />
          No project
        </span>
      )}

      {labels.length > 0 && (
        <div className="hidden sm:flex items-center gap-1">
          {labels.slice(0, 4).map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
              style={{
                borderColor: label.color,
                color: pickTextColorForPillBg(label.color, 0.12),
                backgroundColor: `${label.color}1f`,
              }}
            >
              {label.name}
            </span>
          ))}
          {labels.length > 4 && <span className="text-[10px] text-muted-foreground">+{labels.length - 4}</span>}
        </div>
      )}

      <div className="ml-auto flex items-center gap-0.5 md:hidden shrink-0">
        <Button variant="ghost" size="icon-xs" onClick={onCopy} title="Copy mission as markdown">
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onMobilePropsOpen} title="Properties">
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </div>

      <div className="hidden md:flex items-center md:ml-auto shrink-0">
        <Button variant="ghost" size="icon-xs" onClick={onCopy} title="Copy mission as markdown">
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn(
            "shrink-0 transition-opacity duration-200",
            panelVisible ? "opacity-0 pointer-events-none w-0 overflow-hidden" : "opacity-100",
          )}
          onClick={onPanelShow}
          title="Show properties"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>

        <Popover open={moreOpen} onOpenChange={onMoreOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-xs" className="shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1" align="end">
            <button
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-destructive"
              onClick={onHide}
            >
              <EyeOff className="h-3 w-3" />
              Hide this Mission
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

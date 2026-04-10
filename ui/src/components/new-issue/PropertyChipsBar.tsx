import type { RefObject, ChangeEvent } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CircleDot,
  Minus,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Tag,
  Calendar,
  Paperclip,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { statuses, priorities, STAGED_FILE_ACCEPT } from "./constants";

const PRIORITY_ICONS = {
  AlertTriangle,
  ArrowUp,
  Minus,
  ArrowDown,
} as const;

interface PropertyChipsBarProps {
  status: string;
  setStatus: (status: string) => void;
  statusOpen: boolean;
  setStatusOpen: (open: boolean) => void;
  priority: string;
  setPriority: (priority: string) => void;
  priorityOpen: boolean;
  setPriorityOpen: (open: boolean) => void;
  moreOpen: boolean;
  setMoreOpen: (open: boolean) => void;
  isPending: boolean;
  stageFileInputRef: RefObject<HTMLInputElement | null>;
  handleStageFilesPicked: (evt: ChangeEvent<HTMLInputElement>) => void;
}

export function PropertyChipsBar({
  status,
  setStatus,
  statusOpen,
  setStatusOpen,
  priority,
  setPriority,
  priorityOpen,
  setPriorityOpen,
  moreOpen,
  setMoreOpen,
  isPending,
  stageFileInputRef,
  handleStageFilesPicked,
}: PropertyChipsBarProps) {
  const currentStatus = statuses.find((s) => s.value === status) ?? statuses[1]!;
  const currentPriority = priorities.find((p) => p.value === priority);

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border flex-wrap shrink-0">
      {/* Status chip */}
      <Popover open={statusOpen} onOpenChange={setStatusOpen}>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors">
            <CircleDot className={cn("h-3 w-3", currentStatus.color)} />
            {currentStatus.label}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-36 p-1" align="start">
          {statuses.map((s) => (
            <button
              key={s.value}
              className={cn(
                "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                s.value === status && "bg-accent"
              )}
              onClick={() => { setStatus(s.value); setStatusOpen(false); }}
            >
              <CircleDot className={cn("h-3 w-3", s.color)} />
              {s.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Priority chip */}
      <Popover open={priorityOpen} onOpenChange={setPriorityOpen}>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors">
            {currentPriority ? (
              <>
                {(() => {
                  const Icon = PRIORITY_ICONS[currentPriority.icon];
                  return <Icon className={cn("h-3 w-3", currentPriority.color)} />;
                })()}
                {currentPriority.label}
              </>
            ) : (
              <>
                <Minus className="h-3 w-3 text-muted-foreground" />
                Priority
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-36 p-1" align="start">
          {priorities.map((p) => {
            const Icon = PRIORITY_ICONS[p.icon];
            return (
              <button
                key={p.value}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                  p.value === priority && "bg-accent"
                )}
                onClick={() => { setPriority(p.value); setPriorityOpen(false); }}
              >
                <Icon className={cn("h-3 w-3", p.color)} />
                {p.label}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>

      {/* Labels chip (placeholder) */}
      <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors text-muted-foreground">
        <Tag className="h-3 w-3" />
        Labels
      </button>

      <input
        ref={stageFileInputRef}
        type="file"
        accept={STAGED_FILE_ACCEPT}
        className="hidden"
        onChange={handleStageFilesPicked}
        multiple
      />
      <button
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors text-muted-foreground"
        onClick={() => stageFileInputRef.current?.click()}
        disabled={isPending}
      >
        <Paperclip className="h-3 w-3" />
        Upload
      </button>

      {/* More (dates) */}
      <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center justify-center rounded-md border border-border p-1 text-xs hover:bg-accent/50 transition-colors text-muted-foreground">
            <MoreHorizontal className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-1" align="start">
          <button className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Start date
          </button>
          <button className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Due date
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

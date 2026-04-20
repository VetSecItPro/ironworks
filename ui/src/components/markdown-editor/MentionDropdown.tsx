import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";
import { AgentIcon } from "../AgentIconPicker";
import type { MentionOption } from "./types";

interface MentionDropdownProps {
  filteredMentions: MentionOption[];
  mentionIndex: number;
  viewportTop: number;
  viewportLeft: number;
  onSelect: (option: MentionOption) => void;
  onHover: (index: number) => void;
}

export function MentionDropdown({
  filteredMentions,
  mentionIndex,
  viewportTop,
  viewportLeft,
  onSelect,
  onHover,
}: MentionDropdownProps) {
  if (filteredMentions.length === 0) return null;

  return createPortal(
    <div
      className="fixed z-[100] min-w-[180px] max-h-[200px] overflow-y-auto rounded-md border border-border bg-popover shadow-md"
      style={{ top: viewportTop + 4, left: viewportLeft }}
    >
      {filteredMentions.map((option, i) => (
        <button
          key={option.id}
          className={cn(
            "flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-accent/50 transition-colors",
            i === mentionIndex && "bg-accent",
          )}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(option);
          }}
          onMouseEnter={() => onHover(i)}
        >
          {option.kind === "project" && option.projectId ? (
            <span
              className="inline-flex h-2 w-2 rounded-full border border-border/50"
              style={{ backgroundColor: option.projectColor ?? "#64748b" }}
            />
          ) : (
            <AgentIcon icon={option.agentIcon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span>{option.name}</span>
          {option.kind === "project" && option.projectId && (
            <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">Project</span>
          )}
        </button>
      ))}
    </div>,
    document.body,
  );
}

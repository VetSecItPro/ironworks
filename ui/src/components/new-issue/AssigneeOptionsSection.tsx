import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { type InlineEntityOption, InlineEntitySelector } from "../InlineEntitySelector";
import { ISSUE_THINKING_EFFORT_OPTIONS } from "./constants";

interface AssigneeOptionsSectionProps {
  assigneeOptionsOpen: boolean;
  setAssigneeOptionsOpen: (open: boolean) => void;
  assigneeOptionsTitle: string;
  assigneeAdapterType: string | null;
  assigneeModelOverride: string;
  setAssigneeModelOverride: (value: string) => void;
  modelOverrideOptions: InlineEntityOption[];
  assigneeThinkingEffort: string;
  setAssigneeThinkingEffort: (value: string) => void;
  assigneeChrome: boolean;
  setAssigneeChrome: (value: boolean) => void;
}

export function AssigneeOptionsSection({
  assigneeOptionsOpen,
  setAssigneeOptionsOpen,
  assigneeOptionsTitle,
  assigneeAdapterType,
  assigneeModelOverride,
  setAssigneeModelOverride,
  modelOverrideOptions,
  assigneeThinkingEffort,
  setAssigneeThinkingEffort,
  assigneeChrome,
  setAssigneeChrome,
}: AssigneeOptionsSectionProps) {
  const thinkingEffortOptions =
    assigneeAdapterType === "codex_local"
      ? ISSUE_THINKING_EFFORT_OPTIONS.codex_local
      : assigneeAdapterType === "opencode_local"
        ? ISSUE_THINKING_EFFORT_OPTIONS.opencode_local
        : ISSUE_THINKING_EFFORT_OPTIONS.claude_local;

  return (
    <div className="px-4 pb-2 shrink-0">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setAssigneeOptionsOpen(!assigneeOptionsOpen)}
      >
        {assigneeOptionsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {assigneeOptionsTitle}
      </button>
      {assigneeOptionsOpen && (
        <div className="mt-2 rounded-md border border-border p-3 bg-muted/20 space-y-3">
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">Model</div>
            <InlineEntitySelector
              value={assigneeModelOverride}
              options={modelOverrideOptions}
              placeholder="Default model"
              disablePortal
              noneLabel="Default model"
              searchPlaceholder="Search models..."
              emptyMessage="No models found."
              onChange={setAssigneeModelOverride}
            />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">Thinking effort</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {thinkingEffortOptions.map((option) => (
                <button
                  type="button"
                  key={option.value || "default"}
                  className={cn(
                    "px-2 py-1 rounded-md text-xs border border-border hover:bg-accent/50 transition-colors",
                    assigneeThinkingEffort === option.value && "bg-accent",
                  )}
                  onClick={() => setAssigneeThinkingEffort(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {assigneeAdapterType === "claude_local" && (
            <div className="flex items-center justify-between rounded-md border border-border px-2 py-1.5">
              <div className="text-xs text-muted-foreground">Enable Chrome (--chrome)</div>
              <button
                type="button"
                data-slot="toggle"
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                  assigneeChrome ? "bg-green-600" : "bg-muted",
                )}
                onClick={() => setAssigneeChrome(!assigneeChrome)}
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform",
                    assigneeChrome ? "translate-x-4.5" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import type { RefObject } from "react";
import { RunButton } from "../AgentActionButtons";

function autoResizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

export function RoutineHeader({
  title,
  onTitleChange,
  titleInputRef,
  onTitleEnter,
  onTitleTab,
  automationEnabled,
  automationToggleDisabled,
  automationLabel,
  automationLabelClassName,
  onRunClick,
  runDisabled,
  onToggleStatus,
}: {
  title: string;
  onTitleChange: (title: string) => void;
  titleInputRef: RefObject<HTMLTextAreaElement | null>;
  onTitleEnter: () => void;
  onTitleTab: () => void;
  automationEnabled: boolean;
  automationToggleDisabled: boolean;
  automationLabel: string;
  automationLabelClassName: string;
  onRunClick: () => void;
  runDisabled: boolean;
  onToggleStatus: () => void;
}) {
  return (
    <div className="flex items-start gap-4">
      <textarea
        ref={titleInputRef}
        className="flex-1 min-w-0 resize-none overflow-hidden bg-transparent text-xl font-bold outline-none placeholder:text-muted-foreground/70"
        placeholder="Routine title"
        rows={1}
        value={title}
        onChange={(event) => {
          onTitleChange(event.target.value);
          autoResizeTextarea(event.target);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onTitleEnter();
            return;
          }
          if (event.key === "Tab" && !event.shiftKey) {
            event.preventDefault();
            onTitleTab();
          }
        }}
      />
      <div className="flex shrink-0 items-center gap-3 pt-1">
        <RunButton onClick={onRunClick} disabled={runDisabled} />
        <button
          type="button"
          role="switch"
          data-slot="toggle"
          aria-checked={automationEnabled}
          aria-label={automationEnabled ? "Pause automatic triggers" : "Enable automatic triggers"}
          disabled={automationToggleDisabled}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            automationEnabled ? "bg-emerald-500" : "bg-muted"
          } ${automationToggleDisabled ? "cursor-not-allowed opacity-50" : ""}`}
          onClick={onToggleStatus}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${
              automationEnabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className={`min-w-[3.75rem] text-sm font-medium ${automationLabelClassName}`}>
          {automationLabel}
        </span>
      </div>
    </div>
  );
}

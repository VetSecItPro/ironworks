import { useEffect } from "react";

interface ShortcutHandlers {
  onNewIssue?: () => void;
  onNewGoal?: () => void;
  onNewPlaybook?: () => void;
  onToggleSidebar?: () => void;
  onTogglePanel?: () => void;
  onToggleFocusMode?: () => void;
}

export function useKeyboardShortcuts({
  onNewIssue,
  onNewGoal,
  onNewPlaybook,
  onToggleSidebar,
  onTogglePanel,
  onToggleFocusMode,
}: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't fire shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      // Cmd+Shift+F -> Focus Mode
      if (e.key === "f" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        onToggleFocusMode?.();
        return;
      }

      // C -> New Issue
      if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onNewIssue?.();
      }

      // [ -> Toggle Sidebar
      if (e.key === "[" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onToggleSidebar?.();
      }

      // ] -> Toggle Panel
      if (e.key === "]" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onTogglePanel?.();
      }

      // ? -> Show keyboard shortcuts
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Navigate handled by the component
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onNewIssue, onNewGoal, onNewPlaybook, onToggleSidebar, onTogglePanel, onToggleFocusMode]);
}

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Vim-style j/k navigation in lists
// ---------------------------------------------------------------------------

interface VimNavigationOptions {
  /** CSS selector for list items */
  itemSelector: string;
  /** Container ref or null for document-level */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Callback when an item is selected */
  onSelect?: (element: HTMLElement, index: number) => void;
  /** Whether navigation is enabled */
  enabled?: boolean;
}

export function useVimNavigation({
  itemSelector,
  containerRef,
  onSelect,
  enabled = true,
}: VimNavigationOptions) {
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!enabled) return;

    function getItems(): HTMLElement[] {
      const container = containerRef?.current ?? document;
      return Array.from(container.querySelectorAll(itemSelector));
    }

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const items = getItems();
      if (items.length === 0) return;

      if (e.key === "j" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = Math.min(prev + 1, items.length - 1);
          items[next]?.scrollIntoView({ block: "nearest" });
          items[next]?.focus();
          return next;
        });
      }

      if (e.key === "k" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          items[next]?.scrollIntoView({ block: "nearest" });
          items[next]?.focus();
          return next;
        });
      }

      // Enter to select
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        const items2 = getItems();
        if (activeIndex >= 0 && activeIndex < items2.length) {
          e.preventDefault();
          const el = items2[activeIndex];
          onSelect?.(el, activeIndex);
          // Click the first link or button in the item
          const clickable = el.querySelector("a, button") as HTMLElement | null;
          clickable?.click();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, itemSelector, containerRef, onSelect, activeIndex]);

  return { activeIndex, setActiveIndex };
}

// ---------------------------------------------------------------------------
// Focus Mode (Cmd+Shift+F)
// ---------------------------------------------------------------------------

const FOCUS_MODE_EVENT = "ironworks:focus-mode-toggle";

export function useFocusMode() {
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "f" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        setFocusMode((prev) => !prev);
        document.dispatchEvent(new CustomEvent(FOCUS_MODE_EVENT));
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { focusMode, setFocusMode };
}

// ---------------------------------------------------------------------------
// Quick Create Shortcuts
// ---------------------------------------------------------------------------

interface QuickCreateHandlers {
  onCreateIssue?: () => void;
  onCreateGoal?: () => void;
  onCreatePlaybook?: () => void;
  onCreateProject?: () => void;
  enabled?: boolean;
}

export function useQuickCreateShortcuts({
  onCreateIssue,
  onCreateGoal,
  onCreatePlaybook,
  onCreateProject,
  enabled = true,
}: QuickCreateHandlers) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "c":
          e.preventDefault();
          onCreateIssue?.();
          break;
        case "g":
          // 'g' starts a chord - handled by useChordNavigation
          break;
        case "p":
          e.preventDefault();
          onCreatePlaybook?.();
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onCreateIssue, onCreateGoal, onCreatePlaybook, onCreateProject]);
}

// ---------------------------------------------------------------------------
// Chord Navigation (g then d/i/a/p/o)
// ---------------------------------------------------------------------------

interface ChordNavHandlers {
  onNavigate: (path: string) => void;
  enabled?: boolean;
}

export function useChordNavigation({ onNavigate, enabled = true }: ChordNavHandlers) {
  const pendingChord = useRef<string | null>(null);
  const chordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Start chord
      if (e.key === "g" && pendingChord.current === null) {
        e.preventDefault();
        pendingChord.current = "g";
        if (chordTimer.current) clearTimeout(chordTimer.current);
        chordTimer.current = setTimeout(() => {
          pendingChord.current = null;
        }, 1000);
        return;
      }

      // Complete chord
      if (pendingChord.current === "g") {
        pendingChord.current = null;
        if (chordTimer.current) clearTimeout(chordTimer.current);

        switch (e.key) {
          case "d":
            e.preventDefault();
            onNavigate("/dashboard");
            break;
          case "i":
            e.preventDefault();
            onNavigate("/issues");
            break;
          case "a":
            e.preventDefault();
            onNavigate("/agents");
            break;
          case "p":
            e.preventDefault();
            onNavigate("/projects");
            break;
          case "o":
            e.preventDefault();
            onNavigate("/goals");
            break;
          case "c":
            e.preventDefault();
            onNavigate("/costs");
            break;
          case "b":
            e.preventDefault();
            onNavigate("/playbooks");
            break;
          case "l":
            e.preventDefault();
            onNavigate("/library");
            break;
          case "k":
            e.preventDefault();
            onNavigate("/keyboard-shortcuts");
            break;
          case "n":
            e.preventDefault();
            onNavigate("/inbox");
            break;
          case "s":
            e.preventDefault();
            onNavigate("/company/settings");
            break;
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (chordTimer.current) clearTimeout(chordTimer.current);
    };
  }, [enabled, onNavigate]);
}

// ---------------------------------------------------------------------------
// Multi-select with Shift+click / Cmd+click
// ---------------------------------------------------------------------------

interface MultiSelectOptions<T> {
  items: T[];
  getKey: (item: T) => string;
}

export function useMultiSelect<T>({ items, getKey }: MultiSelectOptions<T>) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const lastClickedIndex = useRef<number>(-1);

  const handleClick = useCallback(
    (index: number, e: React.MouseEvent) => {
      const key = getKey(items[index]);

      if (e.metaKey || e.ctrlKey) {
        // Toggle individual selection
        setSelectedKeys((prev) => {
          const next = new Set(prev);
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
          return next;
        });
        lastClickedIndex.current = index;
      } else if (e.shiftKey && lastClickedIndex.current >= 0) {
        // Range select
        const start = Math.min(lastClickedIndex.current, index);
        const end = Math.max(lastClickedIndex.current, index);
        setSelectedKeys((prev) => {
          const next = new Set(prev);
          for (let i = start; i <= end; i++) {
            next.add(getKey(items[i]));
          }
          return next;
        });
      } else {
        // Single select
        setSelectedKeys(new Set([key]));
        lastClickedIndex.current = index;
      }
    },
    [items, getKey],
  );

  const selectAll = useCallback(() => {
    setSelectedKeys(new Set(items.map(getKey)));
  }, [items, getKey]);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
    lastClickedIndex.current = -1;
  }, []);

  const isSelected = useCallback((item: T) => selectedKeys.has(getKey(item)), [selectedKeys, getKey]);

  // Cmd+A handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if (e.key === "a" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        selectAll();
      }

      // Escape to clear
      if (e.key === "Escape" && selectedKeys.size > 0) {
        e.preventDefault();
        clearSelection();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectAll, clearSelection, selectedKeys.size]);

  return {
    selectedKeys,
    selectedCount: selectedKeys.size,
    handleClick,
    selectAll,
    clearSelection,
    isSelected,
    setSelectedKeys,
  };
}

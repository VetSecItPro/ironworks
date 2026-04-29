import { useCallback, useState } from "react";

export interface TourStep {
  target: string;
  title: string;
  description: string;
  placement?: "top" | "bottom" | "left" | "right";
  route?: string;
}

export const DEFAULT_STEPS: TourStep[] = [
  {
    target: "#main-content",
    title: "Welcome to IronWorks",
    description:
      "This is your AI workforce management dashboard. Let us walk you through the key areas so you can get productive fast.",
    placement: "bottom",
  },
  {
    target: '[data-tour="sidebar"]',
    title: "Navigation Sidebar",
    description:
      "Use the sidebar to navigate between agents, projects, issues, goals, and more. Toggle it with the [ key.",
    placement: "right",
  },
  {
    target: '[data-tour="agents"]',
    title: "Your AI Agents",
    description:
      "View and manage your AI workforce here. Each agent can be assigned tasks, configured with different LLM providers, and monitored in real-time.",
    placement: "right",
  },
  {
    target: '[data-tour="issues"]',
    title: "Missions & Tasks",
    description:
      "Create and track work items. Assign them to agents or team members, set priorities, and monitor progress through the board or list view.",
    placement: "right",
  },
  {
    target: '[data-tour="command-palette"]',
    title: "Quick Actions (Cmd+K)",
    description:
      "Press Cmd+K (or Ctrl+K) to open the command palette. Search for anything, create items, or navigate instantly.",
    placement: "bottom",
  },
  {
    target: '[data-tour="projects"]',
    title: "Projects",
    description:
      "Organize work into projects. Each project groups related issues, tracks budgets, and provides a focused view of progress.",
    placement: "right",
  },
  {
    target: '[data-tour="goals"]',
    title: "Goals & OKRs",
    description:
      "Set strategic goals and link issues to them. Track progress with automatic rollup from linked tasks and sub-goals.",
    placement: "right",
  },
];

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const TOUR_STORAGE_KEY = "ironworks:guided-tour-completed";
const TOUR_VERSION = "1";

export function isTourCompleted(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === TOUR_VERSION;
  } catch {
    return false;
  }
}

export function markTourCompleted() {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, TOUR_VERSION);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGuidedTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  const start = useCallback(() => {
    setStep(0);
    setActive(true);
  }, []);
  const dismiss = useCallback(() => {
    setActive(false);
    markTourCompleted();
  }, []);
  const next = useCallback(() => {
    setStep((s) => s + 1);
  }, []);
  const prev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  return { active, step, start, dismiss, next, prev, completed: isTourCompleted() };
}

// ---------------------------------------------------------------------------
// Auto-start for first-time users
// ---------------------------------------------------------------------------

const FIRST_RUN_KEY = "ironworks:first-run-seen";
const FIRST_RUN_VERSION = "1";

export function isFirstRun(): boolean {
  try {
    return localStorage.getItem(FIRST_RUN_KEY) !== FIRST_RUN_VERSION;
  } catch {
    return false;
  }
}

export function markFirstRunSeen() {
  try {
    localStorage.setItem(FIRST_RUN_KEY, FIRST_RUN_VERSION);
  } catch {
    /* ignore */
  }
}

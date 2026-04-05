import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Tour Step Definition
// ---------------------------------------------------------------------------

export interface TourStep {
  /** CSS selector or element id to highlight */
  target: string;
  title: string;
  description: string;
  /** Optional placement relative to the target */
  placement?: "top" | "bottom" | "left" | "right";
  /** Optional route to navigate to before showing this step */
  route?: string;
}

const DEFAULT_STEPS: TourStep[] = [
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
    title: "Issues & Tasks",
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

function isTourCompleted(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === TOUR_VERSION;
  } catch {
    return false;
  }
}

function markTourCompleted() {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, TOUR_VERSION);
  } catch {
    // ignore
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
// Spotlight Overlay
// ---------------------------------------------------------------------------

function getTargetRect(selector: string): DOMRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  return el.getBoundingClientRect();
}

interface SpotlightProps {
  targetRect: DOMRect | null;
}

function SpotlightOverlay({ targetRect }: SpotlightProps) {
  if (!targetRect) {
    return (
      <div className="fixed inset-0 z-[9998] bg-black/60 transition-opacity duration-300" />
    );
  }

  const padding = 8;
  const x = targetRect.left - padding;
  const y = targetRect.top - padding;
  const w = targetRect.width + padding * 2;
  const h = targetRect.height + padding * 2;
  const r = 8;

  return (
    <svg
      className="fixed inset-0 z-[9998] pointer-events-none"
      width="100%"
      height="100%"
      style={{ width: "100vw", height: "100vh" }}
    >
      <defs>
        <mask id="tour-spotlight-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect x={x} y={y} width={w} height={h} rx={r} ry={r} fill="black" />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.6)"
        mask="url(#tour-spotlight-mask)"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tooltip Card
// ---------------------------------------------------------------------------

interface TooltipCardProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  targetRect: DOMRect | null;
  onNext: () => void;
  onPrev: () => void;
  onDismiss: () => void;
}

function TooltipCard({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  onNext,
  onPrev,
  onDismiss,
}: TooltipCardProps) {
  const isLast = stepIndex === totalSteps - 1;
  const placement = step.placement ?? "bottom";

  const style = useMemo(() => {
    if (!targetRect) {
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      } as React.CSSProperties;
    }

    const gap = 16;
    const cardWidth = 360;

    switch (placement) {
      case "right":
        return {
          top: targetRect.top + targetRect.height / 2,
          left: targetRect.right + gap,
          transform: "translateY(-50%)",
          maxWidth: cardWidth,
        } as React.CSSProperties;
      case "left":
        return {
          top: targetRect.top + targetRect.height / 2,
          right: window.innerWidth - targetRect.left + gap,
          transform: "translateY(-50%)",
          maxWidth: cardWidth,
        } as React.CSSProperties;
      case "top":
        return {
          bottom: window.innerHeight - targetRect.top + gap,
          left: targetRect.left + targetRect.width / 2,
          transform: "translateX(-50%)",
          maxWidth: cardWidth,
        } as React.CSSProperties;
      case "bottom":
      default:
        return {
          top: targetRect.bottom + gap,
          left: targetRect.left + targetRect.width / 2,
          transform: "translateX(-50%)",
          maxWidth: cardWidth,
        } as React.CSSProperties;
    }
  }, [targetRect, placement]);

  return (
    <div
      className="fixed z-[9999] w-[360px] rounded-lg border border-border bg-card p-4 shadow-xl animate-in fade-in-0 zoom-in-95 duration-200"
      style={style}
      role="dialog"
      aria-label={`Tour step ${stepIndex + 1} of ${totalSteps}`}
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Close tour"
      >
        <X className="h-4 w-4" />
      </button>
      <h3 className="text-sm font-semibold pr-6">{step.title}</h3>
      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
        {step.description}
      </p>
      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-muted-foreground">
          {stepIndex + 1} / {totalSteps}
        </span>
        <div className="flex items-center gap-2">
          {stepIndex > 0 && (
            <Button variant="ghost" size="sm" onClick={onPrev} className="h-7 text-xs">
              <ChevronLeft className="h-3 w-3 mr-1" />
              Back
            </Button>
          )}
          <Button size="sm" onClick={isLast ? onDismiss : onNext} className="h-7 text-xs">
            {isLast ? "Finish" : "Next"}
            {!isLast && <ChevronRight className="h-3 w-3 ml-1" />}
          </Button>
        </div>
      </div>
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1 mt-3">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all duration-200",
              i === stepIndex ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30",
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface GuidedTourProps {
  steps?: TourStep[];
  active: boolean;
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onDismiss: () => void;
}

export function GuidedTour({
  steps = DEFAULT_STEPS,
  active,
  currentStep,
  onNext,
  onPrev,
  onDismiss,
}: GuidedTourProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const navigate = useNavigate();

  const step = steps[currentStep];

  // Update target rect on step change or window resize
  useEffect(() => {
    if (!active || !step) return;

    if (step.route) {
      navigate(step.route);
    }

    function updateRect() {
      setTargetRect(getTargetRect(step.target));
    }

    // Small delay to allow navigation to complete
    const timer = setTimeout(updateRect, 100);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [active, step, navigate, currentStep]);

  // Handle finish
  useEffect(() => {
    if (active && currentStep >= steps.length) {
      onDismiss();
    }
  }, [active, currentStep, steps.length, onDismiss]);

  // Escape key to dismiss
  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
      if (e.key === "ArrowRight") onNext();
      if (e.key === "ArrowLeft") onPrev();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, onDismiss, onNext, onPrev]);

  if (!active || !step) return null;

  return (
    <>
      <SpotlightOverlay targetRect={targetRect} />
      {/* Click blocker */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={(e) => e.stopPropagation()}
        aria-hidden="true"
      />
      <TooltipCard
        step={step}
        stepIndex={currentStep}
        totalSteps={steps.length}
        targetRect={targetRect}
        onNext={onNext}
        onPrev={onPrev}
        onDismiss={onDismiss}
      />
    </>
  );
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
    // ignore
  }
}

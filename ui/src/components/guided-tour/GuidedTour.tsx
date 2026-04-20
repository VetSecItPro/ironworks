import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router";
import { getTargetRect, SpotlightOverlay } from "./SpotlightOverlay";
import { TooltipCard } from "./TooltipCard";
import type { TourStep } from "./tour-data";
import { DEFAULT_STEPS } from "./tour-data";

interface GuidedTourProps {
  steps?: TourStep[];
  active: boolean;
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onDismiss: () => void;
}

export function GuidedTour({ steps = DEFAULT_STEPS, active, currentStep, onNext, onPrev, onDismiss }: GuidedTourProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const navigate = useNavigate();

  const step = steps[currentStep];

  useEffect(() => {
    if (!active || !step) return;
    if (step.route) navigate(step.route);

    function updateRect() {
      setTargetRect(getTargetRect(step.target));
    }

    const timer = setTimeout(updateRect, 100);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [active, step, navigate, currentStep]);

  useEffect(() => {
    if (active && currentStep >= steps.length) onDismiss();
  }, [active, currentStep, steps.length, onDismiss]);

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
      <div className="fixed inset-0 z-[9998]" onClick={(e) => e.stopPropagation()} aria-hidden="true" />
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

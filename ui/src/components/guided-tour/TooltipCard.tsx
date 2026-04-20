import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "../../lib/utils";
import type { TourStep } from "./tour-data";

interface TooltipCardProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  targetRect: DOMRect | null;
  onNext: () => void;
  onPrev: () => void;
  onDismiss: () => void;
}

export function TooltipCard({ step, stepIndex, totalSteps, targetRect, onNext, onPrev, onDismiss }: TooltipCardProps) {
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
      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{step.description}</p>
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
      <div className="flex items-center justify-center gap-1 mt-3">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: tour step indicators are purely positional; position in fixed step sequence is the identity
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

import { ArrowRight, CheckCircle2, Clock, Loader2, ShieldCheck, SkipForward, Users, XCircle } from "lucide-react";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PlaybookWithSteps } from "../../api/playbooks";
import { cn } from "../../lib/utils";
import { loadStepConditions, type StepCondition } from "./PlaybookDetailPanel";

const STEP_CONDITIONS_KEY = "ironworks.playbook-step-conditions";

function saveStepCondition(stepId: string, condition: StepCondition) {
  const all = loadStepConditions();
  all[stepId] = condition;
  localStorage.setItem(STEP_CONDITIONS_KEY, JSON.stringify(all));
}

/* ------------------------------------------------------------------ */
/*  Step Status Icons                                                   */
/* ------------------------------------------------------------------ */

function StepStatusIcon({ status }: { status?: string }) {
  switch (status) {
    case "completed":
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "failed":
    case "error":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "running":
    case "in_progress":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case "skipped":
      return <SkipForward className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground/70" />;
  }
}

/* ------------------------------------------------------------------ */
/*  Step Timeline                                                      */
/* ------------------------------------------------------------------ */

export function StepTimeline({ playbook }: { playbook: PlaybookWithSteps }) {
  const [conditions, setConditions] = useState<Record<string, StepCondition>>(() => loadStepConditions());

  function toggleCondition(stepId: string, field: keyof StepCondition) {
    const current = conditions[stepId] ?? { skipOnFailure: false, required: true };
    const next = { ...current, [field]: !current[field] };
    saveStepCondition(stepId, next);
    setConditions((prev) => ({ ...prev, [stepId]: next }));
  }

  return (
    <div className="space-y-0">
      {playbook.steps.map((step, idx) => {
        const isLast = idx === playbook.steps.length - 1;
        const cond = conditions[step.id] ?? { skipOnFailure: false, required: true };
        return (
          <div key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-accent border border-border text-xs font-medium shrink-0 relative">
                {step.stepOrder}
                <span className="absolute -bottom-0.5 -right-0.5">
                  <StepStatusIcon status={undefined} />
                </span>
              </div>
              {!isLast && <div className="w-px flex-1 bg-border my-1" />}
            </div>

            <div className={cn("flex-1 pb-4", isLast && "pb-0")}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{step.title}</span>
                {step.requiresApproval && (
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger>
                      <CheckCircle2 className="h-3.5 w-3.5 text-amber-500" />
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">Requires approval</TooltipContent>
                  </Tooltip>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1">
                {step.assigneeRole && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                    <Users className="h-3 w-3" />
                    {step.assigneeRole}
                  </span>
                )}
                {step.dependsOn && step.dependsOn.length > 0 && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                    <ArrowRight className="h-3 w-3" />
                    after step {step.dependsOn.join(", ")}
                  </span>
                )}
              </div>

              {step.instructions && (
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{step.instructions}</p>
              )}

              <div className="flex items-center gap-3 mt-2">
                <button type="button"
                  onClick={() => toggleCondition(step.id, "skipOnFailure")}
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border transition-colors",
                    cond.skipOnFailure
                      ? "border-yellow-400 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  <SkipForward className="h-2.5 w-2.5" />
                  Skip on failure
                </button>
                <button type="button"
                  onClick={() => toggleCondition(step.id, "required")}
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border transition-colors",
                    cond.required
                      ? "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  <ShieldCheck className="h-2.5 w-2.5" />
                  Required
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

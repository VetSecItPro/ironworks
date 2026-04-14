import { CheckCircle2, FlaskConical, Variable } from "lucide-react";
import type { PlaybookWithSteps } from "../../api/playbooks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loadStepConditions, loadPlaybookParams } from "./PlaybookDetailPanel";

export function DryRunDialog({
  open,
  onOpenChange,
  playbook,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playbook: PlaybookWithSteps;
}) {
  const conditions = loadStepConditions();
  const params = loadPlaybookParams(playbook.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            Dry Run: {playbook.name}
          </DialogTitle>
          <DialogDescription>
            Simulated execution preview. No side effects will occur.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3">
          {params.length > 0 && (
            <div className="rounded-md bg-muted/30 border border-border p-3">
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Parameters</h4>
              {params.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-xs py-0.5">
                  <Variable className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground">= {p.defaultValue || "(empty)"}</span>
                  <span className="text-[10px] text-muted-foreground px-1 py-0.5 bg-muted rounded">{p.type}</span>
                </div>
              ))}
            </div>
          )}

          {playbook.steps.map((step) => {
            const cond = conditions[step.id] ?? { skipOnFailure: false, required: true };
            const blocked = step.dependsOn && step.dependsOn.length > 0;
            return (
              <div key={step.id} className="flex gap-2 items-start text-xs">
                <div className="flex items-center justify-center h-5 w-5 rounded-full bg-accent border border-border text-[10px] font-medium shrink-0 mt-0.5">
                  {step.stepOrder}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{step.title}</span>
                    {cond.skipOnFailure && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300">SKIP ON FAIL</span>
                    )}
                    {cond.required && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">REQUIRED</span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5">
                    {blocked ? `Would wait for step ${step.dependsOn!.join(", ")} to complete` : "Would execute immediately"}
                    {step.assigneeRole ? ` - assigned to ${step.assigneeRole}` : ""}
                  </p>
                  <div className="mt-1 inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Simulated: success</span>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-xs text-green-700 dark:text-green-400">
            Dry run complete: {playbook.steps.length} step{playbook.steps.length !== 1 ? "s" : ""} would execute successfully.
            {params.length > 0 && ` ${params.length} parameter${params.length !== 1 ? "s" : ""} resolved.`}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

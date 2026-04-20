import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "../../lib/utils";
import type { StepDraft } from "./playbook-types";
import { CATEGORIES, emptyStep } from "./playbook-types";

interface ManualModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  steps: StepDraft[];
  setSteps: React.Dispatch<React.SetStateAction<StepDraft[]>>;
  onSubmit: () => void;
  isPending?: boolean;
}

export function ManualModeDialog({
  open,
  onOpenChange,
  name,
  setName,
  description,
  setDescription,
  category,
  setCategory,
  steps,
  setSteps,
  onSubmit,
  isPending,
}: ManualModeDialogProps) {
  function addStep() {
    setSteps((prev) => [...prev, emptyStep()]);
  }

  function removeStep(idx: number) {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateStep(idx: number, field: keyof StepDraft, value: string | boolean) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Playbook</DialogTitle>
          <DialogDescription>Define your multi-agent workflow step by step.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="playbook-name" className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                id="playbook-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. New Client Onboarding"
                className="mt-1"
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="playbook-description" className="text-xs font-medium text-muted-foreground">Description</label>
              <Input
                id="playbook-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="One-liner explaining what this playbook does"
                className="mt-1"
              />
            </div>
            <div className="col-span-2">
              <span className="text-xs font-medium text-muted-foreground">Category</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {CATEGORIES.map((cat) => (
                  <button type="button"
                    key={cat.value}
                    onClick={() => setCategory(cat.value)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                      category === cat.value
                        ? "border-foreground bg-accent text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/30",
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Steps</span>
              <Button variant="ghost" size="xs" onClick={addStep}>
                <Plus className="h-3 w-3 mr-1" />
                Add Step
              </Button>
            </div>

            <div className="space-y-3">
              {steps.map((step, idx) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: editable playbook steps have no stable id; step.title is mutable during editing
                <div key={idx} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-accent text-[11px] font-medium shrink-0">
                      {idx + 1}
                    </span>
                    <Input
                      value={step.title}
                      onChange={(e) => updateStep(idx, "title", e.target.value)}
                      placeholder="Step title"
                      className="h-7 text-xs flex-1"
                    />
                    {steps.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => removeStep(idx)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Textarea
                    value={step.instructions}
                    onChange={(e) => updateStep(idx, "instructions", e.target.value)}
                    placeholder="Instructions for the agent executing this step..."
                    className="min-h-[60px] text-xs"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label htmlFor={`step-${idx}-assignee-role`} className="text-[10px] text-muted-foreground">Assignee Role</label>
                      <Input
                        id={`step-${idx}-assignee-role`}
                        value={step.assigneeRole}
                        onChange={(e) => updateStep(idx, "assigneeRole", e.target.value)}
                        placeholder="e.g. cto"
                        className="h-6 text-[11px] mt-0.5"
                      />
                    </div>
                    <div>
                      <label htmlFor={`step-${idx}-depends-on`} className="text-[10px] text-muted-foreground">Depends on steps</label>
                      <Input
                        id={`step-${idx}-depends-on`}
                        value={step.dependsOn}
                        onChange={(e) => updateStep(idx, "dependsOn", e.target.value)}
                        placeholder="e.g. 1, 2"
                        className="h-6 text-[11px] mt-0.5"
                      />
                    </div>
                    <div>
                      <label htmlFor={`step-${idx}-est-minutes`} className="text-[10px] text-muted-foreground">Est. minutes</label>
                      <Input
                        id={`step-${idx}-est-minutes`}
                        value={step.estimatedMinutes}
                        onChange={(e) => updateStep(idx, "estimatedMinutes", e.target.value)}
                        placeholder="30"
                        className="h-6 text-[11px] mt-0.5"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={step.requiresApproval}
                      onChange={(e) => updateStep(idx, "requiresApproval", e.target.checked)}
                      className="rounded border-border"
                    />
                    Requires approval before completing
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!name.trim() || steps.filter((s) => s.title.trim()).length === 0 || isPending}
          >
            {isPending ? "Creating..." : "Create Playbook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

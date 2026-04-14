import { cn } from "../../lib/utils";
import {
  Building2,
  Bot,
  Key,
  ListTodo,
  Rocket,
} from "lucide-react";
import type { Step } from "./types";

interface ProgressTabsProps {
  currentStep: Step;
  onStepClick: (step: Step) => void;
}

const TABS = [
  { step: 1 as Step, label: "Company", icon: Building2 },
  { step: 2 as Step, label: "LLM", icon: Key },
  { step: 3 as Step, label: "Agent", icon: Bot },
  { step: 4 as Step, label: "Task", icon: ListTodo },
  { step: 5 as Step, label: "Launch", icon: Rocket },
] as const;

export function ProgressTabs({ currentStep, onStepClick }: ProgressTabsProps) {
  return (
    <div className="flex items-center gap-0 mb-10 border-b border-border">
      {TABS.map(({ step: s, label, icon: Icon }) => (
        <button
          key={s}
          type="button"
          onClick={() => onStepClick(s)}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer",
            s === currentStep
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground/70 hover:border-border"
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

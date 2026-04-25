import { Bot, Building2, Check, Key, ListTodo, Pencil, Rocket } from "lucide-react";
import { getUIAdapter } from "../../adapters";
import { LLM_PROVIDERS } from "./constants";
import type { AdapterType, Step } from "./types";

interface StepLaunchProps {
  companyName: string;
  llmProvider: string;
  llmSaved: boolean;
  agentName: string;
  adapterType: AdapterType;
  taskTitle: string;
  taskSaved: boolean;
  onStepClick: (step: Step) => void;
}

export function StepLaunch({
  companyName,
  llmProvider,
  llmSaved,
  agentName,
  adapterType,
  taskTitle,
  taskSaved,
  onStepClick,
}: StepLaunchProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-1">
        <div className="bg-muted/50 p-2">
          <Rocket className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-medium">Ready to launch</h3>
          <p className="text-xs text-muted-foreground">
            Everything is set up. Launching now will create the starter task, wake the agent, and open the issue.
          </p>
        </div>
      </div>
      <div className="rounded-lg border border-border divide-y divide-border">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Company</p>
            <p className="text-sm font-medium truncate">{companyName}</p>
          </div>
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            onClick={() => onStepClick(1)}
            title="Edit company"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <Check className="h-4 w-4 text-green-500 shrink-0" />
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Key className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">LLM Provider</p>
            <p className="text-sm font-medium truncate">
              {LLM_PROVIDERS.find((p) => p.key === llmProvider)?.label ?? "Not set"}
            </p>
          </div>
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            onClick={() => onStepClick(2)}
            title="Edit provider"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {llmSaved ? (
            <Check className="h-4 w-4 text-green-500 shrink-0" />
          ) : (
            <span className="text-[10px] text-amber-500 shrink-0">Skipped</span>
          )}
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Agent</p>
            <p className="text-sm font-medium truncate">{agentName}</p>
            <p className="text-xs text-muted-foreground">{getUIAdapter(adapterType).label}</p>
          </div>
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            onClick={() => onStepClick(3)}
            title="Edit agent"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <Check className="h-4 w-4 text-green-500 shrink-0" />
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <ListTodo className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">First Task</p>
            <p className="text-sm font-medium truncate">
              {taskSaved ? taskTitle : <span className="text-muted-foreground italic">No first task</span>}
            </p>
          </div>
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            onClick={() => onStepClick(4)}
            title="Edit task"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {taskSaved ? (
            <Check className="h-4 w-4 text-green-500 shrink-0" />
          ) : (
            <span className="text-[10px] text-amber-500 shrink-0">Skipped</span>
          )}
        </div>
      </div>

      {/* What happens next explainer */}
      <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5">
        <p className="text-xs font-medium text-foreground/80">What happens next</p>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          Your agent will start working on the task. Check the dashboard in a few minutes to see progress, review
          deliverables, and follow activity.
        </p>
      </div>
    </div>
  );
}

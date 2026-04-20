import { Pencil, ToggleLeft, ToggleRight, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Action, AutomationRule, Trigger } from "./automationTypes";
import { ACTION_OPTIONS, TRIGGER_OPTIONS } from "./automationTypes";

interface AutomationRuleListProps {
  rules: AutomationRule[];
  showForm: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (rule: AutomationRule) => void;
}

const triggerLabel = (t: Trigger) => TRIGGER_OPTIONS.find((o) => o.value === t)?.label ?? t;
const actionLabel = (a: Action) => ACTION_OPTIONS.find((o) => o.value === a)?.label ?? a;

export function AutomationRuleList({ rules, showForm, onToggle, onDelete, onEdit }: AutomationRuleListProps) {
  if (rules.length === 0 && !showForm) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <Zap className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          No automation rules yet. Create one to automate repetitive tasks.
        </p>
      </div>
    );
  }

  if (rules.length === 0) return null;

  return (
    <div className="space-y-2">
      {rules.map((rule) => (
        <div
          key={rule.id}
          className={`rounded-lg border px-4 py-3 flex items-center gap-4 transition-colors ${
            rule.enabled ? "border-border" : "border-border/50 opacity-60"
          }`}
        >
          <button
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => onToggle(rule.id)}
            title={rule.enabled ? "Disable rule" : "Enable rule"}
          >
            {rule.enabled ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5" />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{rule.name}</div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">
                When: {triggerLabel(rule.trigger)}
              </span>
              {rule.triggerValue && <span className="font-mono text-[11px]">({rule.triggerValue})</span>}
              <span className="text-border">-&gt;</span>
              <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 bg-blue-500/10 text-blue-700 dark:text-blue-400 font-medium">
                Then: {actionLabel(rule.action)}
              </span>
              {rule.actionValue && <span className="font-mono text-[11px]">({rule.actionValue})</span>}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon-xs" onClick={() => onEdit(rule)} title="Edit rule">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-destructive"
              onClick={() => onDelete(rule.id)}
              title="Delete rule"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

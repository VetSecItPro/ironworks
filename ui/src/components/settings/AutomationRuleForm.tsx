import { Button } from "@/components/ui/button";
import { X, ChevronDown } from "lucide-react";
import type { Trigger, Action } from "./automationTypes";
import {
  TRIGGER_OPTIONS,
  ACTION_OPTIONS,
  TRIGGER_VALUE_LABELS,
  ACTION_VALUE_LABELS,
} from "./automationTypes";

interface AutomationRuleFormProps {
  editingId: string | null;
  formName: string;
  setFormName: (v: string) => void;
  formTrigger: Trigger;
  setFormTrigger: (v: Trigger) => void;
  formTriggerValue: string;
  setFormTriggerValue: (v: string) => void;
  formAction: Action;
  setFormAction: (v: Action) => void;
  formActionValue: string;
  setFormActionValue: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function AutomationRuleForm({
  editingId,
  formName,
  setFormName,
  formTrigger,
  setFormTrigger,
  formTriggerValue,
  setFormTriggerValue,
  formAction,
  setFormAction,
  formActionValue,
  setFormActionValue,
  onSave,
  onCancel,
}: AutomationRuleFormProps) {
  return (
    <div className="rounded-lg border border-border p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {editingId ? "Edit Rule" : "Create Rule"}
        </h2>
        <button
          className="text-muted-foreground hover:text-foreground transition-colors"
          onClick={onCancel}
          aria-label="Close form"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Rule name</label>
        <input
          className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-primary"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder="e.g. Auto-assign triage agent on new missions"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* WHEN */}
        <div className="space-y-3 rounded-md border border-border p-4 bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              When
            </span>
            <span className="text-xs text-muted-foreground">(trigger)</span>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Event</label>
            <div className="relative">
              <select
                value={formTrigger}
                onChange={(e) => setFormTrigger(e.target.value as Trigger)}
                className="w-full appearance-none rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none pr-8"
              >
                {TRIGGER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {TRIGGER_OPTIONS.find((o) => o.value === formTrigger)?.hint}
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {TRIGGER_VALUE_LABELS[formTrigger]}
            </label>
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              value={formTriggerValue}
              onChange={(e) => setFormTriggerValue(e.target.value)}
              placeholder="Optional filter value"
            />
          </div>
        </div>

        {/* THEN */}
        <div className="space-y-3 rounded-md border border-border p-4 bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Then
            </span>
            <span className="text-xs text-muted-foreground">(action)</span>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Action</label>
            <div className="relative">
              <select
                value={formAction}
                onChange={(e) => setFormAction(e.target.value as Action)}
                className="w-full appearance-none rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none pr-8"
              >
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {ACTION_OPTIONS.find((o) => o.value === formAction)?.hint}
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {ACTION_VALUE_LABELS[formAction]}
            </label>
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              value={formActionValue}
              onChange={(e) => setFormActionValue(e.target.value)}
              placeholder="Value for this action"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" onClick={onSave} disabled={!formName.trim()}>
          {editingId ? "Update Rule" : "Create Rule"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

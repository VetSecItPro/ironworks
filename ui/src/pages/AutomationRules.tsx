import { useEffect, useState, useCallback } from "react";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { Zap, Plus } from "lucide-react";

import type { AutomationRule, Trigger, Action } from "@/components/settings/automationTypes";
import { loadRules, saveRules, generateId } from "@/components/settings/automationTypes";
import { AutomationRuleForm } from "@/components/settings/AutomationRuleForm";
import { AutomationRuleList } from "@/components/settings/AutomationRuleList";

export function AutomationRules() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const [rules, setRules] = useState<AutomationRule[]>(loadRules);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formTrigger, setFormTrigger] = useState<Trigger>("issue_created");
  const [formTriggerValue, setFormTriggerValue] = useState("");
  const [formAction, setFormAction] = useState<Action>("assign_agent");
  const [formActionValue, setFormActionValue] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Automation Rules" }]);
  }, [setBreadcrumbs]);

  const persist = useCallback((next: AutomationRule[]) => {
    setRules(next);
    saveRules(next);
  }, []);

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormName("");
    setFormTrigger("issue_created");
    setFormTriggerValue("");
    setFormAction("assign_agent");
    setFormActionValue("");
  }

  function handleSave() {
    if (!formName.trim()) return;
    if (editingId) {
      persist(
        rules.map((r) =>
          r.id === editingId
            ? {
                ...r,
                name: formName.trim(),
                trigger: formTrigger,
                triggerValue: formTriggerValue.trim(),
                action: formAction,
                actionValue: formActionValue.trim(),
              }
            : r,
        ),
      );
      pushToast({ title: "Rule updated", tone: "success" });
    } else {
      const newRule: AutomationRule = {
        id: generateId(),
        name: formName.trim(),
        trigger: formTrigger,
        triggerValue: formTriggerValue.trim(),
        action: formAction,
        actionValue: formActionValue.trim(),
        enabled: true,
        createdAt: new Date().toISOString(),
      };
      persist([...rules, newRule]);
      pushToast({ title: "Rule created", tone: "success" });
    }
    resetForm();
  }

  function handleToggle(id: string) {
    persist(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  }

  function handleDelete(id: string) {
    persist(rules.filter((r) => r.id !== id));
    pushToast({ title: "Rule deleted", tone: "success" });
  }

  function startEdit(rule: AutomationRule) {
    setEditingId(rule.id);
    setFormName(rule.name);
    setFormTrigger(rule.trigger);
    setFormTriggerValue(rule.triggerValue);
    setFormAction(rule.action);
    setFormActionValue(rule.actionValue);
    setShowForm(true);
  }

  return (
    <div className="p-6 max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Automation Rules
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Define when/then rules to automate common workflows.
            </p>
          </div>
        </div>
        {!showForm && (
          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New Rule
          </Button>
        )}
      </div>

      {showForm && (
        <AutomationRuleForm
          editingId={editingId}
          formName={formName}
          setFormName={setFormName}
          formTrigger={formTrigger}
          setFormTrigger={setFormTrigger}
          formTriggerValue={formTriggerValue}
          setFormTriggerValue={setFormTriggerValue}
          formAction={formAction}
          setFormAction={setFormAction}
          formActionValue={formActionValue}
          setFormActionValue={setFormActionValue}
          onSave={handleSave}
          onCancel={resetForm}
        />
      )}

      <AutomationRuleList
        rules={rules}
        showForm={showForm}
        onToggle={handleToggle}
        onDelete={handleDelete}
        onEdit={startEdit}
      />
    </div>
  );
}

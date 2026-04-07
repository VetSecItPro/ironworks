import { useState } from "react";
import { ToggleField } from "../agent-config-primitives";
import { useToast } from "../../context/ToastContext";

const MODEL_ROUTING_STORAGE_KEY_PREFIX = "ironworks:modelRouting:";

export function ModelRoutingSection({ companyId }: { companyId: string }) {
  const { pushToast } = useToast();
  const storageKey = `${MODEL_ROUTING_STORAGE_KEY_PREFIX}${companyId}`;

  const [enabled, setEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem(storageKey);
    return stored === null ? true : stored === "true";
  });

  function handleToggle(next: boolean) {
    setEnabled(next);
    localStorage.setItem(storageKey, String(next));
    pushToast({
      title: next
        ? "Smart model routing enabled"
        : "Smart model routing disabled",
      tone: "success",
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Model Routing
      </h2>
      <div className="rounded-md border border-border px-4 py-3">
        <ToggleField
          label="Enable smart model routing"
          hint="Automatically use cheaper models for routine tasks and more capable models for complex work"
          checked={enabled}
          onChange={handleToggle}
        />
      </div>
    </div>
  );
}

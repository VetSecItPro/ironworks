import { useEffect, useState, useCallback } from "react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";

import {
  StatusesSection,
  CustomFieldsSection,
  loadStatuses,
  saveStatuses,
  loadFields,
  saveFields,
} from "@/components/workflow-settings";
import type { CustomStatus, CustomField } from "@/components/workflow-settings";

export function WorkflowSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const [statuses, setStatuses] = useState<CustomStatus[]>(() => loadStatuses());
  const [fields, setFields] = useState<CustomField[]>(() => loadFields());

  useEffect(() => {
    setBreadcrumbs([{ label: "Workflow Settings" }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const persistStatuses = useCallback((next: CustomStatus[]) => {
    setStatuses(next);
    saveStatuses(next);
  }, []);

  const persistFields = useCallback((next: CustomField[]) => {
    setFields(next);
    saveFields(next);
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workflow Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Customize mission statuses and add custom fields to your workflow.
        </p>
      </div>

      <StatusesSection
        statuses={statuses}
        onPersist={persistStatuses}
        onToast={(msg) => pushToast({ title: msg, tone: "success" })}
      />

      <CustomFieldsSection
        fields={fields}
        onPersist={persistFields}
        onToast={(msg) => pushToast({ title: msg, tone: msg.includes("removed") ? "info" : "success" })}
      />
    </div>
  );
}

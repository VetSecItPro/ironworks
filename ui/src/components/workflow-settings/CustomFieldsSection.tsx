import { useState } from "react";
import { Plus, Save, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CustomFieldRow } from "./CustomFieldRow";
import type { CustomField } from "./workflowTypes";
import { FIELD_TYPES, generateId } from "./workflowTypes";

interface CustomFieldsSectionProps {
  fields: CustomField[];
  onPersist: (next: CustomField[]) => void;
  onToast: (msg: string) => void;
}

export function CustomFieldsSection({ fields, onPersist, onToast }: CustomFieldsSectionProps) {
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<CustomField["type"]>("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [showNewField, setShowNewField] = useState(false);

  function addField() {
    if (!newFieldName.trim()) return;
    const next: CustomField[] = [
      ...fields,
      {
        id: generateId(),
        name: newFieldName.trim(),
        type: newFieldType,
        selectOptions: newFieldType === "select"
          ? newFieldOptions.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        required: false,
      },
    ];
    onPersist(next);
    setNewFieldName("");
    setNewFieldType("text");
    setNewFieldOptions("");
    setShowNewField(false);
    onToast("Custom field added");
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Custom Fields</h2>
          <span className="text-[10px] text-muted-foreground">
            {fields.length} field{fields.length !== 1 ? "s" : ""}
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowNewField(true)}>
          <Plus className="h-3 w-3 mr-1" />
          Add Field
        </Button>
      </div>

      {fields.length === 0 && !showNewField && (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No custom fields defined. Add fields to track additional information on issues.
        </p>
      )}

      <div className="space-y-0">
        {fields.map((field) => (
          <CustomFieldRow
            key={field.id}
            field={field}
            onUpdate={(updated) => {
              onPersist(fields.map((f) => f.id === updated.id ? updated : f));
            }}
            onDelete={() => {
              onPersist(fields.filter((f) => f.id !== field.id));
              onToast(`Field "${field.name}" removed`);
            }}
          />
        ))}
      </div>

      {showNewField && (
        <div className="mt-3 p-3 rounded-md bg-muted/30 border border-border space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              placeholder="Field name"
              className="h-7 text-xs flex-1"
              onKeyDown={(e) => { if (e.key === "Enter") addField(); }}
              autoFocus
            />
            <select
              value={newFieldType}
              onChange={(e) => setNewFieldType(e.target.value as CustomField["type"])}
              className="h-7 text-xs bg-background border border-border rounded px-2"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {newFieldType === "select" && (
            <Input
              value={newFieldOptions}
              onChange={(e) => setNewFieldOptions(e.target.value)}
              placeholder="Options (comma-separated): opt1, opt2, opt3"
              className="h-7 text-xs"
            />
          )}
          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowNewField(false)}>Cancel</Button>
            <Button size="sm" onClick={addField} disabled={!newFieldName.trim()}>
              <Save className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

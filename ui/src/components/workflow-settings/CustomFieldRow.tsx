import { Check, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomField } from "./workflowTypes";

interface CustomFieldRowProps {
  field: CustomField;
  onUpdate: (updated: CustomField) => void;
  onDelete: () => void;
}

export function CustomFieldRow({ field, onUpdate, onDelete }: CustomFieldRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(field.name);
  const [selectOptionsText, setSelectOptionsText] = useState((field.selectOptions ?? []).join(", "));

  function handleSave() {
    if (name.trim()) {
      const updated: CustomField = {
        ...field,
        name: name.trim(),
        selectOptions:
          field.type === "select"
            ? selectOptionsText
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
      };
      onUpdate(updated);
    }
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-2 py-2 px-2 rounded-md hover:bg-accent/30 group">
      <span className="text-sm flex-1">{field.name}</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
        {field.type}
      </span>
      {field.required && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 font-medium">
          required
        </span>
      )}
      {field.type === "select" && field.selectOptions && (
        <span className="text-[10px] text-muted-foreground">{field.selectOptions.length} options</span>
      )}

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {editing ? (
          <>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              className="h-7 text-xs w-24"
              autoFocus
            />
            {field.type === "select" && (
              <Input
                value={selectOptionsText}
                onChange={(e) => setSelectOptionsText(e.target.value)}
                placeholder="opt1, opt2, opt3"
                className="h-7 text-xs w-32"
              />
            )}
            <Button variant="ghost" size="icon-xs" onClick={handleSave}>
              <Check className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => setEditing(false)}>
              <X className="h-3 w-3" />
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="icon-xs" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onUpdate({ ...field, required: !field.required })}
              title={field.required ? "Make optional" : "Make required"}
            >
              {field.required ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <X className="h-3 w-3 text-muted-foreground" />
              )}
            </Button>
            <Button variant="ghost" size="icon-xs" className="text-destructive" onClick={onDelete}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

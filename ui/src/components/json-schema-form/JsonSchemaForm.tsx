import { useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { FormField, setJsonSchemaFormRef } from "./FormFields";
import { labelFromKey, resolveType } from "./helpers";
import type { JsonSchemaFormProps } from "./types";

export {
  getDefaultForSchema,
  getDefaultValues,
  labelFromKey,
  resolveType,
  validateField,
  validateJsonSchemaForm,
} from "./helpers";
// Re-export public API
export type { JsonSchemaFormProps, JsonSchemaNode } from "./types";

/**
 * Main JsonSchemaForm component.
 * Renders a form based on a subset of JSON Schema specification.
 * Supports primitive types, enums, secrets, objects, and arrays with recursion.
 */
export function JsonSchemaForm({ schema, values, onChange, errors = {}, disabled, className }: JsonSchemaFormProps) {
  const type = resolveType(schema);

  const handleRootScalarChange = useCallback(
    (newVal: unknown) => {
      // If root is a scalar, values IS the value
      onChange(newVal as Record<string, unknown>);
    },
    [onChange],
  );

  // Memoize to avoid re-renders when parent provides new object references
  const properties = useMemo(() => schema.properties ?? {}, [schema.properties]);
  const requiredFields = useMemo(() => new Set(schema.required ?? []), [schema.required]);

  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      onChange({ ...values, [key]: value });
    },
    [onChange, values],
  );

  // If it's a scalar at root, render a single FormField
  if (type !== "object") {
    return (
      <div className={className}>
        <FormField
          propSchema={schema}
          value={values}
          label=""
          path=""
          onChange={handleRootScalarChange}
          disabled={disabled}
          errors={errors}
        />
      </div>
    );
  }

  if (Object.keys(properties).length === 0) {
    return (
      <div className={cn("py-4 text-center text-sm text-muted-foreground", className)}>
        No configuration options available.
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {Object.entries(properties).map(([key, propSchema]) => {
        const value = values[key];
        const isRequired = requiredFields.has(key);
        const error = errors[`/${key}`];
        const label = labelFromKey(key, propSchema);
        const path = `/${key}`;

        return (
          <FormField
            key={key}
            propSchema={propSchema}
            value={value}
            onChange={(val) => handleFieldChange(key, val)}
            error={error}
            disabled={disabled}
            label={label}
            isRequired={isRequired}
            errors={errors}
            path={path}
          />
        );
      })}
    </div>
  );
}

// Wire up the circular reference for ObjectField -> JsonSchemaForm recursion
setJsonSchemaFormRef(JsonSchemaForm);

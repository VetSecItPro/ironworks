import { ChevronDown, ChevronRight, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getDefaultForSchema, resolveType, TEXTAREA_THRESHOLD } from "./helpers";
import type { FormFieldProps, JsonSchemaNode } from "./types";

// ---------------------------------------------------------------------------
// FieldWrapper
// ---------------------------------------------------------------------------

interface FieldWrapperProps {
  label: string;
  description?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

const FieldWrapper = React.memo(({ label, description, required, error, disabled, children }: FieldWrapperProps) => {
  return (
    <div className={cn("space-y-2", disabled && "opacity-60")}>
      <div className="flex items-center justify-between">
        {label && (
          <Label className="text-sm font-medium">
            {label}
            {required && <span className="ml-1 text-destructive">*</span>}
          </Label>
        )}
      </div>
      {children}
      {description && <p className="text-[12px] text-muted-foreground leading-relaxed">{description}</p>}
      {error && <p className="text-[12px] font-medium text-destructive">{error}</p>}
    </div>
  );
});

FieldWrapper.displayName = "FieldWrapper";

// ---------------------------------------------------------------------------
// BooleanField
// ---------------------------------------------------------------------------

export const BooleanField = React.memo(
  ({
    id,
    value,
    onChange,
    disabled,
    label,
    isRequired,
    description,
    error,
  }: {
    id: string;
    value: unknown;
    onChange: (val: unknown) => void;
    disabled: boolean;
    label: string;
    isRequired?: boolean;
    description?: string;
    error?: string;
  }) => (
    <div className="flex items-start space-x-3 space-y-0">
      <Checkbox id={id} checked={!!value} onCheckedChange={onChange} disabled={disabled} />
      <div className="grid gap-1.5 leading-none">
        {label && (
          <Label
            htmlFor={id}
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {label}
            {isRequired && <span className="ml-1 text-destructive">*</span>}
          </Label>
        )}
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      </div>
    </div>
  ),
);

BooleanField.displayName = "BooleanField";

// ---------------------------------------------------------------------------
// EnumField
// ---------------------------------------------------------------------------

export const EnumField = React.memo(
  ({
    value,
    onChange,
    disabled,
    label,
    isRequired,
    description,
    error,
    options,
  }: {
    value: unknown;
    onChange: (val: unknown) => void;
    disabled: boolean;
    label: string;
    isRequired?: boolean;
    description?: string;
    error?: string;
    options: unknown[];
  }) => (
    <FieldWrapper label={label} description={description} required={isRequired} error={error} disabled={disabled}>
      <Select value={String(value ?? "")} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={String(option)} value={String(option)}>
              {String(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldWrapper>
  ),
);

EnumField.displayName = "EnumField";

// ---------------------------------------------------------------------------
// SecretField
// ---------------------------------------------------------------------------

export const SecretField = React.memo(
  ({
    value,
    onChange,
    disabled,
    label,
    isRequired,
    description,
    error,
    defaultValue,
  }: {
    value: unknown;
    onChange: (val: unknown) => void;
    disabled: boolean;
    label: string;
    isRequired?: boolean;
    description?: string;
    error?: string;
    defaultValue?: unknown;
  }) => {
    const [isVisible, setIsVisible] = useState(false);
    return (
      <FieldWrapper
        label={label}
        description={description || "This secret is stored securely via the Ironworks secret provider."}
        required={isRequired}
        error={error}
        disabled={disabled}
      >
        <div className="relative">
          <Input
            type={isVisible ? "text" : "password"}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={String(defaultValue ?? "")}
            disabled={disabled}
            className="pr-10"
            aria-invalid={!!error}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
            onClick={() => setIsVisible(!isVisible)}
            disabled={disabled}
          >
            {isVisible ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="sr-only">{isVisible ? "Hide secret" : "Show secret"}</span>
          </Button>
        </div>
      </FieldWrapper>
    );
  },
);

SecretField.displayName = "SecretField";

// ---------------------------------------------------------------------------
// NumberField
// ---------------------------------------------------------------------------

export const NumberField = React.memo(
  ({
    value,
    onChange,
    disabled,
    label,
    isRequired,
    description,
    error,
    defaultValue,
    type,
  }: {
    value: unknown;
    onChange: (val: unknown) => void;
    disabled: boolean;
    label: string;
    isRequired?: boolean;
    description?: string;
    error?: string;
    defaultValue?: unknown;
    type: "number" | "integer";
  }) => (
    <FieldWrapper label={label} description={description} required={isRequired} error={error} disabled={disabled}>
      <Input
        type="number"
        inputMode={type === "integer" ? "numeric" : "decimal"}
        step={type === "integer" ? "1" : "any"}
        value={value !== undefined ? String(value) : ""}
        onChange={(e) => {
          const val = e.target.value;
          onChange(val === "" ? undefined : Number(val));
        }}
        placeholder={String(defaultValue ?? "")}
        disabled={disabled}
        aria-invalid={!!error}
      />
    </FieldWrapper>
  ),
);

NumberField.displayName = "NumberField";

// ---------------------------------------------------------------------------
// StringField
// ---------------------------------------------------------------------------

export const StringField = React.memo(
  ({
    value,
    onChange,
    disabled,
    label,
    isRequired,
    description,
    error,
    defaultValue,
    format,
    maxLength,
  }: {
    value: unknown;
    onChange: (val: unknown) => void;
    disabled: boolean;
    label: string;
    isRequired?: boolean;
    description?: string;
    error?: string;
    defaultValue?: unknown;
    format?: string;
    maxLength?: number;
  }) => {
    const isTextArea = format === "textarea" || (maxLength && maxLength > TEXTAREA_THRESHOLD);
    return (
      <FieldWrapper label={label} description={description} required={isRequired} error={error} disabled={disabled}>
        {isTextArea ? (
          <Textarea
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={String(defaultValue ?? "")}
            disabled={disabled}
            className="min-h-[100px]"
            aria-invalid={!!error}
          />
        ) : (
          <Input
            type="text"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            placeholder={String(defaultValue ?? "")}
            disabled={disabled}
            aria-invalid={!!error}
          />
        )}
      </FieldWrapper>
    );
  },
);

StringField.displayName = "StringField";

// ---------------------------------------------------------------------------
// ArrayField
// ---------------------------------------------------------------------------

export const ArrayField = React.memo(
  ({
    propSchema,
    value,
    onChange,
    error,
    disabled,
    label,
    errors,
    path,
  }: {
    propSchema: JsonSchemaNode;
    value: unknown;
    onChange: (val: unknown) => void;
    error?: string;
    disabled: boolean;
    label: string;
    errors: Record<string, string>;
    path: string;
  }) => {
    const items = Array.isArray(value) ? value : [];
    const itemSchema = propSchema.items as JsonSchemaNode;
    const isComplex = resolveType(itemSchema) === "object";

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">{label}</Label>
            {propSchema.description && <p className="text-xs text-muted-foreground">{propSchema.description}</p>}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              disabled || (propSchema.maxItems !== undefined && items.length >= (propSchema.maxItems as number))
            }
            onClick={() => {
              const newItem = getDefaultForSchema(itemSchema);
              onChange([...items, newItem]);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {isComplex ? "Add item" : "Add"}
          </Button>
        </div>

        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="group relative flex items-start space-x-2 rounded-lg border p-3">
              <div className="flex-1">
                <div className="mb-2 text-xs font-medium text-muted-foreground">Item {index + 1}</div>
                <FormField
                  propSchema={itemSchema}
                  value={item}
                  label=""
                  path={`${path}/${index}`}
                  onChange={(newVal) => {
                    const newItems = [...items];
                    newItems[index] = newVal;
                    onChange(newItems);
                  }}
                  disabled={disabled}
                  errors={errors}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                disabled={
                  disabled || (propSchema.minItems !== undefined && items.length <= (propSchema.minItems as number))
                }
                onClick={() => {
                  const newItems = [...items];
                  newItems.splice(index, 1);
                  onChange(newItems);
                }}
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Remove item</span>
              </Button>
            </div>
          ))}
          {items.length === 0 && (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              No items added yet.
            </div>
          )}
        </div>
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      </div>
    );
  },
);

ArrayField.displayName = "ArrayField";

// ---------------------------------------------------------------------------
// ObjectField (forward reference to JsonSchemaForm resolved at runtime)
// ---------------------------------------------------------------------------

// We need a lazy import to avoid circular deps. The JsonSchemaForm component
// is passed via the module-level setter below.
let _JsonSchemaForm: React.ComponentType<{
  schema: JsonSchemaNode;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  disabled?: boolean;
  errors?: Record<string, string>;
}> | null = null;

export function setJsonSchemaFormRef(component: typeof _JsonSchemaForm) {
  _JsonSchemaForm = component;
}

export const ObjectField = React.memo(
  ({
    propSchema,
    value,
    onChange,
    disabled,
    label,
    errors,
    path,
  }: {
    propSchema: JsonSchemaNode;
    value: unknown;
    onChange: (val: unknown) => void;
    disabled: boolean;
    label: string;
    errors: Record<string, string>;
    path: string;
  }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const handleObjectChange = (newVal: Record<string, unknown>) => {
      onChange(newVal);
    };

    return (
      <div className="space-y-3 rounded-lg border p-4">
        <button
          type="button"
          className="flex w-full items-center justify-between"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <div className="text-left">
            <Label className="cursor-pointer text-sm font-semibold">{label}</Label>
            {propSchema.description && <p className="text-xs text-muted-foreground">{propSchema.description}</p>}
          </div>
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {!isCollapsed && _JsonSchemaForm && (
          <div className="pt-2">
            <_JsonSchemaForm
              schema={propSchema}
              values={(value as Record<string, unknown>) ?? {}}
              onChange={handleObjectChange}
              disabled={disabled}
              errors={Object.fromEntries(
                Object.entries(errors)
                  .filter(([errPath]) => errPath.startsWith(`${path}/`))
                  .map(([errPath, err]) => [errPath.replace(path, ""), err]),
              )}
            />
          </div>
        )}
      </div>
    );
  },
);

ObjectField.displayName = "ObjectField";

// ---------------------------------------------------------------------------
// FormField (orchestrator)
// ---------------------------------------------------------------------------

export const FormField = React.memo(
  ({ propSchema, value, onChange, error, disabled, label, isRequired, errors, path }: FormFieldProps) => {
    const type = resolveType(propSchema);
    const isReadOnly = disabled || propSchema.readOnly === true;

    switch (type) {
      case "boolean":
        return (
          <BooleanField
            id={path}
            value={value}
            onChange={onChange}
            disabled={isReadOnly}
            label={label}
            isRequired={isRequired}
            description={propSchema.description}
            error={error}
          />
        );

      case "enum":
        return (
          <EnumField
            value={value}
            onChange={onChange}
            disabled={isReadOnly}
            label={label}
            isRequired={isRequired}
            description={propSchema.description}
            error={error}
            options={propSchema.enum ?? []}
          />
        );

      case "secret-ref":
        return (
          <SecretField
            value={value}
            onChange={onChange}
            disabled={isReadOnly}
            label={label}
            isRequired={isRequired}
            description={propSchema.description}
            error={error}
            defaultValue={propSchema.default}
          />
        );

      case "number":
      case "integer":
        return (
          <NumberField
            value={value}
            onChange={onChange}
            disabled={isReadOnly}
            label={label}
            isRequired={isRequired}
            description={propSchema.description}
            error={error}
            defaultValue={propSchema.default}
            type={type as "number" | "integer"}
          />
        );

      case "array":
        return (
          <ArrayField
            propSchema={propSchema}
            value={value}
            onChange={onChange}
            error={error}
            disabled={isReadOnly}
            label={label}
            errors={errors}
            path={path}
          />
        );

      case "object":
        return (
          <ObjectField
            propSchema={propSchema}
            value={value}
            onChange={onChange}
            disabled={isReadOnly}
            label={label}
            errors={errors}
            path={path}
          />
        );

      default: // string
        return (
          <StringField
            value={value}
            onChange={onChange}
            disabled={isReadOnly}
            label={label}
            isRequired={isRequired}
            description={propSchema.description}
            error={error}
            defaultValue={propSchema.default}
            format={propSchema.format}
            maxLength={propSchema.maxLength}
          />
        );
    }
  },
);

FormField.displayName = "FormField";

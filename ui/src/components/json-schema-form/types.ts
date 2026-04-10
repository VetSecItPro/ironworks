/**
 * Subset of JSON Schema properties we understand for form rendering.
 * We intentionally keep this loose (`Record<string, unknown>`) at the top
 * level to match the `JsonSchema` type in shared, but narrow internally.
 */
export interface JsonSchemaNode {
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  const?: unknown;
  format?: string;

  // String constraints
  minLength?: number;
  maxLength?: number;
  pattern?: string;

  // Number constraints
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // Object
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaNode;

  // Array
  items?: JsonSchemaNode;
  minItems?: number;
  maxItems?: number;

  // Metadata
  readOnly?: boolean;
  writeOnly?: boolean;

  // Allow extra keys
  [key: string]: unknown;
}

export interface JsonSchemaFormProps {
  /** The JSON Schema to render. */
  schema: JsonSchemaNode;
  /** Current form values. */
  values: Record<string, unknown>;
  /** Called whenever any field value changes. */
  onChange: (values: Record<string, unknown>) => void;
  /** Validation errors keyed by JSON pointer path (e.g. "/apiKey"). */
  errors?: Record<string, string>;
  /** If true, all fields are disabled. */
  disabled?: boolean;
  /** Additional CSS class for the root container. */
  className?: string;
}

export interface FormFieldProps {
  propSchema: JsonSchemaNode;
  value: unknown;
  onChange: (val: unknown) => void;
  error?: string;
  disabled?: boolean;
  label: string;
  isRequired?: boolean;
  errors: Record<string, string>; // needed for recursion
  path: string; // needed for recursion error filtering
}

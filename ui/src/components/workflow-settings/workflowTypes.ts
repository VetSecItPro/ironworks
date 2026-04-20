export interface CustomStatus {
  id: string;
  label: string;
  category: "open" | "closed";
  color: string;
  isDefault: boolean;
}

export interface CustomField {
  id: string;
  name: string;
  type: "text" | "number" | "date" | "select";
  selectOptions?: string[];
  required: boolean;
}

export const STATUS_STORAGE_KEY = "ironworks.custom-statuses";
export const FIELDS_STORAGE_KEY = "ironworks.custom-fields";

export const DEFAULT_STATUSES: CustomStatus[] = [
  { id: "backlog", label: "Backlog", category: "open", color: "bg-muted-foreground", isDefault: true },
  { id: "todo", label: "Todo", category: "open", color: "bg-blue-500", isDefault: true },
  { id: "in_progress", label: "In Progress", category: "open", color: "bg-yellow-500", isDefault: true },
  { id: "in_review", label: "In Review", category: "open", color: "bg-violet-500", isDefault: true },
  { id: "done", label: "Done", category: "closed", color: "bg-green-500", isDefault: true },
  { id: "cancelled", label: "Cancelled", category: "closed", color: "bg-neutral-500", isDefault: true },
];

export const COLOR_OPTIONS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-yellow-500",
  "bg-orange-500",
  "bg-red-500",
  "bg-violet-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-emerald-500",
  "bg-muted-foreground",
  "bg-neutral-500",
];

export const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
] as const;

export function loadStatuses(): CustomStatus[] {
  try {
    const raw = localStorage.getItem(STATUS_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CustomStatus[];
  } catch {
    /* ignore */
  }
  return [...DEFAULT_STATUSES];
}

export function saveStatuses(statuses: CustomStatus[]) {
  localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(statuses));
}

export function loadFields(): CustomField[] {
  try {
    const raw = localStorage.getItem(FIELDS_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CustomField[];
  } catch {
    /* ignore */
  }
  return [];
}

export function saveFields(fields: CustomField[]) {
  localStorage.setItem(FIELDS_STORAGE_KEY, JSON.stringify(fields));
}

export function generateId() {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

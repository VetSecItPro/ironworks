import type { CreateConfigValues } from "@ironworksai/adapter-utils";
import type { AdapterEnvironmentTestResult, Agent, CompanySecret, EnvBinding } from "@ironworksai/shared";
import type { AdapterModel } from "../../api/agents";

/* ---- Edit mode overlay (dirty tracking) ---- */

export interface Overlay {
  identity: Record<string, unknown>;
  adapterType?: string;
  adapterConfig: Record<string, unknown>;
  heartbeat: Record<string, unknown>;
  runtime: Record<string, unknown>;
}

export const emptyOverlay: Overlay = {
  identity: {},
  adapterConfig: {},
  heartbeat: {},
  runtime: {},
};

/** Stable empty object used as fallback for missing env config to avoid new-object-per-render. */
export const EMPTY_ENV: Record<string, EnvBinding> = {};

export function isOverlayDirty(o: Overlay): boolean {
  return (
    Object.keys(o.identity).length > 0 ||
    o.adapterType !== undefined ||
    Object.keys(o.adapterConfig).length > 0 ||
    Object.keys(o.heartbeat).length > 0 ||
    Object.keys(o.runtime).length > 0
  );
}

/* ---- Shared input class ---- */
export const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

export function parseCommaArgs(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatArgList(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").join(", ");
  }
  return typeof value === "string" ? value : "";
}

export const codexThinkingEffortOptions = [
  { id: "", label: "Auto" },
  { id: "minimal", label: "Minimal" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
] as const;

export const openCodeThinkingEffortOptions = [
  { id: "", label: "Auto" },
  { id: "minimal", label: "Minimal" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "max", label: "Max" },
] as const;

export const cursorModeOptions = [
  { id: "", label: "Auto" },
  { id: "plan", label: "Plan" },
  { id: "ask", label: "Ask" },
] as const;

export const claudeThinkingEffortOptions = [
  { id: "", label: "Auto" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
] as const;

/* ---- Common prop types for section components ---- */

export type EffFn = <T>(group: keyof Omit<Overlay, "adapterType">, field: string, original: T) => T;
export type MarkFn = (group: keyof Omit<Overlay, "adapterType">, field: string, value: unknown) => void;

export interface SectionCommonProps {
  isCreate: boolean;
  cards: boolean;
  eff: EffFn;
  mark: MarkFn;
}

export type { AdapterEnvironmentTestResult, AdapterModel, Agent, CompanySecret, CreateConfigValues, EnvBinding };

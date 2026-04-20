/**
 * Shared form field primitives for HTTP adapter config forms.
 * These are layout-only — they never touch the API key (keys live in Settings > Providers).
 */

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "../../../lib/utils";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40 h-9";

export function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground/60 leading-tight">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function ModelSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="inline-flex items-center justify-between w-full rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent/50 transition-colors"
      >
        <span className="font-mono">{selected?.label ?? value}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-60 overflow-y-auto p-1">
          {options.map((o) => (
            <button
              type="button"
              key={o.id}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              className={cn(
                "flex items-center w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                o.id === value && "bg-accent",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TemperatureSlider({
  value,
  min = 0,
  max = 2,
  onChange,
}: {
  value: number | undefined;
  min?: number;
  max?: number;
  onChange: (v: number | undefined) => void;
}) {
  const displayValue = value ?? "";
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={0.05}
        value={value ?? min}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-primary"
      />
      <Input
        type="number"
        min={min}
        max={max}
        step={0.05}
        value={displayValue}
        onChange={(e) => {
          const v = e.target.value === "" ? undefined : parseFloat(e.target.value);
          onChange(v);
        }}
        placeholder="default"
        className={cn(inputClass, "w-20")}
      />
    </div>
  );
}

export function NumberInput({
  value,
  min,
  max,
  placeholder,
  onChange,
}: {
  value: number | undefined;
  min?: number;
  max?: number;
  placeholder?: string;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <Input
      type="number"
      min={min}
      max={max}
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value === "" ? undefined : parseInt(e.target.value, 10);
        onChange(v);
      }}
      placeholder={placeholder ?? "default"}
      className={inputClass}
    />
  );
}

export function TextInput({
  value,
  placeholder,
  onChange,
}: {
  value: string | undefined;
  placeholder?: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <input
      type="text"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      placeholder={placeholder}
      className={inputClass}
    />
  );
}

export interface SkillOption {
  key: string;
  label: string;
}

/** Multi-select chip list for systemPromptSkills. */
export function SkillsMultiSelect({
  value,
  skills,
  onChange,
}: {
  value: string[];
  skills: SkillOption[];
  onChange: (v: string[]) => void;
}) {
  function toggle(key: string) {
    if (value.includes(key)) {
      onChange(value.filter((k) => k !== key));
    } else {
      onChange([...value, key]);
    }
  }

  if (skills.length === 0) {
    return <p className="text-xs text-muted-foreground">No skills installed in this workspace.</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((s) => {
        const selected = value.includes(s.key);
        return (
          <button type="button" key={s.key} onClick={() => toggle(s.key)} className="focus:outline-none">
            <Badge
              variant={selected ? "default" : "outline"}
              className={cn("cursor-pointer transition-colors", selected && "bg-primary/90")}
            >
              {s.label}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}

import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "../../lib/utils";
import { Field, help } from "../agent-config-primitives";

export function ThinkingEffortDropdown({
  value,
  options,
  onChange,
  open,
  onOpenChange,
}: {
  value: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  onChange: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const selected = options.find((option) => option.id === value) ?? options[0];

  return (
    <Field label="Thinking effort" hint={help.thinkingEffort}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent/50 transition-colors w-full justify-between">
            <span className={cn(!value && "text-muted-foreground")}>{selected?.label ?? "Auto"}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1" align="start">
          {options.map((option) => (
            <button
              key={option.id || "auto"}
              className={cn(
                "flex items-center justify-between w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50",
                option.id === value && "bg-accent",
              )}
              onClick={() => {
                onChange(option.id);
                onOpenChange(false);
              }}
            >
              <span>{option.label}</span>
              {option.id ? <span className="text-xs text-muted-foreground font-mono">{option.id}</span> : null}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </Field>
  );
}

import { AGENT_ADAPTER_TYPES } from "@ironworksai/shared";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "../../lib/utils";
import { adapterLabels } from "../agent-config-primitives";
import { OpenCodeLogoIcon } from "../OpenCodeLogoIcon";

const ENABLED_ADAPTER_TYPES = new Set([
  "claude_local",
  "codex_local",
  "gemini_local",
  "opencode_local",
  "pi_local",
  "cursor",
]);

/** Display list includes all real adapter types; disabled entries are not yet available. */
const ADAPTER_DISPLAY_LIST: { value: string; label: string; disabled: boolean }[] = [
  ...AGENT_ADAPTER_TYPES.map((t) => ({
    value: t,
    label: adapterLabels[t] ?? t,
    disabled: !ENABLED_ADAPTER_TYPES.has(t),
  })),
];

export function AdapterTypeDropdown({ value, onChange }: { value: string; onChange: (type: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent/50 transition-colors w-full justify-between"
        >
          <span className="inline-flex items-center gap-1.5">
            {value === "opencode_local" ? <OpenCodeLogoIcon className="h-3.5 w-3.5" /> : null}
            <span>{adapterLabels[value] ?? value}</span>
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1" align="start">
        {ADAPTER_DISPLAY_LIST.map((item) => (
          <button
            type="button"
            key={item.value}
            disabled={item.disabled}
            className={cn(
              "flex items-center justify-between w-full px-2 py-1.5 text-sm rounded",
              item.disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-accent/50",
              item.value === value && !item.disabled && "bg-accent",
            )}
            onClick={() => {
              if (!item.disabled) onChange(item.value);
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              {item.value === "opencode_local" ? <OpenCodeLogoIcon className="h-3.5 w-3.5" /> : null}
              <span>{item.label}</span>
            </span>
            {item.disabled && <span className="text-[10px] text-muted-foreground">Not yet available</span>}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

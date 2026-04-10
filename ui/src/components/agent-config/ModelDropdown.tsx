import { useState, useMemo } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { extractModelName, extractProviderId } from "../../lib/model-utils";
import { Field, help } from "../agent-config-primitives";
import type { AdapterModel } from "./types";

export function ModelDropdown({
  models,
  value,
  onChange,
  open,
  onOpenChange,
  allowDefault,
  required,
  groupByProvider,
}: {
  models: AdapterModel[];
  value: string;
  onChange: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowDefault: boolean;
  required: boolean;
  groupByProvider: boolean;
}) {
  const [modelSearch, setModelSearch] = useState("");
  const selected = models.find((m) => m.id === value);
  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      if (!modelSearch.trim()) return true;
      const q = modelSearch.toLowerCase();
      const provider = extractProviderId(m.id) ?? "";
      return (
        m.id.toLowerCase().includes(q) ||
        m.label.toLowerCase().includes(q) ||
        provider.toLowerCase().includes(q)
      );
    });
  }, [models, modelSearch]);
  const groupedModels = useMemo(() => {
    if (!groupByProvider) {
      return [
        {
          provider: "models",
          entries: [...filteredModels].sort((a, b) => a.id.localeCompare(b.id)),
        },
      ];
    }
    const map = new Map<string, AdapterModel[]>();
    for (const model of filteredModels) {
      const provider = extractProviderId(model.id) ?? "other";
      const group = map.get(provider) ?? [];
      group.push(model);
      map.set(provider, group);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, entries]) => ({
        provider,
        entries: [...entries].sort((a, b) => a.id.localeCompare(b.id)),
      }));
  }, [filteredModels, groupByProvider]);

  return (
    <Field label="Model" hint={help.model}>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          onOpenChange(nextOpen);
          if (!nextOpen) setModelSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent/50 transition-colors w-full justify-between">
            <span className={cn(!value && "text-muted-foreground")}>
              {selected
                ? selected.label
                : value || (allowDefault ? "Default" : required ? "Select model (required)" : "Select model")}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1" align="start">
          <input
            className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/70"
            placeholder="Search models..."
            value={modelSearch}
            onChange={(e) => setModelSearch(e.target.value)}
            autoFocus
          />
          <div className="max-h-[240px] overflow-y-auto">
            {allowDefault && (
              <button
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50",
                  !value && "bg-accent",
                )}
                onClick={() => {
                  onChange("");
                  onOpenChange(false);
                }}
              >
                Default
              </button>
            )}
            {groupedModels.map((group) => (
              <div key={group.provider} className="mb-1 last:mb-0">
                {groupByProvider && (
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {group.provider} ({group.entries.length})
                  </div>
                )}
                {group.entries.map((m) => (
                  <button
                    key={m.id}
                    className={cn(
                      "flex items-center w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50",
                      m.id === value && "bg-accent",
                    )}
                    onClick={() => {
                      onChange(m.id);
                      onOpenChange(false);
                    }}
                  >
                    <span className="block w-full text-left truncate" title={m.id}>
                      {groupByProvider ? extractModelName(m.id) : m.label}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {filteredModels.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">No models found.</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

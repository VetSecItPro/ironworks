import { Calendar, ChevronDown } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "../lib/utils";

export interface DateRange {
  from: Date;
  to: Date;
}

type PresetKey = "today" | "this_week" | "last_7" | "this_month" | "custom";

interface Preset {
  key: PresetKey;
  label: string;
  range: () => DateRange;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

const PRESETS: Preset[] = [
  {
    key: "today",
    label: "Today",
    range: () => {
      const now = new Date();
      return { from: startOfDay(now), to: endOfDay(now) };
    },
  },
  {
    key: "this_week",
    label: "This Week",
    range: () => {
      const now = new Date();
      const day = now.getDay();
      const from = new Date(now);
      from.setDate(now.getDate() - day);
      return { from: startOfDay(from), to: endOfDay(now) };
    },
  },
  {
    key: "last_7",
    label: "Last 7 Days",
    range: () => {
      const now = new Date();
      const from = new Date(now);
      from.setDate(now.getDate() - 6);
      return { from: startOfDay(from), to: endOfDay(now) };
    },
  },
  {
    key: "this_month",
    label: "This Month",
    range: () => {
      const now = new Date();
      return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
    },
  },
];

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface DateRangePickerProps {
  value?: DateRange | null;
  onChange: (range: DateRange | null) => void;
  className?: string;
  placeholder?: string;
}

export function DateRangePicker({ value, onChange, className, placeholder = "Date range" }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<PresetKey | null>(null);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const displayLabel = useMemo(() => {
    if (!value) return placeholder;
    if (activePreset && activePreset !== "custom") {
      const preset = PRESETS.find((p) => p.key === activePreset);
      if (preset) return preset.label;
    }
    return `${formatShortDate(value.from)} - ${formatShortDate(value.to)}`;
  }, [value, activePreset, placeholder]);

  const selectPreset = useCallback(
    (preset: Preset) => {
      setActivePreset(preset.key);
      onChange(preset.range());
      setOpen(false);
    },
    [onChange],
  );

  const handleCustomApply = useCallback(() => {
    if (!customFrom || !customTo) return;
    const from = new Date(customFrom);
    const to = new Date(customTo);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return;
    setActivePreset("custom");
    onChange({ from: startOfDay(from), to: endOfDay(to) });
    setOpen(false);
  }, [customFrom, customTo, onChange]);

  const handleClear = useCallback(() => {
    setActivePreset(null);
    setCustomFrom("");
    setCustomTo("");
    onChange(null);
    setOpen(false);
  }, [onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-1.5 text-xs font-normal", !value && "text-muted-foreground", className)}
        >
          <Calendar className="h-3.5 w-3.5" />
          {displayLabel}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={cn(
                "flex w-full items-center rounded-md px-2.5 py-1.5 text-xs transition-colors",
                activePreset === preset.key
                  ? "bg-accent text-foreground font-medium"
                  : "hover:bg-accent/50 text-foreground/80",
              )}
              onClick={() => selectPreset(preset)}
            >
              {preset.label}
            </button>
          ))}

          <div className="border-t border-border pt-2 mt-2">
            <p className="text-[10px] uppercase text-muted-foreground font-medium mb-1.5 px-1">Custom Range</p>
            <div className="flex gap-1.5">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="flex-1 min-w-0 rounded border border-border bg-transparent px-1.5 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
              />
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="flex-1 min-w-0 rounded border border-border bg-transparent px-1.5 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
              />
            </div>
            <div className="flex gap-1.5 mt-1.5">
              <Button
                size="sm"
                className="flex-1 h-6 text-xs"
                onClick={handleCustomApply}
                disabled={!customFrom || !customTo}
              >
                Apply
              </Button>
              {value && (
                <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={handleClear}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

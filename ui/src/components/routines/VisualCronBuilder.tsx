import { cn } from "../../lib/utils";

export function VisualCronBuilder({ value, onChange }: { value: string; onChange: (cron: string) => void }) {
  const daysOfWeek = [
    { value: "1", label: "Mon" },
    { value: "2", label: "Tue" },
    { value: "3", label: "Wed" },
    { value: "4", label: "Thu" },
    { value: "5", label: "Fri" },
    { value: "6", label: "Sat" },
    { value: "0", label: "Sun" },
  ];

  const parts = value.trim().split(/\s+/);
  const isValid = parts.length === 5;
  const minute = isValid ? parts[0] : "0";
  const hour = isValid ? parts[1] : "10";
  const dow = isValid ? parts[4] : "*";

  const selectedDays = new Set(
    dow === "*" ? daysOfWeek.map((d) => d.value) : dow === "1-5" ? ["1", "2", "3", "4", "5"] : dow.split(","),
  );

  const toggleDay = (dayVal: string) => {
    const next = new Set(selectedDays);
    if (next.has(dayVal)) next.delete(dayVal);
    else next.add(dayVal);
    const dowStr = next.size === 7 ? "*" : next.size === 0 ? "*" : Array.from(next).sort().join(",");
    onChange(`${minute} ${hour} * * ${dowStr}`);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="text-xs font-medium text-muted-foreground">Visual Schedule</div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">At</span>
        <select
          className="text-xs bg-transparent border border-border rounded px-2 py-1"
          value={hour}
          onChange={(e) => onChange(`${minute} ${e.target.value} * * ${dow}`)}
        >
          {Array.from({ length: 24 }, (_, i) => (
            <option key={String(i)} value={String(i)}>
              {i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">:</span>
        <select
          className="text-xs bg-transparent border border-border rounded px-2 py-1"
          value={minute}
          onChange={(e) => onChange(`${e.target.value} ${hour} * * ${dow}`)}
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={String(i * 5)} value={String(i * 5)}>
              {String(i * 5).padStart(2, "0")}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground mr-1">On:</span>
        {daysOfWeek.map((day) => (
          <button
            key={day.value}
            type="button"
            onClick={() => toggleDay(day.value)}
            className={cn(
              "h-7 w-9 rounded text-[10px] font-medium transition-colors",
              selectedDays.has(day.value)
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-accent",
            )}
          >
            {day.label}
          </button>
        ))}
      </div>
      <div className="text-[10px] font-mono text-muted-foreground/80">Cron: {value}</div>
    </div>
  );
}

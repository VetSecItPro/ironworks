import { SlidersHorizontal } from "lucide-react";
import { AUTONOMY_LEVELS, type AutonomyLevel } from "@ironworksai/shared";
import { HelpBeacon } from "../HelpBeacon";

interface AutonomySectionProps {
  defaultAutonomy: AutonomyLevel;
  onAutonomyChange: (level: AutonomyLevel) => void;
}

export function AutonomySection({
  defaultAutonomy,
  onAutonomyChange,
}: AutonomySectionProps) {
  return (
    <div id="autonomy" className="space-y-4 scroll-mt-6">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Default Autonomy Level
        <HelpBeacon text="Autonomy level controls how much human approval an agent needs before acting. Lower levels (like h1) require approval for almost everything, while higher levels (like h5) let agents act independently. New agents inherit this default." />
      </div>
      <div className="rounded-md border border-border px-4 py-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Set the default level of human oversight applied to new agents in
          this company.
        </p>
        <div className="space-y-2">
          {AUTONOMY_LEVELS.map((level) => (
            <label
              key={level.key}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                defaultAutonomy === level.key
                  ? "border-indigo-500/60 bg-indigo-500/5"
                  : "border-border hover:border-border/80 hover:bg-muted/30"
              }`}
            >
              <input
                type="radio"
                name="autonomy-level"
                value={level.key}
                checked={defaultAutonomy === level.key}
                onChange={() => onAutonomyChange(level.key)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-indigo-500"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-indigo-400 uppercase">
                    {level.key.toUpperCase()}
                  </span>
                  <span className="text-sm font-medium">{level.label}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {level.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

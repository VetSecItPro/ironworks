import { useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  Field,
  ToggleField,
  ToggleWithNumber,
  CollapsibleSection,
  DraftNumberInput,
  help,
} from "../agent-config-primitives";
import { HelpBeacon } from "../HelpBeacon";
import type { SectionCommonProps, CreateConfigValues } from "./types";
import { inputClass } from "./types";

interface RunPolicySectionProps extends SectionCommonProps {
  showCreateRunPolicySection: boolean;
  heartbeat: Record<string, unknown>;
  val: CreateConfigValues | null;
  set: ((patch: Partial<CreateConfigValues>) => void) | null;
}

export function RunPolicySection({
  isCreate,
  cards,
  eff,
  mark,
  showCreateRunPolicySection,
  heartbeat,
  val,
  set,
}: RunPolicySectionProps) {
  const [runPolicyAdvancedOpen, setRunPolicyAdvancedOpen] = useState(false);

  if (isCreate && showCreateRunPolicySection) {
    return (
      <div className={cn(!cards && "border-b border-border")}>
        {cards
          ? <h3 className="text-sm font-medium flex items-center gap-2 mb-3"><Heart className="h-3 w-3" /> Run Policy <HelpBeacon text="The heartbeat interval controls how often this agent wakes up to check for new work. A shorter interval means faster response times but higher resource usage. 300 seconds (5 minutes) is a good default for most agents." /></h3>
          : <div className="px-4 py-2 text-xs font-medium text-muted-foreground flex items-center gap-2"><Heart className="h-3 w-3" /> Run Policy <HelpBeacon text="The heartbeat interval controls how often this agent wakes up to check for new work. A shorter interval means faster response times but higher resource usage. 300 seconds (5 minutes) is a good default for most agents." /></div>
        }
        <div className={cn(cards ? "border border-border rounded-lg p-4 space-y-3" : "px-4 pb-3 space-y-3")}>
          <ToggleWithNumber
            label="Heartbeat on interval"
            hint={help.heartbeatInterval}
            checked={val!.heartbeatEnabled}
            onCheckedChange={(v) => set!({ heartbeatEnabled: v })}
            number={val!.intervalSec}
            onNumberChange={(v) => set!({ intervalSec: v })}
            numberLabel="sec"
            numberPrefix="Run heartbeat every"
            numberHint={help.intervalSec}
            showNumber={val!.heartbeatEnabled}
          />
        </div>
      </div>
    );
  }

  if (!isCreate) {
    return (
      <div className={cn(!cards && "border-b border-border")}>
        {cards
          ? <h3 className="text-sm font-medium flex items-center gap-2 mb-3"><Heart className="h-3 w-3" /> Run Policy</h3>
          : <div className="px-4 py-2 text-xs font-medium text-muted-foreground flex items-center gap-2"><Heart className="h-3 w-3" /> Run Policy</div>
        }
        <div className={cn(cards ? "border border-border rounded-lg overflow-hidden" : "")}>
          <div className={cn(cards ? "p-4 space-y-3" : "px-4 pb-3 space-y-3")}>
            <ToggleWithNumber
              label="Heartbeat on interval"
              hint={help.heartbeatInterval}
              checked={eff("heartbeat", "enabled", heartbeat.enabled !== false)}
              onCheckedChange={(v) => mark("heartbeat", "enabled", v)}
              number={eff("heartbeat", "intervalSec", Number(heartbeat.intervalSec ?? 300))}
              onNumberChange={(v) => mark("heartbeat", "intervalSec", v)}
              numberLabel="sec"
              numberPrefix="Run heartbeat every"
              numberHint={help.intervalSec}
              showNumber={eff("heartbeat", "enabled", heartbeat.enabled !== false)}
            />
          </div>
          <CollapsibleSection
            title="Advanced Run Policy"
            bordered={cards}
            open={runPolicyAdvancedOpen}
            onToggle={() => setRunPolicyAdvancedOpen(!runPolicyAdvancedOpen)}
          >
          <div className="space-y-3">
            <ToggleField
              label="Wake on demand"
              hint={help.wakeOnDemand}
              checked={eff(
                "heartbeat",
                "wakeOnDemand",
                heartbeat.wakeOnDemand !== false,
              )}
              onChange={(v) => mark("heartbeat", "wakeOnDemand", v)}
            />
            <Field label="Cooldown (sec)" hint={help.cooldownSec}>
              <DraftNumberInput
                value={eff(
                  "heartbeat",
                  "cooldownSec",
                  Number(heartbeat.cooldownSec ?? 10),
                )}
                onCommit={(v) => mark("heartbeat", "cooldownSec", v)}
                immediate
                className={inputClass}
              />
            </Field>
            <Field label="Max concurrent runs" hint={help.maxConcurrentRuns}>
              <DraftNumberInput
                value={eff(
                  "heartbeat",
                  "maxConcurrentRuns",
                  Number(heartbeat.maxConcurrentRuns ?? 1),
                )}
                onCommit={(v) => mark("heartbeat", "maxConcurrentRuns", v)}
                immediate
                className={inputClass}
              />
            </Field>
          </div>
        </CollapsibleSection>
        </div>
      </div>
    );
  }

  return null;
}

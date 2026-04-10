import { Clock3, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScheduleEditor } from "../ScheduleEditor";
import { TriggerEditor } from "./TriggerEditor";
import type { RoutineTrigger } from "@ironworksai/shared";

const triggerKinds = ["schedule", "webhook"];
const signingModes = ["bearer", "hmac_sha256"];
const signingModeDescriptions: Record<string, string> = {
  bearer: "Expect a shared bearer token in the Authorization header.",
  hmac_sha256: "Expect an HMAC SHA-256 signature over the request using the shared secret.",
};

export function TriggersTab({
  triggers,
  newTrigger,
  onNewTriggerChange,
  onCreateTrigger,
  createPending,
  onSaveTrigger,
  onRotateTrigger,
  onDeleteTrigger,
}: {
  triggers: RoutineTrigger[];
  newTrigger: {
    kind: string;
    cronExpression: string;
    signingMode: string;
    replayWindowSec: string;
  };
  onNewTriggerChange: (patch: Partial<{
    kind: string;
    cronExpression: string;
    signingMode: string;
    replayWindowSec: string;
  }>) => void;
  onCreateTrigger: () => void;
  createPending: boolean;
  onSaveTrigger: (id: string, patch: Record<string, unknown>) => void;
  onRotateTrigger: (id: string) => void;
  onDeleteTrigger: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Add trigger form */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <p className="text-sm font-medium">Add trigger</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Kind</Label>
            <Select value={newTrigger.kind} onValueChange={(kind) => onNewTriggerChange({ kind })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {triggerKinds.map((kind) => (
                  <SelectItem key={kind} value={kind} disabled={kind === "webhook"}>
                    {kind}{kind === "webhook" ? " (not yet available)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {newTrigger.kind === "schedule" && (
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-xs">Schedule</Label>
              <ScheduleEditor
                value={newTrigger.cronExpression}
                onChange={(cronExpression) => onNewTriggerChange({ cronExpression })}
              />
            </div>
          )}
          {newTrigger.kind === "webhook" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Signing mode</Label>
                <Select value={newTrigger.signingMode} onValueChange={(signingMode) => onNewTriggerChange({ signingMode })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {signingModes.map((mode) => (
                      <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{signingModeDescriptions[newTrigger.signingMode]}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Replay window (seconds)</Label>
                <Input value={newTrigger.replayWindowSec} onChange={(event) => onNewTriggerChange({ replayWindowSec: event.target.value })} />
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-end">
          <Button size="sm" onClick={onCreateTrigger} disabled={createPending}>
            {createPending ? "Adding..." : "Add trigger"}
          </Button>
        </div>
      </div>

      {/* Existing triggers */}
      {triggers.length === 0 ? (
        <p className="text-xs text-muted-foreground">No triggers configured yet.</p>
      ) : (
        <div className="space-y-3">
          {triggers.map((trigger) => (
            <TriggerEditor
              key={trigger.id}
              trigger={trigger}
              onSave={onSaveTrigger}
              onRotate={onRotateTrigger}
              onDelete={onDeleteTrigger}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CreateCheckInPayload } from "../../api/goalCheckIns";
import { cn } from "../../lib/utils";

export const CHECKIN_STATUS_COLORS: Record<string, string> = {
  on_track: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  at_risk: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  off_track: "bg-red-500/10 text-red-600 dark:text-red-400",
  achieved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  cancelled: "bg-muted text-muted-foreground",
};

export function CheckInStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
        CHECKIN_STATUS_COLORS[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function AddCheckInForm({
  defaultConfidence,
  onSubmit,
  isPending,
}: {
  defaultConfidence: number;
  onSubmit: (data: CreateCheckInPayload) => void;
  isPending: boolean;
}) {
  const [status, setStatus] = useState("on_track");
  const [confidence, setConfidence] = useState(defaultConfidence);
  const [note, setNote] = useState("");
  const [blockers, setBlockers] = useState("");
  const [nextSteps, setNextSteps] = useState("");

  const handleSubmit = () => {
    onSubmit({
      status,
      confidence,
      note: note.trim() || undefined,
      blockers: blockers.trim() || undefined,
      nextSteps: nextSteps.trim() || undefined,
    });
    setNote("");
    setBlockers("");
    setNextSteps("");
  };

  const confColor =
    confidence > 66
      ? "text-emerald-600 dark:text-emerald-400"
      : confidence > 33
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add Check-in</h4>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Status</span>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 text-xs" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on_track">On Track</SelectItem>
              <SelectItem value="at_risk">At Risk</SelectItem>
              <SelectItem value="off_track">Off Track</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label htmlFor="checkin-confidence" className="text-xs text-muted-foreground">
            Confidence: <span className={cn("font-medium", confColor)}>{confidence}</span>
          </label>
          <input
            id="checkin-confidence"
            type="range"
            min={0}
            max={100}
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
            className="w-full h-1.5 accent-foreground cursor-pointer"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="checkin-note" className="text-xs text-muted-foreground">
          Note
        </label>
        <Textarea
          id="checkin-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What progress was made?"
          className="text-sm min-h-[60px]"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="checkin-blockers" className="text-xs text-muted-foreground">
            Blockers (optional)
          </label>
          <Textarea
            id="checkin-blockers"
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
            placeholder="Any blockers?"
            className="text-sm min-h-[40px]"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="checkin-next-steps" className="text-xs text-muted-foreground">
            Next Steps (optional)
          </label>
          <Textarea
            id="checkin-next-steps"
            value={nextSteps}
            onChange={(e) => setNextSteps(e.target.value)}
            placeholder="What's next?"
            className="text-sm min-h-[40px]"
          />
        </div>
      </div>

      <Button size="sm" onClick={handleSubmit} disabled={isPending}>
        {isPending ? "Submitting..." : "Submit Check-in"}
      </Button>
    </div>
  );
}

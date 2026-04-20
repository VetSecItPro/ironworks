import { ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const concurrencyPolicies = ["coalesce_if_active", "always_enqueue", "skip_if_active"];
const catchUpPolicies = ["skip_missed", "enqueue_missed_with_cap"];
const concurrencyPolicyDescriptions: Record<string, string> = {
  coalesce_if_active: "Keep one follow-up run queued while an active run is still working.",
  always_enqueue: "Queue every trigger occurrence, even if several runs stack up.",
  skip_if_active: "Drop overlapping trigger occurrences while the routine is already active.",
};
const catchUpPolicyDescriptions: Record<string, string> = {
  skip_missed: "Ignore schedule windows that were missed while the routine or scheduler was paused.",
  enqueue_missed_with_cap: "Catch up missed schedule windows in capped batches after recovery.",
};

export function AdvancedDeliverySettings({
  open,
  onOpenChange,
  concurrencyPolicy,
  onConcurrencyPolicyChange,
  catchUpPolicy,
  onCatchUpPolicyChange,
  runAfterId,
  onRunAfterIdChange,
  retryPolicy,
  onRetryPolicyChange,
  allRoutines,
  currentRoutineId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  concurrencyPolicy: string;
  onConcurrencyPolicyChange: (value: string) => void;
  catchUpPolicy: string;
  onCatchUpPolicyChange: (value: string) => void;
  runAfterId: string | undefined;
  onRunAfterIdChange: (value: string | undefined) => void;
  retryPolicy: string;
  onRetryPolicyChange: (value: string) => void;
  allRoutines: Array<{ id: string; title: string }>;
  currentRoutineId: string;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-medium">Advanced delivery settings</span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Concurrency</p>
            <Select value={concurrencyPolicy} onValueChange={onConcurrencyPolicyChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {concurrencyPolicies.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{concurrencyPolicyDescriptions[concurrencyPolicy]}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Catch-up</p>
            <Select value={catchUpPolicy} onValueChange={onCatchUpPolicyChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {catchUpPolicies.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{catchUpPolicyDescriptions[catchUpPolicy]}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Run After</p>
            <Select
              value={runAfterId ?? "none"}
              onValueChange={(value) => onRunAfterIdChange(value === "none" ? undefined : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {allRoutines
                  .filter((r) => r.id !== currentRoutineId)
                  .map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.title}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Chain this routine to run after another routine completes.</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Retry Policy</p>
            <Select value={retryPolicy ?? "none"} onValueChange={onRetryPolicyChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No retries</SelectItem>
                <SelectItem value="retry_1">1 retry</SelectItem>
                <SelectItem value="retry_3">3 retries</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {retryPolicy === "retry_1"
                ? "Retry once on failure before marking the run as failed."
                : retryPolicy === "retry_3"
                  ? "Retry up to 3 times on failure before marking the run as failed."
                  : "No automatic retries. Failed runs remain failed."}
            </p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
